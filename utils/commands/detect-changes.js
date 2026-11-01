import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { classifyChangedFiles } from "../lib/changes.js";
import { createGitHubClient } from "../lib/github/client.js";

function usage() {
  return [
    "Usage: node utils/commands/detect-changes.js [options]",
    "",
    "Options:",
    "  --pull-request <number>  Pull request number",
    "  --json                   Print JSON instead of GitHub outputs",
    "  --help                   Show this help"
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    pullRequest: null,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--pull-request") {
      options.pullRequest = argv[index + 1];
      index += 1;

      if (!options.pullRequest) {
        throw new Error("--pull-request requires a value.");
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

export async function runDetectChanges({
  client,
  pullRequest,
  json = false,
  env = process.env,
  write = console.log
}) {
  const number = pullRequest ?? env.PR_NUMBER;

  if (!number) {
    throw new Error("A pull request number is required.");
  }

  const files = await client.listPullRequestFiles(number);
  const result = classifyChangedFiles(files);

  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      `domain=${result.domain}\ninfra=${result.infra}\ndocs=${result.docs}\n`
    );
  }

  if (json) {
    write(JSON.stringify(result, null, 2));
  } else if (!env.GITHUB_OUTPUT) {
    write(`domain=${result.domain}`);
    write(`infra=${result.infra}`);
    write(`docs=${result.docs}`);
  }

  return result;
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

  const token = process.env.GITHUB_TOKEN ?? process.env.BOT_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const pullRequest = options.pullRequest ?? process.env.PR_NUMBER;

  if (!token || !repository || !pullRequest) {
    console.error("A GitHub token, repository, and pull request number are required.");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  try {
    await runDetectChanges({
      client: createGitHubClient({ token, repository }),
      pullRequest,
      json: options.json,
      env: {
        ...process.env,
        GITHUB_OUTPUT: options.json ? "" : process.env.GITHUB_OUTPUT
      }
    });
  } catch (error) {
    console.error(`Failed to detect changes: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
