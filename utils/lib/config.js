import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const CONFIG_FILES = Object.freeze({
  recordTypes: "record-types.json",
  limits: "limits.json",
  reservedSubdomains: "reserved-subdomains.json",
  blockedSubdomains: "blocked-subdomains.json",
  internalSubdomains: "internal-subdomains.json",
  blockedCnameTargets: "blocked-cname-targets.json",
  blockedIpRanges: "blocked-ip-ranges.json",
  protectedDnsRecords: "protected-dns-records.json",
  trustedUsers: "trusted-users.json",
  labels: "labels.json",
  prTemplate: "pr-template.json",
  cloudflare: "cloudflare.json"
});

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON from ${filePath}: ${error.message}`);
  }
}

export function loadConfig(root = REPO_ROOT) {
  const configDir = path.join(root, "config");
  const config = { root, configDir };

  for (const [key, fileName] of Object.entries(CONFIG_FILES)) {
    config[key] = readJson(path.join(configDir, fileName));
  }

  return config;
}

export function loadSchema(root = REPO_ROOT) {
  return readJson(path.join(root, "schema", "domain.schema.json"));
}

export function getDomainsDirectory(root = REPO_ROOT) {
  return path.join(root, "domains");
}
