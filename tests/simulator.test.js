import test from "ava";

import { runAllScenarios, runScenario, SCENARIOS } from "../utils/lib/simulator.js";

test("simulator exposes all scenarios", (t) => {
  t.deepEqual(Object.keys(SCENARIOS), [
    "valid",
    "invalid-record",
    "owner-mismatch",
    "template-incomplete",
    "formatting",
    "deletion",
    "merge-conflict"
  ]);
});

test("simulator: valid", async (t) => {
  const result = await runScenario("valid");

  t.true(result.valid);
  t.deepEqual(result.errors, []);
  t.true(result.comment.includes("All checks passed."));
});

test("simulator: invalid record", async (t) => {
  const result = await runScenario("invalid-record");

  t.false(result.valid);
  t.true(result.comment.includes("10.0.0.1"));
  t.true(result.comment.includes("not a public address"));
});

test("simulator: owner mismatch", async (t) => {
  const result = await runScenario("owner-mismatch");

  t.false(result.valid);
  t.true(result.comment.includes("does not match the pull request author"));
});

test("simulator: incomplete template", async (t) => {
  const result = await runScenario("template-incomplete");

  t.false(result.valid);
  t.true(result.comment.includes("requirement has not been checked"));
});

test("simulator: formatting", async (t) => {
  const result = await runScenario("formatting");

  t.false(result.valid);
  t.true(result.comment.includes("not formatted"));
});

test("simulator: deletion", async (t) => {
  const result = await runScenario("deletion");

  t.false(result.valid);
  t.true(result.comment.includes("not authorized to delete"));
});

test("simulator: merge conflict", async (t) => {
  const result = await runScenario("merge-conflict");

  t.true(result.comment.includes("has-a-link-bot: merge-conflict"));
  t.true(result.comment.includes("conflicts with the `main` branch"));
});

test("simulator: all scenarios", async (t) => {
  const results = await runAllScenarios();

  t.is(results.length, 7);
  t.deepEqual(
    results.map((result) => result.name),
    Object.keys(SCENARIOS)
  );
});

test("simulator: unknown scenario throws", async (t) => {
  await t.throwsAsync(() => runScenario("unknown"), {
    message: /Unknown scenario/
  });
});
