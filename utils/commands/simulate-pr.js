import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { loadConfig, REPO_ROOT } from "../lib/config.js";
import { runAllScenarios, runScenario, SCENARIOS } from "../lib/simulator.js";

function usage() {
  return [
    "Usage: node utils/commands/simulate-pr.js [options]",
    "",
    "Options:",
    "  --scenario <name>  Scenario name or all",
    "  --summary <path>   Append rendered output to a summary file",
    "  --json             Print machine-readable JSON",
    "  --help             Show this help",
    "",
    `Scenarios: all, ${Object.keys(SCENARIOS).join(", ")}`
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    scenario: "all",
    summary: null,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--scenario") {
      options.scenario = argv[index + 1];
      index += 1;

      if (!options.scenario) {
        throw new Error("--scenario requires a value.");
      }
    } else if (argument === "--summary") {
      options.summary = argv[index + 1];
      index += 1;

      if (!options.summary) {
        throw new Error("--summary requires a value.");
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function formatScenario(result) {
  return `## Scenario: ${result.name}\n\n${result.comment}`;
}

export async function runSimulatePr({
  scenario = "all",
  summary = null,
  json = false,
  root = REPO_ROOT,
  config = loadConfig(),
  write = console.log
} = {}) {
  const results =
    scenario === "all"
      ? await runAllScenarios({ root, config })
      : [await runScenario(scenario, { root, config })];

  if (json) {
    write(JSON.stringify(results, null, 2));
  } else {
    write(results.map(formatScenario).join("\n"));
  }

  if (summary) {
    fs.appendFileSync(summary, `${results.map(formatScenario).join("\n")}\n`);
  }

  return results;
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
    await runSimulatePr(options);
    process.exitCode = 0;
  } catch (error) {
    console.error(`Simulation failed: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
