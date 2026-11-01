import test from "ava";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../utils/lib/config.js";
import { parseArgs as parseSimulate, runSimulatePr } from "../utils/commands/simulate-pr.js";
import { parseArgs as parseSyncLabels, runSyncLabels } from "../utils/commands/sync-labels.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = loadConfig();
const validDomain = `{
  "owner": {
    "username": "alice"
  },
  "records": {
    "CNAME": "example.com"
  }
}
`;

function runCli(command, args) {
  return spawnSync(process.execPath, [path.join(root, "utils", "commands", command), ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

function createRegistry(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-command-"));
  const domains = path.join(directory, "domains");
  fs.mkdirSync(domains);

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(domains, fileName), content);
  }

  return { directory, domains };
}

test("simulate-pr command renders a scenario", async (t) => {
  const lines = [];
  const results = await runSimulatePr({
    scenario: "valid",
    write: (line) => lines.push(line),
    config
  });

  t.is(results.length, 1);
  t.true(lines[0].includes("## Scenario: valid"));
  t.true(lines[0].includes("All checks passed."));
});

test("simulate-pr command writes a summary file", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-summary-"));
  const summary = path.join(directory, "summary.md");
  const lines = [];

  try {
    await runSimulatePr({
      scenario: "valid",
      summary,
      write: (line) => lines.push(line),
      config
    });

    t.true(fs.readFileSync(summary, "utf8").includes("All checks passed."));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("simulate-pr command parses arguments", (t) => {
  t.deepEqual(parseSimulate(["--scenario", "valid", "--json"]), {
    scenario: "valid",
    summary: null,
    json: true,
    help: false
  });
  t.throws(() => parseSimulate(["--scenario"]), { message: /--scenario requires a value/ });
  t.throws(() => parseSimulate(["--unknown"]), { message: /Unknown argument/ });
});

test("sync-labels command uses the configured labels", async (t) => {
  const customConfig = {
    ...config,
    labels: {
      domain: {
        name: "domain",
        color: "1d76db",
        description: "Domain registration"
      }
    }
  };
  const calls = [];
  const client = {
    listRepositoryLabels: async () => [],
    createLabel: async (label) => calls.push(label),
    updateLabel: async () => {
      throw new Error("unexpected update");
    }
  };
  const lines = [];
  const actions = await runSyncLabels({
    client,
    config: customConfig,
    write: (line) => lines.push(line)
  });

  t.is(actions.length, 1);
  t.is(calls.length, 1);
  t.true(lines[0].includes("Created domain"));
});

test("sync-labels command parses arguments", (t) => {
  t.deepEqual(parseSyncLabels(["--dry-run", "--repo", "owner/repo"]), {
    dryRun: true,
    repo: "owner/repo",
    token: null,
    help: false
  });
  t.throws(() => parseSyncLabels(["--repo"]), { message: /--repo requires a value/ });
  t.throws(() => parseSyncLabels(["--unknown"]), { message: /Unknown argument/ });
});

test("command help output works", (t) => {
  for (const command of [
    "validate-pr.js",
    "simulate-pr.js",
    "sync-labels.js",
    "check-format-changed.js"
  ]) {
    const result = runCli(command, ["--help"]);

    t.is(result.status, 0, `${command} failed`);
    t.true(result.stdout.includes("Usage: node utils/commands/"));
  }
});

test("validate-pr command rejects an unknown argument", (t) => {
  const result = runCli("validate-pr.js", ["--unknown"]);

  t.is(result.status, 2);
  t.true(result.stderr.includes("Unknown argument: --unknown"));
});

test("validate-pr command reports a successful dry-run", (t) => {
  const base = createRegistry({});
  const head = createRegistry({ "new.json": validDomain });
  const changedFiles = path.join(base.directory, "changed.json");
  fs.writeFileSync(
    changedFiles,
    JSON.stringify([{ status: "added", filename: "domains/new.json" }], null, 2)
  );

  try {
    const result = runCli("validate-pr.js", [
      "--base-domains",
      base.domains,
      "--head-domains",
      head.domains,
      "--changed-files",
      changedFiles,
      "--body-file",
      path.join(root, "tests", "fixtures", "pr", "valid.md"),
      "--author",
      "alice",
      "--author-id",
      "10"
    ]);

    t.is(result.status, 0, result.stderr);
    t.true(result.stdout.includes("All checks passed."));
  } finally {
    fs.rmSync(base.directory, { recursive: true, force: true });
    fs.rmSync(head.directory, { recursive: true, force: true });
  }
});

test("simulate-pr command reports an unknown scenario", (t) => {
  const result = runCli("simulate-pr.js", ["--scenario", "unknown"]);

  t.is(result.status, 2);
  t.true(result.stderr.includes("Unknown scenario"));
});
