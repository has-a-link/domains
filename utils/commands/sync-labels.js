import process from "node:process";
import { pathToFileURL } from "node:url";

import { loadConfig } from "../lib/config.js";
import { createGitHubClient } from "../lib/github/client.js";
import { formatLabelActions, syncLabels } from "../lib/github/labels.js";

function usage() {
  return [
    "Usage: node utils/commands/sync-labels.js [options]",
    "",
    "Options:",
    "  --dry-run    Show what would change without writing",
    "  --repo       Repository in owner/name format",
    "  --token      GitHub token",
    "  --help       Show this help"
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    dryRun: false,
    repo: null,
    token: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--repo") {
      options.repo = argv[index + 1];
      index += 1;

      if (!options.repo) {
        throw new Error("--repo requires a value.");
      }
    } else if (argument === "--token") {
      options.token = argv[index + 1];
      index += 1;

      if (!options.token) {
        throw new Error("--token requires a value.");
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

export async function runSyncLabels({
  token,
  repository,
  dryRun = false,
  config = loadConfig(),
  client = null,
  write = console.log
}) {
  const github =
    client ??
    createGitHubClient({
      token,
      repository
    });
  const actions = await syncLabels({
    client: github,
    labelsConfig: config.labels,
    dryRun
  });

  write(formatLabelActions(actions, { dryRun }));

  return actions;
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

  if (!token || !repository) {
    console.error("A GitHub token and repository are required.");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  try {
    await runSyncLabels({
      token,
      repository,
      dryRun: options.dryRun
    });
  } catch (error) {
    console.error(`Failed to sync labels: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
