import test from "ava";

import { CloudflarePlanError } from "../utils/lib/cloudflare/plan.js";
import { applyPlan, verifyDesiredState } from "../utils/lib/cloudflare/sync.js";
import { loadConfig } from "../utils/lib/config.js";

const config = loadConfig();
const comment = config.cloudflare.comment;

function record(overrides = {}) {
  return {
    type: "A",
    name: "new.has-a.link",
    content: "93.184.216.34",
    ttl: config.cloudflare.ttl,
    proxied: false,
    comment,
    ...overrides
  };
}

test("applyPlan dry-run performs no writes", async (t) => {
  const calls = [];
  const client = {
    createDnsRecord: async () => calls.push("create"),
    updateDnsRecord: async () => calls.push("update"),
    deleteDnsRecord: async () => calls.push("delete")
  };
  const result = await applyPlan({
    client,
    plan: {
      creates: [record()],
      updates: [{ current: record({ id: "1" }), desired: record() }],
      deletes: [record({ id: "2" })]
    },
    dryRun: true
  });

  t.true(result.dryRun);
  t.deepEqual(calls, []);
});

test("applyPlan deletes, creates, and updates in order", async (t) => {
  const calls = [];
  const client = {
    createDnsRecord: async (payload) => {
      calls.push({ action: "create", payload });
      return { id: "new", ...payload };
    },
    updateDnsRecord: async (id, payload) => {
      calls.push({ action: "update", id, payload });
      return { id, ...payload };
    },
    deleteDnsRecord: async (id) => {
      calls.push({ action: "delete", id });
      return { id };
    }
  };
  const result = await applyPlan({
    client,
    plan: {
      creates: [record()],
      updates: [
        {
          current: record({ id: "1" }),
          desired: record({ content: "93.184.216.35" })
        }
      ],
      deletes: [record({ id: "2" })]
    }
  });

  t.deepEqual(
    calls.map((call) => call.action),
    ["delete", "create", "update"]
  );
  t.is(result.created.length, 1);
  t.is(result.updated.length, 1);
  t.is(result.deleted.length, 1);
});

test("verifyDesiredState accepts a matching zone", async (t) => {
  const desired = [record()];
  const client = {
    listDnsRecords: async () => [{ id: "1", ...record() }]
  };
  const result = await verifyDesiredState({ client, desired, config });

  t.is(result.plan.noops.length, 1);
});

test("verifyDesiredState rejects a mismatched zone", async (t) => {
  const desired = [record()];
  const client = {
    listDnsRecords: async () => []
  };
  const error = await t.throwsAsync(() => verifyDesiredState({ client, desired, config }));

  t.true(error instanceof CloudflarePlanError);
  t.is(error.code, "verification_failed");
});
