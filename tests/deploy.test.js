import test from "ava";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, runDeploy } from "../utils/commands/deploy.js";
import { buildDesiredState } from "../utils/lib/cloudflare/desired.js";
import { CloudflarePlanError } from "../utils/lib/cloudflare/plan.js";
import { loadConfig } from "../utils/lib/config.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = loadConfig();
const validFixtures = path.join(root, "tests", "fixtures", "valid");
const comment = config.cloudflare.comment;

function createClient() {
  const calls = [];
  const zoneRecords = [];

  return {
    calls,
    zoneRecords,
    getZone: async () => ({ id: "zone-id", name: config.cloudflare.zone }),
    listDnsRecords: async () => zoneRecords,
    createDnsRecord: async (record) => {
      calls.push({ action: "create", record });
      const created = { id: `created-${zoneRecords.length + 1}`, ...record };
      zoneRecords.push(created);
      return created;
    },
    updateDnsRecord: async (id, record) => {
      calls.push({ action: "update", id, record });
      const index = zoneRecords.findIndex((entry) => entry.id === id);

      if (index !== -1) {
        zoneRecords[index] = { ...zoneRecords[index], ...record };
        return zoneRecords[index];
      }

      return { id, ...record };
    },
    deleteDnsRecord: async (id) => {
      calls.push({ action: "delete", id });
      const index = zoneRecords.findIndex((entry) => entry.id === id);

      if (index !== -1) {
        zoneRecords.splice(index, 1);
      }

      return { id };
    }
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
    comment,
    ...overrides
  };
}

function desiredRecord(overrides = {}) {
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

test("deploy dry-run builds a plan without a client", async (t) => {
  const result = await runDeploy(
    {
      domains: validFixtures,
      apply: false,
      allowEmptyZone: true
    },
    {
      config,
      current: []
    }
  );

  t.is(result.desired.length, 10);
  t.is(result.plan.creates.length, 10);
  t.is(result.applied, null);
  t.is(result.backupPath, null);
});

test("deploy fail-on-drift rejects a non-empty plan", async (t) => {
  const error = await t.throwsAsync(() =>
    runDeploy(
      {
        domains: validFixtures,
        apply: false,
        allowEmptyZone: true,
        failOnDrift: true
      },
      {
        config,
        current: []
      }
    )
  );

  t.true(error instanceof CloudflarePlanError);
  t.is(error.code, "drift");
});

test("deploy fail-on-drift accepts an empty plan", async (t) => {
  const result = await runDeploy(
    {
      apply: false,
      failOnDrift: true
    },
    {
      config,
      current: [],
      desired: []
    }
  );

  t.is(result.plan.creates.length, 0);
});

test("deploy applies creates and verifies the result", async (t) => {
  const client = createClient();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-deploy-"));
  const backup = path.join(directory, "backup.json");

  try {
    const result = await runDeploy(
      {
        domains: validFixtures,
        apply: true,
        allowEmptyZone: true,
        backup,
        verify: true
      },
      {
        config,
        client,
        current: []
      }
    );

    t.is(result.applied.created.length, 10);
    t.is(result.applied.updated.length, 0);
    t.is(result.applied.deleted.length, 0);
    t.is(client.calls.filter((call) => call.action === "create").length, 10);
    t.true(fs.readFileSync(backup, "utf8").trim() === "[]");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("deploy applies updates and deletes", async (t) => {
  const client = createClient();
  client.zoneRecords.push(
    currentRecord({ id: "update", content: "93.184.216.34" }),
    currentRecord({ id: "delete", name: "old.has-a.link" })
  );
  const desired = [desiredRecord({ content: "93.184.216.35" })];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-deploy-"));
  const backup = path.join(directory, "backup.json");

  try {
    const result = await runDeploy(
      {
        apply: true,
        backup,
        verify: false
      },
      {
        config,
        client,
        current: client.zoneRecords,
        desired
      }
    );

    t.is(result.plan.updates.length, 1);
    t.is(result.plan.deletes.length, 1);
    t.is(result.applied.updated.length, 1);
    t.is(result.applied.deleted.length, 1);
    t.is(client.calls.filter((call) => call.action === "update").length, 1);
    t.is(client.calls.filter((call) => call.action === "delete").length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("deploy verifies the zone name", async (t) => {
  const client = {
    ...createClient(),
    getZone: async () => ({ id: "zone-id", name: "wrong.example" })
  };

  const error = await t.throwsAsync(() =>
    runDeploy(
      {
        apply: false
      },
      {
        config,
        client
      }
    )
  );

  t.true(error instanceof CloudflarePlanError);
  t.is(error.code, "zone_mismatch");
});

test("deploy uses a current records fixture", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-deploy-"));
  const currentFile = path.join(directory, "current.json");
  fs.writeFileSync(currentFile, JSON.stringify([currentRecord({ id: "current" })], null, 2));

  try {
    const result = await runDeploy(
      {
        domains: validFixtures,
        fromFile: currentFile,
        allowEmptyZone: true,
        apply: false
      },
      { config }
    );

    t.is(result.current.length, 1);
    t.true(result.plan.creates.length > 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("deploy rejects invalid registries", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-deploy-"));
  fs.writeFileSync(
    path.join(directory, "bad.json"),
    JSON.stringify({ owner: { username: "alice" }, records: { A: ["10.0.0.1"] } })
  );

  try {
    await t.throwsAsync(() =>
      runDeploy(
        {
          domains: directory,
          apply: false,
          allowEmptyZone: true
        },
        { config, current: [] }
      )
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("deploy parse arguments", (t) => {
  t.deepEqual(
    parseArgs([
      "--apply",
      "--allow-empty-zone",
      "--allow-mass-delete",
      "--domains",
      "domains",
      "--from-file",
      "current.json",
      "--backup",
      "backup.json",
      "--no-verify",
      "--fail-on-drift",
      "--json"
    ]),
    {
      apply: true,
      allowEmptyZone: true,
      allowMassDelete: true,
      domains: "domains",
      fromFile: "current.json",
      backup: "backup.json",
      verify: false,
      failOnDrift: true,
      json: true,
      help: false
    }
  );
  t.deepEqual(parseArgs(["--dry-run"]), {
    apply: false,
    allowEmptyZone: false,
    allowMassDelete: false,
    domains: null,
    fromFile: null,
    backup: null,
    verify: true,
    failOnDrift: false,
    json: false,
    help: false
  });
  t.throws(() => parseArgs(["--domains"]), { message: /--domains requires a value/ });
  t.throws(() => parseArgs(["--unknown"]), { message: /Unknown argument/ });
});

test("deploy CLI prints help", (t) => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "utils", "commands", "deploy.js"), "--help"],
    {
      cwd: root,
      encoding: "utf8"
    }
  );

  t.is(result.status, 0);
  t.true(result.stdout.includes("Usage: node utils/commands/deploy.js"));
});

test("deploy CLI prints a JSON dry-run", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-deploy-cli-"));
  const currentFile = path.join(directory, "current.json");
  fs.writeFileSync(currentFile, "[]");

  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "utils", "commands", "deploy.js"),
        "--domains",
        "tests/fixtures/valid",
        "--from-file",
        currentFile,
        "--allow-empty-zone",
        "--json"
      ],
      {
        cwd: root,
        encoding: "utf8"
      }
    );

    t.is(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    t.is(output.mode, "dry-run");
    t.is(output.summary.creates, 10);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
