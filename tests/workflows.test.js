import test from "ava";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const workflowsDirectory = path.join(root, ".github", "workflows");
const emojiPattern = /\p{Extended_Pictographic}/u;

function readWorkflow(name) {
  return fs.readFileSync(path.join(workflowsDirectory, name), "utf8");
}

function parseWorkflow(name) {
  return parseYaml(readWorkflow(name));
}

const workflowFiles = fs
  .readdirSync(workflowsDirectory)
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));

test("workflow files contain no emojis", (t) => {
  for (const file of workflowFiles) {
    t.false(emojiPattern.test(readWorkflow(file)), `${file} contains an emoji`);
  }
});

test("all workflow actions are pinned to full commit SHAs", (t) => {
  for (const file of workflowFiles) {
    const workflow = parseWorkflow(file);

    for (const job of Object.values(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (step.uses) {
          t.regex(step.uses, /@[0-9a-f]{40}$/, `${file} uses an unpinned action: ${step.uses}`);
        }
      }
    }
  }
});

test("PR workflow uses pull_request_target and has the expected jobs", (t) => {
  const workflow = parseWorkflow("pr.yml");

  t.true(Boolean(workflow.on.pull_request_target));
  t.deepEqual(workflow.on.pull_request_target.types, [
    "opened",
    "reopened",
    "edited",
    "synchronize",
    "ready_for_review"
  ]);
  t.deepEqual(Object.keys(workflow.jobs), [
    "changes",
    "format-check",
    "domain-validation",
    "infra-tests",
    "gate"
  ]);
  t.is(workflow.jobs.gate.if, "always()");
  t.deepEqual(workflow.jobs.gate.needs, [
    "changes",
    "format-check",
    "domain-validation",
    "infra-tests"
  ]);
});

test("domain validation uses trusted base code and head data only", (t) => {
  const workflow = parseWorkflow("pr.yml");
  const job = workflow.jobs["domain-validation"];
  const baseCheckout = job.steps.find(
    (step) => step.uses?.startsWith("actions/checkout@") && step.with?.path === undefined
  );
  const headCheckout = job.steps.find(
    (step) => step.uses?.startsWith("actions/checkout@") && step.with?.path === "pr-head"
  );

  t.true(baseCheckout.with.ref.includes("pull_request.base.sha"));
  t.true(headCheckout.with.ref.includes("pull_request.head.sha"));
  t.is(headCheckout.with["sparse-checkout"], "domains");
  t.is(headCheckout.with["persist-credentials"], false);
  t.is(job.permissions.contents, "read");
  t.is(job.permissions["pull-requests"], "write");
  t.is(job.permissions.issues, "write");
});

test("infrastructure tests run pull request code with read-only permissions", (t) => {
  const workflow = parseWorkflow("pr.yml");
  const job = workflow.jobs["infra-tests"];
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));

  t.is(job.if, "needs.changes.outputs.infra == 'true'");
  t.deepEqual(job.permissions, { contents: "read" });
  t.true(checkout.with.ref.includes("pull_request.head.sha"));
  t.is(checkout.with["persist-credentials"], false);
  t.false(JSON.stringify(job).includes("secrets."));
  t.true(job.steps.some((step) => step.run === "npm run test:ci"));
});

test("format checks run pull request code with read-only permissions", (t) => {
  const workflow = parseWorkflow("pr.yml");
  const job = workflow.jobs["format-check"];
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));

  t.deepEqual(job.permissions, { contents: "read", "pull-requests": "read" });
  t.true(checkout.with.ref.includes("pull_request.head.sha"));
  t.is(checkout.with["persist-credentials"], false);
  t.false(JSON.stringify(job).includes("CLOUDFLARE"));
  t.false(JSON.stringify(job).includes("BOT_TOKEN"));
  t.true(job.steps.some((step) => step.run?.includes("check-format-changed.js")));
});

test("simulate and sync-label workflows are manual", (t) => {
  for (const file of ["simulate-pr.yml", "sync-labels.yml"]) {
    const workflow = parseWorkflow(file);

    t.true(Boolean(workflow.on.workflow_dispatch), `${file} should be manual`);
  }

  const syncLabels = parseWorkflow("sync-labels.yml");

  t.is(syncLabels.permissions.issues, "write");
});
