import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { loadConfig } from "../lib/config.js";
import { createGitHubClient } from "../lib/github/client.js";
import { ensureLabels } from "../lib/github/labels.js";
import { PR_COMMENT_MARKER, renderPrComment } from "../lib/messages.js";
import { derivePullRequestLabels, validatePullRequest } from "../lib/pr.js";

function usage() {
  return [
    "Usage: node utils/commands/validate-pr.js [options]",
    "",
    "Required:",
    "  --base-domains <path>    Checkout of the base domains directory",
    "  --head-domains <path>    Checkout of the pull request domains directory",
    "",
    "Options:",
    "  --changed-files <path>   JSON file containing changed files",
    "  --pull-request <number>  Fetch changed files from GitHub",
    "  --body-file <path>       File containing the pull request body",
    "  --author <username>      Pull request author username",
    "  --author-id <id>         Pull request author ID",
    "  --repo <owner/name>     GitHub repository",
    "  --token <token>          GitHub token",
    "  --bot-login <login>      Bot account login",
    "  --api-base <url>         GitHub API base URL",
    "  --post                   Post the comment and labels",
    "  --json                   Print machine-readable JSON",
    "  --help                   Show this help"
  ].join("\n");
}

const VALUE_ARGUMENTS = new Map([
  ["--base-domains", "baseDomains"],
  ["--head-domains", "headDomains"],
  ["--changed-files", "changedFilesPath"],
  ["--pull-request", "pullRequest"],
  ["--body-file", "bodyFile"],
  ["--author", "author"],
  ["--author-id", "authorId"],
  ["--repo", "repo"],
  ["--token", "token"],
  ["--bot-login", "botLogin"],
  ["--api-base", "apiBase"]
]);

export function parseArgs(argv) {
  const options = {
    baseDomains: null,
    headDomains: null,
    changedFilesPath: null,
    pullRequest: null,
    bodyFile: null,
    author: null,
    authorId: null,
    repo: null,
    token: null,
    botLogin: null,
    apiBase: null,
    post: false,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--post") {
      options.post = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (VALUE_ARGUMENTS.has(argument)) {
      const value = argv[index + 1];

      if (!value) {
        throw new Error(`${argument} requires a value.`);
      }

      options[VALUE_ARGUMENTS.get(argument)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function readChangedFiles(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!Array.isArray(parsed)) {
    throw new Error("Changed files JSON must be an array.");
  }

  return parsed;
}

export async function runValidatePr(
  options,
  { client = null, config = loadConfig(), env = process.env } = {}
) {
  if (!options.baseDomains) {
    throw new Error("--base-domains is required.");
  }

  if (!options.headDomains) {
    throw new Error("--head-domains is required.");
  }

  const authorUsername = options.author ?? env.PR_AUTHOR;
  const authorId = options.authorId ?? env.PR_AUTHOR_ID;

  if (!authorUsername) {
    throw new Error("A pull request author is required.");
  }

  const repository = options.repo ?? env.GITHUB_REPOSITORY;
  const token = options.token ?? env.GITHUB_TOKEN ?? env.BOT_TOKEN;
  let github = client;

  if (!github && (options.post || !options.changedFilesPath)) {
    github = createGitHubClient({
      token,
      repository,
      apiBase: options.apiBase ?? env.GITHUB_API_URL ?? "https://api.github.com"
    });
  }

  let changedFiles;

  if (options.changedFilesPath) {
    changedFiles = readChangedFiles(options.changedFilesPath);
  } else {
    if (!options.pullRequest) {
      throw new Error("Provide --changed-files or --pull-request.");
    }

    changedFiles = await github.listPullRequestFiles(options.pullRequest);
  }

  const body = options.bodyFile ? fs.readFileSync(options.bodyFile, "utf8") : "";
  const author = {
    username: authorUsername,
    id: authorId === null || authorId === undefined ? undefined : Number(authorId)
  };
  const result = await validatePullRequest({
    baseDomainsDir: options.baseDomains,
    headDomainsDir: options.headDomains,
    changedFiles,
    author,
    body,
    config
  });
  const labels = derivePullRequestLabels({
    errors: result.errors,
    domainChanges: result.domainChanges,
    trusted: result.trusted,
    labelsConfig: config.labels
  });

  if (result.domainChanges.length === 0) {
    return {
      skipped: true,
      posted: false,
      valid: true,
      comment: "",
      labels,
      errors: [],
      domainChanges: []
    };
  }

  const comment = renderPrComment({
    errors: result.errors
  });
  let posted = false;

  if (options.post) {
    if (!options.pullRequest) {
      throw new Error("--pull-request is required when using --post.");
    }

    if (!github) {
      github = createGitHubClient({
        token,
        repository,
        apiBase: options.apiBase ?? env.GITHUB_API_URL ?? "https://api.github.com"
      });
    }

    if (labels.add.length > 0) {
      await ensureLabels({
        client: github,
        labelsConfig: config.labels,
        names: labels.add
      });
    }

    await github.upsertIssueComment({
      issueNumber: options.pullRequest,
      marker: PR_COMMENT_MARKER,
      body: comment,
      botLogin: options.botLogin ?? env.BOT_LOGIN ?? "github-actions[bot]"
    });

    if (labels.add.length > 0) {
      await github.addLabels(options.pullRequest, labels.add);
    }

    for (const label of labels.remove) {
      await github.removeLabelIfPresent(options.pullRequest, label);
    }

    posted = true;
  }

  return {
    skipped: false,
    posted,
    valid: result.errors.length === 0,
    comment,
    labels,
    errors: result.errors,
    domainChanges: result.domainChanges
  };
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  try {
    const result = await runValidatePr(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.skipped) {
      console.log("No domain changes.");
    } else if (options.post) {
      console.log(result.valid ? "Validation passed." : "Validation failed.");
      console.log(`Labels added: ${result.labels.add.join(", ") || "none"}`);
      console.log(`Labels removed: ${result.labels.remove.join(", ") || "none"}`);
    } else {
      console.log(result.comment);
    }

    process.exitCode = result.errors.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`Validation failed: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
