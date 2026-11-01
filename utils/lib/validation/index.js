import { parseTree } from "jsonc-parser";

import { getDomainsDirectory, loadConfig } from "../config.js";
import { ERROR_CODES, createError, dedupeErrors, sortErrors } from "../errors.js";
import { createRegistryMap, domainDisplayPath, loadRegistry } from "../registry.js";
import { validateFilename } from "./filename.js";
import {
  authorizeDomainChange,
  isAdminUser,
  isTrustedUser,
  ownerUsername,
  validateOwner
} from "./owner.js";
import { validateRecords } from "./records.js";
import { validateSchema } from "./schema.js";
import { validatePullRequestTemplate } from "./template.js";

export function findDuplicateKeys(raw) {
  const duplicates = new Set();
  const tree = parseTree(raw);

  if (!tree) {
    return [];
  }

  function visit(node) {
    if (!node) {
      return;
    }

    if (node.type === "object") {
      const keys = new Set();

      for (const property of node.children ?? []) {
        if (property.type !== "property" || !property.children?.length) {
          continue;
        }

        const key = property.children[0].value;

        if (keys.has(key)) {
          duplicates.add(key);
        } else {
          keys.add(key);
        }
      }
    }

    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  visit(tree);

  return [...duplicates];
}

export function validateDomainFile({
  file,
  subdomain = file.replace(/^domains\//, "").replace(/\.json$/, ""),
  raw,
  data,
  parseError = null,
  config = loadConfig()
}) {
  if (parseError) {
    return [
      createError(ERROR_CODES.INVALID_JSON, {
        file,
        path: "file",
        detail: parseError.message
      })
    ];
  }

  const errors = [];

  if (raw !== undefined) {
    for (const key of findDuplicateKeys(raw)) {
      errors.push(
        createError(ERROR_CODES.DUPLICATE_KEYS, {
          file,
          path: key,
          detail: `The key "${key}" appears more than once.`
        })
      );
    }
  }

  errors.push(...validateSchema(data, file));
  errors.push(...validateFilename({ file, subdomain, config }));

  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    errors.push(...validateOwner(data, { file }));
    errors.push(...validateRecords({ file, subdomain, data, config }));
  }

  return sortErrors(dedupeErrors(errors));
}

function validateParent(entry, registryMap, config) {
  const errors = [];
  const file = domainDisplayPath(entry.file);
  const parts = entry.subdomain.split(".");

  if (parts.length < 2) {
    return errors;
  }

  const parentName = parts.slice(1).join(".");
  const parent = registryMap.get(parentName);

  if (!parent) {
    errors.push(
      createError(ERROR_CODES.MISSING_PARENT, {
        file,
        path: "filename",
        detail: `The parent subdomain "${parentName}" does not exist.`
      })
    );
    return errors;
  }

  const childOwner = ownerUsername(entry.data);
  const parentOwner = ownerUsername(parent.data);

  if (childOwner && parentOwner && childOwner !== parentOwner) {
    errors.push(
      createError(ERROR_CODES.PARENT_NOT_OWNED, {
        file,
        path: "owner",
        detail: `The parent subdomain "${parentName}" is owned by "${parentOwner}".`
      })
    );
  }

  if (parent.data?.records?.CNAME !== undefined) {
    errors.push(
      createError(ERROR_CODES.PARENT_HAS_CNAME, {
        file,
        path: "parent",
        detail: `The parent subdomain "${parentName}" has a CNAME record and cannot have children.`
      })
    );
  }

  return errors;
}

function validateOwnerLimits(entries, config) {
  const errors = [];
  const byOwner = new Map();

  for (const entry of entries) {
    if (entry.parseError) {
      continue;
    }

    const username = ownerUsername(entry.data);

    if (!username) {
      continue;
    }

    if (!byOwner.has(username)) {
      byOwner.set(username, []);
    }

    byOwner.get(username).push(entry);
  }

  for (const [username, ownerEntries] of byOwner) {
    const sortedEntries = [...ownerEntries].sort((left, right) =>
      left.file < right.file ? -1 : left.file > right.file ? 1 : 0
    );

    for (const entry of sortedEntries.slice(config.limits.maxDomainsPerOwner)) {
      errors.push(
        createError(ERROR_CODES.TOO_MANY_DOMAINS, {
          file: domainDisplayPath(entry.file),
          path: "owner",
          detail: `"${username}" has more than ${config.limits.maxDomainsPerOwner} domains.`
        })
      );
    }

    const singleCharacterEntries = sortedEntries.filter((entry) => entry.subdomain.length === 1);

    for (const entry of singleCharacterEntries.slice(
      config.limits.maxSingleCharacterSubdomainsPerOwner
    )) {
      errors.push(
        createError(ERROR_CODES.TOO_MANY_SINGLE_CHARACTER_SUBDOMAINS, {
          file: domainDisplayPath(entry.file),
          path: "filename",
          detail: `"${username}" has more than ${config.limits.maxSingleCharacterSubdomainsPerOwner} single-character subdomain.`
        })
      );
    }
  }

  return errors;
}

const NAME_RELATED_ERROR_CODES = new Set([
  ERROR_CODES.INVALID_FILENAME,
  ERROR_CODES.UPPERCASE_FILENAME,
  ERROR_CODES.FILENAME_TOO_LONG,
  ERROR_CODES.LABEL_TOO_LONG,
  ERROR_CODES.CONSECUTIVE_HYPHENS,
  ERROR_CODES.CONSECUTIVE_DOTS,
  ERROR_CODES.LEADING_OR_TRAILING_DOT,
  ERROR_CODES.LEADING_OR_TRAILING_HYPHEN,
  ERROR_CODES.PUNYCODE_FILENAME,
  ERROR_CODES.ROOT_LABEL_UNDERSCORE,
  ERROR_CODES.FILENAME_CONTAINS_ZONE,
  ERROR_CODES.NESTING_TOO_DEEP,
  ERROR_CODES.RESERVED_SUBDOMAIN,
  ERROR_CODES.BLOCKED_SUBDOMAIN,
  ERROR_CODES.INTERNAL_SUBDOMAIN
]);

export function validateRegistry({
  domainsDir = getDomainsDirectory(),
  config = loadConfig()
} = {}) {
  const entries = loadRegistry(domainsDir);
  const errors = [];
  const invalidNames = new Set();

  for (const entry of entries) {
    const entryErrors = validateDomainFile({
      file: domainDisplayPath(entry.file),
      subdomain: entry.subdomain,
      raw: entry.raw,
      data: entry.data,
      parseError: entry.parseError,
      config
    });

    errors.push(...entryErrors);

    if (entryErrors.some((error) => NAME_RELATED_ERROR_CODES.has(error.code))) {
      invalidNames.add(entry.file);
    }
  }

  const registryMap = createRegistryMap(entries.filter((entry) => !entry.parseError));

  for (const entry of entries) {
    if (entry.parseError || invalidNames.has(entry.file)) {
      continue;
    }

    errors.push(...validateParent(entry, registryMap, config));
  }

  errors.push(...validateOwnerLimits(entries, config));

  return {
    entries,
    errors: sortErrors(dedupeErrors(errors))
  };
}

export { authorizeDomainChange, isAdminUser, isTrustedUser, validatePullRequestTemplate };
