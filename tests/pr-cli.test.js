import test from "ava";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../utils/lib/config.js";
import { parseArgs, runValidatePr } from "../utils/commands/validate-pr.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = loadConfig();
const bodyFile = path.join(root, "tests", "fixtures", "pr", "valid.md");

const validDomain = `{
  "owner": {
    "username": "alice"
  },
  "records": {
    "CNAME": "example.com"
  }
}
`;

const invalidDomain = `{
  "owner": {
    "username": "alice"
  },
  "records": {
    "A": ["10.0.0.1"]
  }
}
`;

function createWorkspace(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-validate-pr-"));
  const domains = path.join(directory, "domains");
  fs.mkdirSync(domains);

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(domains, fileName), content);
  }

  return { directory, domains };
}

function writeChangedFiles(directory, files) {
  const filePath = path.join(directory, "changed.json");
  fs.writeFileSync(filePath, JSON.stringify(files, null, 2));
  return filePath;
}

function createClient(config) {
  const calls = [];

  return {
    calls,
    listRepositoryLabels: async () => Object.values(config.labels),
    createLabel: async (label) => calls.push({ action: "create", label }),
    updateLabel: async (name, label) => calls.push({ action: "update", name, label }),
    upsertIssueComment: async (options) => {
      calls.push({ action: "comment", options });
      return { action: "created" };
    },
    addLabels: async (issueNumber, labels) => calls.push({ action: "add", issueNumber, labels }),
    removeLabelIfPresent: async (issueNumber, label) =>
      calls.push({ action: "remove", issueNumber, label })
  };
}

test("validate-pr CLI: valid dry-run", async (t) => {
  const base = createWorkspace({});
  const head = createWorkspace({ "new.json": validDomain });
  const changedFiles = writeChangedFiles(base.directory, [
    { status: "added", filename: "domains/new.json" }
  ]);

  try {
    const result = await runValidatePr(
      {
        baseDomains: base.domains,
        headDomains: head.domains,
        changedFilesPath: changedFiles,
        bodyFile,
        author: "alice",
        authorId: "10"
      },
      { config }
    );

    t.true(result.valid);
    t.false(result.posted);
    t.true(result.comment.includes("All checks passed."));
    t.deepEqual(result.labels.add, ["domain"]);
  } finally {
    fs.rmSync(base.directory, { recursive: true, force: true });
    fs.rmSync(head.directory, { recursive: true, force: true });
  }
});

test("validate-pr CLI: invalid dry-run", async (t) => {
  const base = createWorkspace({});
  const head = createWorkspace({ "new.json": invalidDomain });
  const changedFiles = writeChangedFiles(base.directory, [
    { status: "added", filename: "domains/new.json" }
  ]);

  try {
    const result = await runValidatePr(
      {
        baseDomains: base.domains,
        headDomains: head.domains,
        changedFilesPath: changedFiles,
        bodyFile,
        author: "alice",
        authorId: "10"
      },
      { config }
    );

    t.false(result.valid);
    t.true(result.comment.includes("10.0.0.1"));
    t.true(result.labels.add.includes("reason: invalid"));
  } finally {
    fs.rmSync(base.directory, { recursive: true, force: true });
    fs.rmSync(head.directory, { recursive: true, force: true });
  }
});

test("validate-pr CLI: posts comment and labels", async (t) => {
  const base = createWorkspace({});
  const head = createWorkspace({ "new.json": validDomain });
  const changedFiles = writeChangedFiles(base.directory, [
    { status: "added", filename: "domains/new.json" }
  ]);
  const client = createClient(config);

  try {
    const result = await runValidatePr(
      {
        baseDomains: base.domains,
        headDomains: head.domains,
        changedFilesPath: changedFiles,
        bodyFile,
        author: "alice",
        authorId: "10",
        pullRequest: "5",
        post: true
      },
      { client, config }
    );

    t.true(result.posted);
    t.true(result.valid);
    t.true(client.calls.some((call) => call.action === "comment"));
    t.true(client.calls.some((call) => call.action === "add"));
    t.true(result.labels.remove.includes("reason: invalid"));
  } finally {
    fs.rmSync(base.directory, { recursive: true, force: true });
    fs.rmSync(head.directory, { recursive: true, force: true });
  }
});

test("validate-pr CLI: skips when no domain files changed", async (t) => {
  const base = createWorkspace({});
  const head = createWorkspace({});
  const changedFiles = writeChangedFiles(base.directory, [
    { status: "modified", filename: "README.md" }
  ]);

  try {
    const result = await runValidatePr(
      {
        baseDomains: base.domains,
        headDomains: head.domains,
        changedFilesPath: changedFiles,
        bodyFile,
        author: "alice"
      },
      { config }
    );

    t.true(result.skipped);
    t.false(result.posted);
    t.is(result.comment, "");
  } finally {
    fs.rmSync(base.directory, { recursive: true, force: true });
    fs.rmSync(head.directory, { recursive: true, force: true });
  }
});

test("validate-pr CLI: requires a changed-file source", async (t) => {
  const base = createWorkspace({});
  const head = createWorkspace({});

  try {
    await t.throwsAsync(
      () =>
        runValidatePr(
          {
            baseDomains: base.domains,
            headDomains: head.domains,
            bodyFile,
            author: "alice"
          },
          { client: createClient(config), config }
        ),
      { message: /Provide --changed-files or --pull-request/ }
    );
  } finally {
    fs.rmSync(base.directory, { recursive: true, force: true });
    fs.rmSync(head.directory, { recursive: true, force: true });
  }
});

test("validate-pr CLI parses arguments", (t) => {
  t.deepEqual(
    parseArgs([
      "--base-domains",
      "base",
      "--head-domains",
      "head",
      "--changed-files",
      "changed.json",
      "--body-file",
      "body.md",
      "--author",
      "alice",
      "--author-id",
      "10",
      "--post",
      "--json"
    ]),
    {
      baseDomains: "base",
      headDomains: "head",
      changedFilesPath: "changed.json",
      pullRequest: null,
      bodyFile: "body.md",
      author: "alice",
      authorId: "10",
      repo: null,
      token: null,
      botLogin: null,
      apiBase: null,
      post: true,
      json: true,
      help: false
    }
  );
  t.throws(() => parseArgs(["--base-domains"]), {
    message: /--base-domains requires a value/
  });
  t.throws(() => parseArgs(["--unknown"]), { message: /Unknown argument/ });
});
