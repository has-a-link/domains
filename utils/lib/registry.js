import fs from "node:fs";
import path from "node:path";

export function loadRegistry(domainsDir) {
  const files = fs
    .readdirSync(domainsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  return files.map((file) => {
    const filePath = path.join(domainsDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    let data = null;
    let parseError = null;

    try {
      data = JSON.parse(raw);
    } catch (error) {
      parseError = error;
    }

    return {
      file,
      filePath,
      subdomain: file.slice(0, -".json".length),
      raw,
      data,
      parseError
    };
  });
}

export function createRegistryMap(entries) {
  const map = new Map();

  for (const entry of entries) {
    map.set(entry.subdomain, entry);
  }

  return map;
}

export function domainDisplayPath(file) {
  return `domains/${file}`;
}
