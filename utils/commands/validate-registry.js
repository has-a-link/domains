import path from "node:path";
import process from "node:process";

import { getDomainsDirectory, loadConfig } from "../lib/config.js";
import { formatErrors, formatValidationResult } from "../lib/format.js";
import { validateRegistry } from "../lib/validation/index.js";

function usage() {
  return [
    "Usage: node utils/commands/validate-registry.js [options]",
    "",
    "Options:",
    "  --domains <path>  Validate a specific domains directory",
    "  --json            Print machine-readable JSON",
    "  --help            Show this help"
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    domains: null,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--domains") {
      options.domains = argv[index + 1];
      index += 1;

      if (!options.domains) {
        throw new Error("--domains requires a path.");
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function main() {
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
    const config = loadConfig();
    const domainsDir = options.domains
      ? path.resolve(process.cwd(), options.domains)
      : getDomainsDirectory();
    const result = validateRegistry({ domainsDir, config });

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            valid: result.errors.length === 0,
            count: result.entries.length,
            errors: result.errors
          },
          null,
          2
        )
      );
    } else if (result.errors.length > 0) {
      console.error(formatErrors(result.errors));
      console.error("");
      console.error(
        `${result.errors.length} validation error(s) across ${result.entries.length} domain file(s).`
      );
    } else {
      console.log(formatValidationResult(result));
    }

    process.exitCode = result.errors.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`Validation failed: ${error.message}`);
    process.exitCode = 2;
  }
}

main();
