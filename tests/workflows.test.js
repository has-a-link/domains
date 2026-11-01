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

test("CI runs for infrastructure changes and never for domains", (t) => {
  const workflow = parseWorkflow("ci.yml");

  t.deepEqual(workflow.on.push.branches, ["main"]);
  t.true(workflow.on.push.paths.includes("tests/**"));
  t.true(workflow.on.push.paths.includes("utils/**"));
  t.true(workflow.on.push.paths.includes("config/**"));
  t.true(workflow.on.push.paths.includes("messages/**"));
  t.true(workflow.on.push.paths.includes("schema/**"));
  t.false(workflow.on.push.paths.includes("domains/**"));
  t.true(Object.hasOwn(workflow.on, "workflow_dispatch"));
  t.deepEqual(workflow.permissions, { contents: "read" });
});

test("prettier workflow is scheduled and can create a pull request", (t) => {
  const workflow = parseWorkflow("prettier.yml");

  t.true(Array.isArray(workflow.on.schedule));
  t.is(workflow.permissions.contents, "write");
  t.is(workflow.permissions["pull-requests"], "write");
  t.true(JSON.stringify(workflow.jobs).includes("messages/maintenance/prettier-pr.md"));
});

test("stale workflow uses message files and the stale label", (t) => {
  const workflow = parseWorkflow("stale.yml");
  const job = workflow.jobs.stale;
  const serialized = JSON.stringify(job);

  t.true(Array.isArray(workflow.on.schedule));
  t.is(workflow.permissions.issues, "write");
  t.true(serialized.includes("messages/stale/issue.md"));
  t.true(serialized.includes("messages/stale/close-issue.md"));
  t.true(serialized.includes("stale-issue-label"));
  t.true(job.steps.some((step) => step.uses?.startsWith("actions/stale@")));
});

test("branch updater is scheduled and can write labels", (t) => {
  const workflow = parseWorkflow("update-branches.yml");

  t.true(Array.isArray(workflow.on.schedule));
  t.is(workflow.permissions.contents, "write");
  t.is(workflow.permissions.issues, "write");
  t.true(workflow.jobs.update.steps.some((step) => step.run?.includes("update-branches.js")));
});

test("audit workflow is scheduled and checks drift in production", (t) => {
  const workflow = parseWorkflow("audit.yml");

  t.true(Array.isArray(workflow.on.schedule));
  t.deepEqual(Object.keys(workflow.jobs), ["audit", "drift"]);
  t.is(workflow.jobs.drift.environment, "production");
  t.true(workflow.jobs.drift.steps.some((step) => step.run?.includes("--fail-on-drift")));
});

test("deploy workflow is production-scoped and applies only intentionally", (t) => {
  const workflow = parseWorkflow("deploy.yml");

  t.deepEqual(workflow.on.push.branches, ["main"]);
  t.true(workflow.on.push.paths.includes("domains/**"));
  t.true(workflow.on.push.paths.includes("config/**"));
  t.true(Boolean(workflow.on.workflow_dispatch.inputs.apply));
  t.deepEqual(Object.keys(workflow.jobs), ["validate", "deploy"]);
  t.is(workflow.jobs.deploy.environment, "production");
  t.is(workflow.jobs.deploy.needs, "validate");
  t.false(JSON.stringify(workflow.jobs.validate).includes("CLOUDFLARE_API_TOKEN"));
  t.true(JSON.stringify(workflow.jobs.deploy).includes("secrets.CLOUDFLARE_API_TOKEN"));

  const upload = workflow.jobs.deploy.steps.find((step) =>
    step.uses?.startsWith("actions/upload-artifact@")
  );

  t.truthy(upload);
  t.regex(upload.uses, /@[0-9a-f]{40}$/);
});
