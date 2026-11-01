import test from "ava";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../utils/lib/config.js";
import { MERGE_CONFLICT_MARKER } from "../utils/lib/messages.js";
import { runUpdateBranches } from "../utils/commands/update-branches.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = loadConfig();

function createClient() {
  const calls = [];
  const comments = new Map([
    [
      1,
      [
        {
          id: 10,
          body: MERGE_CONFLICT_MARKER,
          user: { login: "github-actions[bot]", type: "Bot" }
        },
        {
          id: 11,
          body: MERGE_CONFLICT_MARKER,
          user: { login: "someone", type: "User" }
        }
      ]
    ],
    [2, []],
    [3, []]
  ]);

  return {
    calls,
    listOpenPullRequests: async () => [{ number: 1 }, { number: 2 }, { number: 3 }],
    updatePullRequestBranch: async (number) => {
      calls.push({ action: "update", number });

      if (number !== 1) {
        throw new Error("merge conflict");
      }
    },
    removeLabelIfPresent: async (number, label) =>
      calls.push({ action: "remove-label", number, label }),
    listIssueComments: async (number) => comments.get(number) ?? [],
    deleteIssueComment: async (id) => calls.push({ action: "delete-comment", id }),
    getPullRequest: async (number) => {
      return { number, mergeable: number === 3 };
    },
    listRepositoryLabels: async () => Object.values(config.labels),
    createLabel: async () => {
      throw new Error("unexpected create");
    },
    updateLabel: async () => {
      throw new Error("unexpected update");
    },
    addLabels: async (number, labels) => calls.push({ action: "add-label", number, labels }),
    upsertIssueComment: async (options) => calls.push({ action: "upsert-comment", options })
  };
}

test("update branches handles updated, conflicting, and skipped pull requests", async (t) => {
  const client = createClient();
  const lines = [];
  const results = await runUpdateBranches({
    client,
    config,
    write: (line) => lines.push(line)
  });

  t.deepEqual(
    results.map((result) => result.action),
    ["updated", "conflict", "skipped"]
  );
  t.true(client.calls.some((call) => call.action === "remove-label" && call.number === 1));
  t.true(client.calls.some((call) => call.action === "delete-comment" && call.id === 10));
  t.false(client.calls.some((call) => call.action === "delete-comment" && call.id === 11));
  t.true(client.calls.some((call) => call.action === "add-label" && call.number === 2));
  t.true(
    client.calls.some(
      (call) =>
        call.action === "upsert-comment" &&
        call.options.issueNumber === 2 &&
        call.options.marker === MERGE_CONFLICT_MARKER
    )
  );
  t.true(lines.some((line) => line.includes("Marked #2")));
});

test("update branches handles no open pull requests", async (t) => {
  const results = await runUpdateBranches({
    client: {
      listOpenPullRequests: async () => []
    },
    config,
    write: () => {}
  });

  t.deepEqual(results, []);
});

test("update branches CLI prints help", (t) => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "utils", "commands", "update-branches.js"), "--help"],
    {
      cwd: root,
      encoding: "utf8"
    }
  );

  t.is(result.status, 0);
  t.true(result.stdout.includes("Usage: node utils/commands/update-branches.js"));
});
