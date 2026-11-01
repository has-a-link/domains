import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { checkFormatting, formatErrors } from "../lib/format.js";
import { createGitHubClient } from "../lib/github/client.js";

const CHECKABLE_EXTENSIONS = /\.(js|json|md|ya?ml)$/i;

function usage() {
  return [
    "Usage: node utils/commands/check-format-changed.js [options]",
    "",
    "Options:",
    "  --pull-request <number>  Pull request number",
    "  --repo <owner/name>      GitHub repository",
    "  --token <token>          GitHub token",
    "  --api-base <url>         GitHub API base URL",
    "  --json                   Print machine-readable JSON",
    "  --help                   Show this help"
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    pullRequest: null,
    repo: null,
    token: null,
    apiBase: null,
    json: false,
    help: false
  };
  const valueArguments = new Map([
    ["--pull-request", "pullRequest"],
    ["--repo", "repo"],
    ["--token", "token"],
    ["--api-base", "apiBase"]
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (valueArguments.has(argument)) {
      const value = argv[index + 1];

      if (!value) {
        throw new Error(`${argument} requires a value.`);
      }

      options[valueArguments.get(argument)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

export async function runCheckFormatChanged({
  client,
  pullRequest,
  root = process.cwd(),
  json = false,
  write = console.log
}) {
  const files = await client.listPullRequestFiles(pullRequest);
  const candidates = files
    .filter(
      (file) =>
        file.status !== "removed" &&
        CHECKABLE_EXTENSIONS.test(file.filename) &&
        file.filename !== "package-lock.json"
    )
    .map((file) => file.filename)
    .filter((fileName) => fs.existsSync(path.join(root, fileName)));
  const errors = await checkFormatting(
    candidates.map((fileName) => path.join(root, fileName)),
    { displayPath: (filePath) => path.relative(root, filePath) }
  );

  if (json) {
    write(JSON.stringify({ valid: errors.length === 0, errors }, null, 2));
  } else if (errors.length > 0) {
    write(formatErrors(errors));
  } else {
    write("Changed files are formatted.");
  }

  return errors;
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

  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.BOT_TOKEN;
  const repository = options.repo ?? process.env.GITHUB_REPOSITORY;
  const pullRequest = options.pullRequest ?? process.env.PR_NUMBER;

  if (!token || !repository || !pullRequest) {
    console.error("A GitHub token, repository, and pull request number are required.");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  try {
    const errors = await runCheckFormatChanged({
      client: createGitHubClient({
        token,
        repository,
        apiBase: options.apiBase ?? process.env.GITHUB_API_URL ?? "https://api.github.com"
      }),
      pullRequest,
      json: options.json
    });

    process.exitCode = errors.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`Formatting check failed: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
