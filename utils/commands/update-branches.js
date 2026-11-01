import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { loadConfig } from "../lib/config.js";
import { createGitHubClient } from "../lib/github/client.js";
import { ensureLabels } from "../lib/github/labels.js";
import { MERGE_CONFLICT_MARKER, renderMergeConflict } from "../lib/messages.js";

export async function runUpdateBranches({
  client,
  config = loadConfig(),
  botLogin = "github-actions[bot]",
  write = console.log,
  messagesRoot = path.join(config.root, "messages")
} = {}) {
  const pullRequests = await client.listOpenPullRequests();
  const results = [];

  for (const pullRequest of pullRequests) {
    try {
      await client.updatePullRequestBranch(pullRequest.number);
      await client.removeLabelIfPresent(pullRequest.number, config.labels.mergeConflict.name);

      const comments = await client.listIssueComments(pullRequest.number);

      for (const comment of comments) {
        if (
          comment.body?.includes(MERGE_CONFLICT_MARKER) &&
          (comment.user?.login === botLogin || comment.user?.type === "Bot")
        ) {
          await client.deleteIssueComment(comment.id);
        }
      }

      write(`Updated #${pullRequest.number}`);
      results.push({ number: pullRequest.number, action: "updated" });
    } catch (error) {
      const updated = await client.getPullRequest(pullRequest.number);

      if (updated.mergeable !== false) {
        write(`Could not update #${pullRequest.number}: ${error.message}`);
        results.push({
          number: pullRequest.number,
          action: "skipped",
          error: error.message
        });
        continue;
      }

      await ensureLabels({
        client,
        labelsConfig: config.labels,
        names: [config.labels.mergeConflict.name]
      });
      await client.addLabels(pullRequest.number, [config.labels.mergeConflict.name]);
      await client.upsertIssueComment({
        issueNumber: pullRequest.number,
        marker: MERGE_CONFLICT_MARKER,
        body: renderMergeConflict({ root: messagesRoot }),
        botLogin
      });
      write(`Marked #${pullRequest.number} as having merge conflicts.`);
      results.push({ number: pullRequest.number, action: "conflict" });
    }
  }

  return results;
}

function usage() {
  return "Usage: node utils/commands/update-branches.js";
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const token = process.env.GITHUB_TOKEN ?? process.env.BOT_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    console.error("A GitHub token and repository are required.");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  try {
    await runUpdateBranches({
      client: createGitHubClient({ token, repository }),
      botLogin: process.env.BOT_LOGIN ?? "github-actions[bot]"
    });
  } catch (error) {
    console.error(`Failed to update branches: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
