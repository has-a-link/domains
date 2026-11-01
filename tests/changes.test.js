import test from "ava";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  classifyChangedFiles,
  isDocumentationFile,
  isDomainFile,
  isInfrastructureFile
} from "../utils/lib/changes.js";
import { parseArgs, runDetectChanges } from "../utils/commands/detect-changes.js";

test("change classification detects domain files", (t) => {
  const result = classifyChangedFiles([{ filename: "domains/example.json", status: "added" }]);

  t.deepEqual(result, { domain: true, infra: false, docs: false });
});

test("change classification detects infrastructure files", (t) => {
  const result = classifyChangedFiles([
    { filename: "utils/lib/validation/index.js", status: "modified" },
    { filename: "package.json", status: "modified" }
  ]);

  t.deepEqual(result, { domain: false, infra: true, docs: false });
});

test("change classification detects documentation files", (t) => {
  const result = classifyChangedFiles([
    { filename: "README.md", status: "modified" },
    { filename: "docs/registering.md", status: "modified" }
  ]);

  t.deepEqual(result, { domain: false, infra: false, docs: true });
});

test("change classification includes renamed paths", (t) => {
  const result = classifyChangedFiles([
    {
      filename: "domains/new.json",
      previous_filename: "domains/old.json",
      status: "renamed"
    }
  ]);

  t.deepEqual(result, { domain: true, infra: false, docs: false });
});

test("change classification handles empty lists", (t) => {
  t.deepEqual(classifyChangedFiles([]), { domain: false, infra: false, docs: false });
});

test("file predicates are strict", (t) => {
  t.true(isDomainFile("domains/example.json"));
  t.false(isDomainFile("domains/example.md"));
  t.false(isDomainFile("example.json"));
  t.true(isInfrastructureFile(".github/workflows/pr.yml"));
  t.true(isInfrastructureFile("tests/validation.test.js"));
  t.false(isInfrastructureFile("domains/example.json"));
  t.true(isDocumentationFile("README.md"));
  t.true(isDocumentationFile("docs/registering.md"));
  t.false(isDocumentationFile("domains/example.json"));
});

test("detect changes writes GitHub outputs", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-detect-"));
  const outputFile = path.join(directory, "output.txt");
  const client = {
    listPullRequestFiles: async () => [
      { filename: "domains/example.json", status: "added" },
      { filename: "package.json", status: "modified" }
    ]
  };
  const lines = [];
  const result = await runDetectChanges({
    client,
    pullRequest: "12",
    env: { GITHUB_OUTPUT: outputFile },
    write: (line) => lines.push(line)
  });

  t.deepEqual(result, { domain: true, infra: true, docs: false });
  t.is(fs.readFileSync(outputFile, "utf8"), "domain=true\ninfra=true\ndocs=false\n");
  t.deepEqual(lines, []);

  fs.rmSync(directory, { recursive: true, force: true });
});

test("detect changes supports JSON output", async (t) => {
  const client = {
    listPullRequestFiles: async () => [{ filename: "README.md", status: "modified" }]
  };
  const lines = [];
  const result = await runDetectChanges({
    client,
    pullRequest: "12",
    json: true,
    env: { GITHUB_OUTPUT: "" },
    write: (line) => lines.push(line)
  });

  t.deepEqual(result, { domain: false, infra: false, docs: true });
  t.deepEqual(JSON.parse(lines[0]), result);
});

test("detect changes parses arguments", (t) => {
  t.deepEqual(parseArgs(["--pull-request", "42", "--json"]), {
    pullRequest: "42",
    json: true,
    help: false
  });
  t.deepEqual(parseArgs(["--help"]), {
    pullRequest: null,
    json: false,
    help: true
  });
  t.throws(() => parseArgs(["--unknown"]), { message: /Unknown argument/ });
  t.throws(() => parseArgs(["--pull-request"]), {
    message: /--pull-request requires a value/
  });
});
