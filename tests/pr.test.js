import test from "ava";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as prettier from "prettier";

import { loadConfig } from "../utils/lib/config.js";
import {
  derivePullRequestLabels,
  listDomainChanges,
  validatePullRequest
} from "../utils/lib/pr.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = loadConfig();

async function writeRegistry(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-pr-"));

  for (const [fileName, content] of Object.entries(files)) {
    const output =
      typeof content === "string"
        ? content
        : await prettier.format(JSON.stringify(content), {
            parser: "json",
            printWidth: 100,
            tabWidth: 2,
            trailingComma: "none",
            endOfLine: "lf"
          });

    fs.writeFileSync(path.join(directory, fileName), output);
  }

  return directory;
}

function readBody(name) {
  return fs.readFileSync(path.join(root, "tests", "fixtures", "pr", name), "utf8");
}

async function runScenario({
  base = {},
  head = {},
  changedFiles,
  author = { username: "alice", id: 10 },
  bodyFile = "valid.md",
  configOverride = null
}) {
  const baseDirectory = await writeRegistry(base);
  const headDirectory = await writeRegistry(head);

  try {
    return await validatePullRequest({
      baseDomainsDir: baseDirectory,
      headDomainsDir: headDirectory,
      changedFiles,
      author,
      body: readBody(bodyFile),
      config: configOverride ?? config
    });
  } finally {
    fs.rmSync(baseDirectory, { recursive: true, force: true });
    fs.rmSync(headDirectory, { recursive: true, force: true });
  }
}

function codesFor(errors) {
  return [...new Set(errors.map((error) => error.code))].sort();
}

const validDomain = {
  owner: { username: "alice" },
  records: { A: ["93.184.216.34"] }
};

test("PR: valid added domain", async (t) => {
  const result = await runScenario({
    head: { "new.json": validDomain },
    changedFiles: [{ status: "added", filename: "domains/new.json" }]
  });

  t.deepEqual(result.errors, []);
  t.is(result.domainChanges.length, 1);
});

test("PR: invalid record", async (t) => {
  const result = await runScenario({
    head: {
      "new.json": {
        owner: { username: "alice" },
        records: { A: ["10.0.0.1"] }
      }
    },
    changedFiles: [{ status: "added", filename: "domains/new.json" }]
  });

  t.true(codesFor(result.errors).includes("private_a"));
});

test("PR: owner mismatch", async (t) => {
  const result = await runScenario({
    head: {
      "new.json": {
        owner: { username: "bob" },
        records: { CNAME: "example.com" }
      }
    },
    changedFiles: [{ status: "added", filename: "domains/new.json" }]
  });

  t.true(codesFor(result.errors).includes("owner_mismatch"));
});

test("PR: incomplete template", async (t) => {
  const result = await runScenario({
    head: { "new.json": validDomain },
    changedFiles: [{ status: "added", filename: "domains/new.json" }],
    bodyFile: "missing-checkbox.md"
  });

  t.true(codesFor(result.errors).includes("template_missing_checkbox"));
});

test("PR: trusted maintainer bypasses the template check", async (t) => {
  const trustedConfig = structuredClone(config);
  trustedConfig.trustedUsers = [{ username: "maintainer", id: 1 }];
  const result = await runScenario({
    head: { "new.json": validDomain },
    changedFiles: [{ status: "added", filename: "domains/new.json" }],
    author: { username: "maintainer", id: 1 },
    bodyFile: "missing-checkbox.md",
    configOverride: trustedConfig
  });

  t.deepEqual(result.errors, []);
});

test("PR: owner can delete a domain", async (t) => {
  const result = await runScenario({
    base: {
      "old.json": {
        owner: { username: "alice" },
        records: { CNAME: "example.com" }
      }
    },
    changedFiles: [{ status: "removed", filename: "domains/old.json" }]
  });

  t.deepEqual(result.errors, []);
});

test("PR: unrelated user cannot delete a domain", async (t) => {
  const result = await runScenario({
    base: {
      "old.json": {
        owner: { username: "bob" },
        records: { CNAME: "example.com" }
      }
    },
    changedFiles: [{ status: "removed", filename: "domains/old.json" }]
  });

  t.true(codesFor(result.errors).includes("unauthorized_delete"));
});

test("PR: owner cannot transfer a domain without admin", async (t) => {
  const result = await runScenario({
    base: {
      "new.json": {
        owner: { username: "alice" },
        records: { CNAME: "example.com" }
      }
    },
    head: {
      "new.json": {
        owner: { username: "bob" },
        records: { CNAME: "example.com" }
      }
    },
    changedFiles: [{ status: "modified", filename: "domains/new.json" }]
  });

  t.deepEqual(codesFor(result.errors), ["owner_change", "owner_mismatch"]);
});

test("PR: owner can rename a domain", async (t) => {
  const result = await runScenario({
    base: {
      "old.json": {
        owner: { username: "alice" },
        records: { CNAME: "example.com" }
      }
    },
    head: {
      "new.json": {
        owner: { username: "alice" },
        records: { CNAME: "example.com" }
      }
    },
    changedFiles: [
      {
        status: "renamed",
        filename: "domains/new.json",
        previous_filename: "domains/old.json"
      }
    ]
  });

  t.deepEqual(result.errors, []);
});

test("PR: unrelated user cannot rename a domain", async (t) => {
  const result = await runScenario({
    base: {
      "old.json": {
        owner: { username: "bob" },
        records: { CNAME: "example.com" }
      }
    },
    head: {
      "new.json": {
        owner: { username: "alice" },
        records: { CNAME: "example.com" }
      }
    },
    changedFiles: [
      {
        status: "renamed",
        filename: "domains/new.json",
        previous_filename: "domains/old.json"
      }
    ]
  });

  t.true(codesFor(result.errors).includes("unauthorized_rename"));
});

test("PR: unformatted domain file", async (t) => {
  const result = await runScenario({
    head: {
      "new.json": '{"owner":{"username":"alice"},"records":{"CNAME":"example.com"}}'
    },
    changedFiles: [{ status: "added", filename: "domains/new.json" }]
  });

  t.true(codesFor(result.errors).includes("not_formatted"));
});

test("PR: deleting a parent reports the orphaned child", async (t) => {
  const result = await runScenario({
    base: {
      "parent.json": validDomain,
      "blog.parent.json": {
        owner: { username: "alice" },
        records: { CNAME: "blog.example.com" }
      }
    },
    head: {
      "blog.parent.json": {
        owner: { username: "alice" },
        records: { CNAME: "blog.example.com" }
      }
    },
    changedFiles: [{ status: "removed", filename: "domains/parent.json" }]
  });

  t.true(codesFor(result.errors).includes("missing_parent"));
});

test("PR: no domain changes", async (t) => {
  const result = await runScenario({
    changedFiles: [{ status: "modified", filename: "README.md" }]
  });

  t.deepEqual(result.errors, []);
  t.deepEqual(result.domainChanges, []);
});

test("listDomainChanges handles statuses and display paths", (t) => {
  const changes = listDomainChanges([
    { status: "added", filename: "domains/added.json" },
    { status: "modified", filename: "domains/modified.json" },
    { status: "removed", filename: "domains/removed.json" },
    {
      status: "renamed",
      filename: "domains/new.json",
      previous_filename: "domains/old.json"
    },
    { status: "copied", filename: "domains/copied.json" },
    { status: "changed", filename: "domains/changed.json" }
  ]);

  t.deepEqual(
    changes.map((change) => change.changeType),
    ["added", "modified", "deleted", "renamed", "added", "modified"]
  );
  t.is(changes[3].file, "domains/old.json -> domains/new.json");
  t.is(changes[0].file, "domains/added.json");
  t.is(changes[2].file, "domains/removed.json");
});

test("derivePullRequestLabels adds and removes the expected labels", (t) => {
  const labels = derivePullRequestLabels({
    errors: [
      {
        code: "owner_mismatch",
        file: "domains/test.json",
        path: "owner",
        detail: "Mismatch."
      },
      {
        code: "not_formatted",
        file: "domains/test.json",
        path: "file",
        detail: "Format."
      }
    ],
    domainChanges: [{ file: "domains/test.json" }],
    trusted: false,
    labelsConfig: config.labels
  });

  t.deepEqual(labels.add.sort(), [
    "domain",
    "reason: invalid",
    "reason: not-formatted",
    "reason: owner-mismatch"
  ]);
  t.deepEqual(labels.remove.sort(), ["maintainer", "reason: incomplete-template"]);
});

test("derivePullRequestLabels handles a valid trusted pull request", (t) => {
  const labels = derivePullRequestLabels({
    errors: [],
    domainChanges: [{ file: "domains/test.json" }],
    trusted: true,
    labelsConfig: config.labels
  });

  t.deepEqual(labels.add.sort(), ["domain", "maintainer"]);
  t.deepEqual(labels.remove.sort(), [
    "reason: incomplete-template",
    "reason: invalid",
    "reason: not-formatted",
    "reason: owner-mismatch"
  ]);
});
