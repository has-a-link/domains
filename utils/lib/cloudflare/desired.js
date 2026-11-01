import { loadConfig } from "../config.js";
import { validateRegistry } from "../validation/index.js";

export class RegistryValidationError extends Error {
  constructor(errors) {
    super(`Registry validation failed with ${errors.length} error(s).`);
    this.name = "RegistryValidationError";
    this.errors = errors;
  }
}

export function normaliseContent(type, content) {
  if (type === "CNAME" || type === "MX") {
    return content.toLowerCase().replace(/\.$/, "");
  }

  return content;
}

export function desiredRecordKey(record) {
  return [
    record.type.toUpperCase(),
    record.name.toLowerCase(),
    normaliseContent(record.type, record.content),
    record.priority ?? ""
  ].join("|");
}

export function sortDesiredRecords(records) {
  return [...records].sort((left, right) => {
    const leftKey = desiredRecordKey(left);
    const rightKey = desiredRecordKey(right);

    if (leftKey < rightKey) return -1;
    if (leftKey > rightKey) return 1;
    return 0;
  });
}

export function buildDesiredRecords(entries, config) {
  const zone = config.cloudflare.zone;
  const records = [];

  for (const entry of entries) {
    if (entry.parseError || !entry.data?.records) {
      continue;
    }

    const name = `${entry.subdomain}.${zone}`;
    const proxied = entry.data.proxied === true;
    const ttl = proxied ? config.cloudflare.proxiedTtl : config.cloudflare.ttl;
    const comment = config.cloudflare.comment;
    const recordsForEntry = entry.data.records;

    for (const content of recordsForEntry.A ?? []) {
      records.push({
        type: "A",
        name,
        content,
        ttl,
        proxied,
        comment
      });
    }

    for (const content of recordsForEntry.AAAA ?? []) {
      records.push({
        type: "AAAA",
        name,
        content,
        ttl,
        proxied,
        comment
      });
    }

    if (recordsForEntry.CNAME !== undefined) {
      records.push({
        type: "CNAME",
        name,
        content: normaliseContent("CNAME", recordsForEntry.CNAME),
        ttl,
        proxied,
        comment
      });
    }

    for (const content of recordsForEntry.TXT ?? []) {
      records.push({
        type: "TXT",
        name,
        content,
        ttl: config.cloudflare.ttl,
        proxied: false,
        comment
      });
    }

    for (const record of recordsForEntry.MX ?? []) {
      records.push({
        type: "MX",
        name,
        content: normaliseContent("MX", record.target),
        priority: record.priority,
        ttl: config.cloudflare.ttl,
        proxied: false,
        comment
      });
    }
  }

  return sortDesiredRecords(records);
}

export function buildDesiredState({ domainsDir, config = loadConfig() } = {}) {
  const result = validateRegistry({ domainsDir, config });

  if (result.errors.length > 0) {
    throw new RegistryValidationError(result.errors);
  }

  return {
    entries: result.entries,
    records: buildDesiredRecords(result.entries, config)
  };
}

export function desiredNames(records) {
  return new Set(records.map((record) => record.name.toLowerCase()));
}
