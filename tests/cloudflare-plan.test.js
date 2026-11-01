import test from "ava";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesiredRecords,
  buildDesiredState,
  RegistryValidationError
} from "../utils/lib/cloudflare/desired.js";
import {
  CloudflarePlanError,
  formatPlan,
  isProtectedRecord,
  normaliseRecord,
  planDnsChanges,
  relativeName,
  summarizePlan,
  toCreatePayload,
  toUpdatePayload,
  validatePlanSafety
} from "../utils/lib/cloudflare/plan.js";
import { loadConfig } from "../utils/lib/config.js";
import { loadRegistry } from "../utils/lib/registry.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = loadConfig();
const validFixtures = path.join(root, "tests", "fixtures", "valid");

function desiredRecord(overrides = {}) {
  return {
    type: "A",
    name: "new.has-a.link",
    content: "93.184.216.34",
    ttl: config.cloudflare.ttl,
    proxied: false,
    comment: config.cloudflare.comment,
    ...overrides
  };
}

function currentRecord(overrides = {}) {
  return {
    id: "record-1",
    type: "A",
    name: "new.has-a.link",
    content: "93.184.216.34",
    ttl: config.cloudflare.ttl,
    proxied: false,
    comment: config.cloudflare.comment,
    ...overrides
  };
}

test("desired records are built from the valid fixtures", (t) => {
  const records = buildDesiredRecords(loadRegistry(validFixtures), config);
  const byType = (type) => records.filter((record) => record.type === type);

  t.is(records.length, 10);
  t.is(byType("A").length, 3);
  t.is(byType("AAAA").length, 1);
  t.is(byType("CNAME").length, 3);
  t.is(byType("MX").length, 1);
  t.is(byType("TXT").length, 2);
  t.true(records.every((record) => record.comment === config.cloudflare.comment));

  const proxied = records.find((record) => record.name === "proxied.has-a.link");
  t.true(proxied.proxied);
  t.is(proxied.ttl, config.cloudflare.proxiedTtl);

  const mail = records.find((record) => record.type === "MX");
  t.is(mail.priority, 10);
  t.is(mail.content, "mx1.example.com");
  t.false(mail.proxied);
});

test("buildDesiredState validates the registry", (t) => {
  const result = buildDesiredState({ domainsDir: validFixtures, config });

  t.is(result.entries.length, 9);
  t.is(result.records.length, 10);
});

test("buildDesiredState rejects invalid registries", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-desired-"));
  fs.writeFileSync(
    path.join(directory, "bad.json"),
    JSON.stringify({
      owner: { username: "alice" },
      records: { A: ["10.0.0.1"] }
    })
  );

  try {
    const error = t.throws(() => buildDesiredState({ domainsDir: directory, config }));

    t.true(error instanceof RegistryValidationError);
    t.true(error.errors.some((entry) => entry.code === "private_a"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("plan creates missing records", (t) => {
  const plan = planDnsChanges({
    desired: [desiredRecord()],
    current: [],
    config
  });

  t.is(plan.creates.length, 1);
  t.is(plan.updates.length, 0);
  t.is(plan.deletes.length, 0);
  t.is(plan.noops.length, 0);
  t.is(plan.conflicts.length, 0);
});

test("plan reports exact managed records as no-ops", (t) => {
  const plan = planDnsChanges({
    desired: [desiredRecord()],
    current: [currentRecord()],
    config
  });

  t.is(plan.noops.length, 1);
  t.is(plan.updates.length, 0);
});

test("plan updates a managed record with changed content", (t) => {
  const plan = planDnsChanges({
    desired: [desiredRecord({ content: "93.184.216.35" })],
    current: [currentRecord()],
    config
  });

  t.is(plan.updates.length, 1);
  t.is(plan.updates[0].current.id, "record-1");
});

test("plan adopts an untagged exact record", (t) => {
  const plan = planDnsChanges({
    desired: [desiredRecord()],
    current: [currentRecord({ comment: "" })],
    config
  });

  t.is(plan.updates.length, 1);
  t.is(plan.conflicts.length, 0);
});

test("plan reports an untagged conflicting record", (t) => {
  const plan = planDnsChanges({
    desired: [desiredRecord({ content: "93.184.216.35" })],
    current: [currentRecord({ comment: "" })],
    config
  });

  t.is(plan.conflicts.length, 1);
  t.is(plan.creates.length, 0);
});

test("plan deletes managed records that are no longer desired", (t) => {
  const plan = planDnsChanges({
    desired: [],
    current: [currentRecord({ id: "managed" }), currentRecord({ id: "unmanaged", comment: "" })],
    config
  });

  t.deepEqual(
    plan.deletes.map((record) => record.id),
    ["managed"]
  );
});

test("plan does not delete protected records", (t) => {
  const plan = planDnsChanges({
    desired: [],
    current: [
      currentRecord({
        id: "protected",
        name: "www.has-a.link",
        type: "TXT",
        content: "verification=value",
        comment: config.cloudflare.comment
      })
    ],
    config
  });

  t.is(plan.deletes.length, 0);
});

test("plan rejects desired records at protected names", (t) => {
  const error = t.throws(() =>
    planDnsChanges({
      desired: [desiredRecord({ name: "www.has-a.link" })],
      current: [],
      config
    })
  );

  t.true(error instanceof CloudflarePlanError);
  t.is(error.code, "protected_desired");
});

test("plan reports CNAME and non-CNAME conflicts for unmanaged records", (t) => {
  const plan = planDnsChanges({
    desired: [desiredRecord({ name: "old.has-a.link", type: "A" })],
    current: [
      currentRecord({
        id: "cname",
        name: "old.has-a.link",
        type: "CNAME",
        content: "example.com",
        comment: ""
      })
    ],
    config
  });

  t.is(plan.conflicts.length, 1);
});

test("plan replaces a managed CNAME with an A record", (t) => {
  const plan = planDnsChanges({
    desired: [desiredRecord({ name: "old.has-a.link", type: "A" })],
    current: [
      currentRecord({
        id: "cname",
        name: "old.has-a.link",
        type: "CNAME",
        content: "example.com",
        comment: config.cloudflare.comment
      })
    ],
    config
  });

  t.is(plan.creates.length, 1);
  t.is(plan.deletes.length, 1);
});

test("plan safety blocks an empty zone", (t) => {
  const desired = [desiredRecord()];
  const plan = planDnsChanges({ desired, current: [], config });
  const error = t.throws(() => validatePlanSafety({ plan, current: [], desired, config }));

  t.true(error instanceof CloudflarePlanError);
  t.is(error.code, "empty_zone");
  t.notThrows(() =>
    validatePlanSafety({
      plan,
      current: [],
      desired,
      config,
      allowEmptyZone: true
    })
  );
});

test("plan safety blocks mass deletion", (t) => {
  const limit = config.cloudflare.maxDeletionsPerRun;
  const current = Array.from({ length: limit + 1 }, (_, index) =>
    currentRecord({
      id: `record-${index}`,
      name: `old-${index}.has-a.link`
    })
  );
  const plan = planDnsChanges({ desired: [], current, config });
  const error = t.throws(() => validatePlanSafety({ plan, current, desired: [], config }));

  t.true(error instanceof CloudflarePlanError);
  t.is(error.code, "mass_deletion");
  t.notThrows(() =>
    validatePlanSafety({
      plan,
      current,
      desired: [],
      config,
      allowMassDelete: true
    })
  );
});

test("plan safety blocks conflicts", (t) => {
  const desired = [desiredRecord({ content: "93.184.216.35" })];
  const current = [currentRecord({ comment: "" })];
  const plan = planDnsChanges({ desired, current, config });
  const error = t.throws(() => validatePlanSafety({ plan, current, desired, config }));

  t.is(error.code, "conflicts");
});

test("protected records and relative names are identified", (t) => {
  t.true(isProtectedRecord({ name: "www.has-a.link", type: "A" }, config));
  t.true(isProtectedRecord({ name: "_acme-challenge.foo.has-a.link", type: "TXT" }, config));
  t.true(isProtectedRecord({ name: "foo.has-a.link", type: "NS" }, config));
  t.is(relativeName("foo.has-a.link", "has-a.link"), "foo");
  t.is(relativeName("has-a.link", "has-a.link"), "@");
});

test("plan payloads and formatting are correct", (t) => {
  const desired = desiredRecord({ proxied: true, ttl: 1 });
  const current = currentRecord();

  t.deepEqual(toCreatePayload(desired), {
    type: "A",
    name: "new.has-a.link",
    content: "93.184.216.34",
    ttl: 1,
    proxied: true,
    comment: config.cloudflare.comment
  });
  t.deepEqual(toUpdatePayload(desired), {
    content: "93.184.216.34",
    ttl: 1,
    proxied: true,
    comment: config.cloudflare.comment
  });

  const normalised = normaliseRecord({
    type: "cname",
    name: "NEW.HAS-A.LINK",
    content: "Example.COM.",
    ttl: "300",
    comment: null
  });
  t.is(normalised.type, "CNAME");
  t.is(normalised.name, "new.has-a.link");
  t.is(normalised.content, "example.com");
  t.is(normalised.comment, "");

  const plan = planDnsChanges({
    desired: [desiredRecord({ content: "93.184.216.35" })],
    current: [current],
    config
  });
  const summary = summarizePlan(plan);
  const output = formatPlan(plan);

  t.is(summary.updates, 1);
  t.true(output.includes("Creates: 0"));
  t.true(output.includes("Updates: 1"));
  t.true(output.includes("~ A new.has-a.link"));
});
