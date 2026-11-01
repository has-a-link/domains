import test from "ava";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliPath = path.join(root, "utils", "commands", "validate-registry.js");

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("CLI validates the valid fixtures", (t) => {
  const result = runCli(["--domains", "tests/fixtures/valid"]);

  t.is(result.status, 0, result.stderr);
  t.true(result.stdout.includes("Validated 9 domain file(s)."));
});

test("CLI reports invalid files", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-cli-"));
  fs.writeFileSync(path.join(directory, "bad.json"), "{");

  try {
    const result = runCli(["--domains", directory]);

    t.is(result.status, 1);
    t.true(result.stderr.includes("[invalid_json]"));
    t.true(result.stderr.includes("1 validation error(s)"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI supports JSON output", (t) => {
  const result = runCli(["--domains", "tests/fixtures/valid", "--json"]);

  t.is(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);

  t.true(output.valid);
  t.is(output.count, 9);
  t.deepEqual(output.errors, []);
});

test("CLI shows help", (t) => {
  const result = runCli(["--help"]);

  t.is(result.status, 0);
  t.true(result.stdout.includes("Usage: node utils/commands/validate-registry.js"));
});

test("CLI rejects unknown arguments", (t) => {
  const result = runCli(["--unknown"]);

  t.is(result.status, 2);
  t.true(result.stderr.includes("Unknown argument: --unknown"));
});

test("CLI requires a path after --domains", (t) => {
  const result = runCli(["--domains"]);

  t.is(result.status, 2);
  t.true(result.stderr.includes("--domains requires a path."));
});

test("CLI reports a missing registry directory", (t) => {
  const result = runCli(["--domains", path.join(os.tmpdir(), "has-a-link-missing-registry")]);

  t.is(result.status, 2);
  t.true(result.stderr.includes("Validation failed:"));
});
