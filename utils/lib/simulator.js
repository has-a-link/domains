import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as prettier from "prettier";

import { loadConfig, REPO_ROOT } from "./config.js";
import { renderMergeConflict, renderPrComment } from "./messages.js";
import { validatePullRequest } from "./pr.js";

const VALID_BODY = "valid.md";
const INVALID_BODY = "missing-checkbox.md";

export const SCENARIOS = {
  valid: {
    base: {},
    head: {
      "new.json": {
        owner: { username: "alice" },
        records: { A: ["93.184.216.34"] }
      }
    },
    changedFiles: [{ status: "added", filename: "domains/new.json" }],
    author: { username: "alice", id: 10 },
    bodyFile: VALID_BODY
  },
  "invalid-record": {
    base: {},
    head: {
      "new.json": {
        owner: { username: "alice" },
        records: { A: ["10.0.0.1"] }
      }
    },
    changedFiles: [{ status: "added", filename: "domains/new.json" }],
    author: { username: "alice", id: 10 },
    bodyFile: VALID_BODY
  },
  "owner-mismatch": {
    base: {},
    head: {
      "new.json": {
        owner: { username: "bob" },
        records: { CNAME: "example.com" }
      }
    },
    changedFiles: [{ status: "added", filename: "domains/new.json" }],
    author: { username: "alice", id: 10 },
    bodyFile: VALID_BODY
  },
  "template-incomplete": {
    base: {},
    head: {
      "new.json": {
        owner: { username: "alice" },
        records: { CNAME: "example.com" }
      }
    },
    changedFiles: [{ status: "added", filename: "domains/new.json" }],
    author: { username: "alice", id: 10 },
    bodyFile: INVALID_BODY
  },
  formatting: {
    base: {},
    head: {
      "new.json": '{"owner":{"username":"alice"},"records":{"CNAME":"example.com"}}'
    },
    changedFiles: [{ status: "added", filename: "domains/new.json" }],
    author: { username: "alice", id: 10 },
    bodyFile: VALID_BODY
  },
  deletion: {
    base: {
      "old.json": {
        owner: { username: "bob" },
        records: { CNAME: "example.com" }
      }
    },
    head: {},
    changedFiles: [{ status: "removed", filename: "domains/old.json" }],
    author: { username: "alice", id: 10 },
    bodyFile: VALID_BODY
  },
  "merge-conflict": {
    base: {},
    head: {},
    changedFiles: [],
    author: { username: "alice", id: 10 },
    bodyFile: VALID_BODY,
    special: "merge-conflict"
  }
};

async function writeFiles(directory, files) {
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
}

export async function runScenario(name, { root = REPO_ROOT, config = loadConfig() } = {}) {
  const scenario = SCENARIOS[name];

  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  const messagesRoot = path.join(root, "messages");

  if (scenario.special === "merge-conflict") {
    return {
      name,
      valid: false,
      errors: [],
      comment: renderMergeConflict({ root: messagesRoot }),
      domainChanges: []
    };
  }

  const baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-base-"));
  const headDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-head-"));

  try {
    await writeFiles(baseDirectory, scenario.base);
    await writeFiles(headDirectory, scenario.head);

    const body = fs.readFileSync(
      path.join(root, "tests", "fixtures", "pr", scenario.bodyFile),
      "utf8"
    );
    const result = await validatePullRequest({
      baseDomainsDir: baseDirectory,
      headDomainsDir: headDirectory,
      changedFiles: scenario.changedFiles,
      author: scenario.author,
      body,
      config
    });

    return {
      name,
      valid: result.errors.length === 0,
      errors: result.errors,
      comment: renderPrComment({
        errors: result.errors,
        root: messagesRoot
      }),
      domainChanges: result.domainChanges
    };
  } finally {
    fs.rmSync(baseDirectory, { recursive: true, force: true });
    fs.rmSync(headDirectory, { recursive: true, force: true });
  }
}

export async function runAllScenarios(options = {}) {
  const results = [];

  for (const name of Object.keys(SCENARIOS)) {
    results.push(await runScenario(name, options));
  }

  return results;
}
