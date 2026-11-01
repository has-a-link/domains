import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { createCloudflareClient } from "../lib/cloudflare/client.js";
import { buildDesiredState, RegistryValidationError } from "../lib/cloudflare/desired.js";
import {
  CloudflarePlanError,
  formatPlan,
  planDnsChanges,
  summarizePlan,
  validatePlanSafety
} from "../lib/cloudflare/plan.js";
import { applyPlan, verifyDesiredState } from "../lib/cloudflare/sync.js";
import { loadConfig } from "../lib/config.js";
import { formatErrors } from "../lib/errors.js";

function usage() {
  return [
    "Usage: node utils/commands/deploy.js [options]",
    "",
    "Options:",
    "  --apply              Apply the planned changes",
    "  --dry-run            Preview changes without writing (default)",
    "  --allow-empty-zone   Allow changes when Cloudflare returns no records",
    "  --allow-mass-delete  Allow deletions above the configured limit",
    "  --domains <path>     Registry directory",
    "  --from-file <path>   Use current DNS records from a JSON file",
    "  --backup <path>      Backup path for --apply",
    "  --no-verify          Skip post-apply verification",
    "  --json               Print machine-readable JSON",
    "  --help               Show this help"
  ].join("\n");
}

const VALUE_ARGUMENTS = new Map([
  ["--domains", "domains"],
  ["--from-file", "fromFile"],
  ["--backup", "backup"]
]);

export function parseArgs(argv) {
  const options = {
    apply: false,
    allowEmptyZone: false,
    allowMassDelete: false,
    domains: null,
    fromFile: null,
    backup: null,
    verify: true,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--dry-run") {
      options.apply = false;
    } else if (argument === "--allow-empty-zone") {
      options.allowEmptyZone = true;
    } else if (argument === "--allow-mass-delete") {
      options.allowMassDelete = true;
    } else if (argument === "--no-verify") {
      options.verify = false;
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

function readCurrentRecords(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const records = Array.isArray(parsed) ? parsed : parsed.result;

  if (!Array.isArray(records)) {
    throw new Error("Current DNS records JSON must be an array or a Cloudflare result envelope.");
  }

  return records;
}

export async function runDeploy(
  options,
  { config = loadConfig(), client = null, current = null, desired = null, env = process.env } = {}
) {
  const domainsDir = options.domains
    ? path.resolve(options.domains)
    : path.join(config.root, "domains");
  const desiredRecords = desired ?? buildDesiredState({ domainsDir, config }).records;
  let currentRecords = current;
  let cloudflare = client;

  if (!currentRecords && options.fromFile) {
    currentRecords = readCurrentRecords(options.fromFile);
  }

  if (!currentRecords) {
    if (!cloudflare) {
      cloudflare = createCloudflareClient({
        token: options.token ?? env.CLOUDFLARE_API_TOKEN,
        zoneId: options.zoneId ?? env.CLOUDFLARE_ZONE_ID,
        apiBase: options.apiBase ?? env.CLOUDFLARE_API_URL
      });
    }

    const zone = await cloudflare.getZone();

    if (zone?.name !== config.cloudflare.zone) {
      throw new CloudflarePlanError(
        `Cloudflare zone "${zone?.name ?? "unknown"}" does not match ${config.cloudflare.zone}.`,
        { code: "zone_mismatch" }
      );
    }

    currentRecords = await cloudflare.listDnsRecords();
  }

  const plan = planDnsChanges({
    desired: desiredRecords,
    current: currentRecords,
    config
  });

  validatePlanSafety({
    plan,
    current: currentRecords,
    desired: desiredRecords,
    config,
    allowEmptyZone: options.allowEmptyZone,
    allowMassDelete: options.allowMassDelete
  });

  if (!options.apply) {
    return {
      config,
      desired: desiredRecords,
      current: currentRecords,
      plan,
      applied: null,
      backupPath: null
    };
  }

  if (!cloudflare) {
    throw new Error("Applying changes requires a Cloudflare client or credentials.");
  }

  const backupPath =
    options.backup ?? path.join(config.root, "deploy-artifacts", "cloudflare-before.json");
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, `${JSON.stringify(currentRecords, null, 2)}\n`);

  const applied = await applyPlan({
    client: cloudflare,
    plan
  });

  if (options.verify !== false) {
    await verifyDesiredState({
      client: cloudflare,
      desired: desiredRecords,
      config
    });
  }

  return {
    config,
    desired: desiredRecords,
    current: currentRecords,
    plan,
    applied,
    backupPath
  };
}

function formatResult(result, { apply }) {
  const lines = [
    `Zone: ${result.config.cloudflare.zone}`,
    `Mode: ${apply ? "apply" : "dry-run"}`,
    `Desired records: ${result.desired.length}`,
    `Current records: ${result.current.length}`,
    "",
    formatPlan(result.plan)
  ];

  if (apply) {
    lines.push("", `Backup: ${result.backupPath}`);
  } else {
    lines.push("", "Dry run: no changes were applied.");
  }

  return lines.join("\n");
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
    const result = await runDeploy(options);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            mode: options.apply ? "apply" : "dry-run",
            zone: result.config.cloudflare.zone,
            desiredCount: result.desired.length,
            currentCount: result.current.length,
            summary: summarizePlan(result.plan),
            actions: result.plan,
            applied: result.applied,
            backupPath: result.backupPath
          },
          null,
          2
        )
      );
    } else {
      console.log(formatResult(result, { apply: options.apply }));
    }
  } catch (error) {
    if (error instanceof RegistryValidationError) {
      console.error("Registry validation failed:");
      console.error(formatErrors(error.errors));
      process.exitCode = 1;
      return;
    }

    if (error instanceof CloudflarePlanError) {
      console.error(error.message);

      if (error.details?.creates) {
        console.error(formatPlan(error.details));
      }

      process.exitCode = 1;
      return;
    }

    console.error(`Deployment failed: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
