import path from "node:path";

import * as prettier from "prettier";

import { isDomainFile } from "./changes.js";
import { loadConfig } from "./config.js";
import { ERROR_CODES, dedupeErrors, sortErrors } from "./errors.js";
import { checkFormatting } from "./format.js";
import { loadRegistry } from "./registry.js";
import { validateRegistry } from "./validation/index.js";
import { authorizeDomainChange, isTrustedUser } from "./validation/owner.js";
import { validatePullRequestTemplate } from "./validation/template.js";

const OWNER_ERROR_CODES = new Set([
  ERROR_CODES.INVALID_OWNER,
  ERROR_CODES.OWNER_MISSING,
  ERROR_CODES.MISSING_OWNER_USERNAME,
  ERROR_CODES.INVALID_OWNER_USERNAME,
  ERROR_CODES.INVALID_EMAIL,
  ERROR_CODES.OWNER_MISMATCH,
  ERROR_CODES.OWNER_CHANGE,
  ERROR_CODES.UNAUTHORIZED_DELETE,
  ERROR_CODES.UNAUTHORIZED_RENAME
]);

function baseName(fileName) {
  return path.posix.basename(fileName);
}

export function listDomainChanges(changedFiles) {
  const changes = [];

  for (const file of changedFiles) {
    if (!isDomainFile(file.filename) && !isDomainFile(file.previous_filename)) {
      continue;
    }

    const status = file.status ?? "modified";
    let baseFile = null;
    let headFile = null;
    let changeType = "modified";

    if (status === "added" || status === "copied") {
      headFile = baseName(file.filename);
      changeType = "added";
    } else if (status === "removed") {
      baseFile = baseName(file.filename);
      changeType = "deleted";
    } else if (status === "renamed") {
      baseFile = baseName(file.previous_filename ?? file.filename);
      headFile = baseName(file.filename);
      changeType = "renamed";
    } else {
      baseFile = baseName(file.previous_filename ?? file.filename);
      headFile = baseName(file.filename);
    }

    const baseSubdomain = baseFile?.endsWith(".json") ? baseFile.slice(0, -5) : null;
    const headSubdomain = headFile?.endsWith(".json") ? headFile.slice(0, -5) : null;
    const displayFile =
      changeType === "renamed" && baseFile !== headFile
        ? `domains/${baseFile} -> domains/${headFile}`
        : headFile
          ? `domains/${headFile}`
          : `domains/${baseFile}`;

    changes.push({
      status,
      changeType,
      baseFile,
      headFile,
      baseSubdomain,
      headSubdomain,
      subdomain: headSubdomain ?? baseSubdomain,
      file: displayFile
    });
  }

  return changes;
}

export async function validatePullRequest({
  baseDomainsDir,
  headDomainsDir,
  changedFiles,
  author,
  body,
  config = loadConfig()
}) {
  const domainChanges = listDomainChanges(changedFiles);
  const trusted = isTrustedUser(author, config.trustedUsers);

  if (domainChanges.length === 0) {
    return {
      domainChanges,
      trusted,
      errors: []
    };
  }

  const baseMap = new Map(loadRegistry(baseDomainsDir).map((entry) => [entry.subdomain, entry]));
  const headMap = new Map(loadRegistry(headDomainsDir).map((entry) => [entry.subdomain, entry]));
  const headValidation = validateRegistry({ domainsDir: headDomainsDir, config });
  const errors = [...headValidation.errors];
  const formattingPaths = [];

  for (const change of domainChanges) {
    const baseEntry = change.baseFile ? baseMap.get(change.baseSubdomain) : null;
    const headEntry = change.headFile ? headMap.get(change.headSubdomain) : null;

    errors.push(
      ...authorizeDomainChange({
        file: change.file,
        author,
        base: baseEntry?.data ?? null,
        head: headEntry?.data ?? null,
        changeType: change.changeType,
        trustedUsers: config.trustedUsers
      })
    );

    if (change.headFile && headEntry && !headEntry.parseError) {
      formattingPaths.push({
        filePath: path.join(headDomainsDir, change.headFile),
        displayPath: `domains/${change.headFile}`
      });
    }
  }

  if (formattingPaths.length > 0) {
    const displayByPath = new Map(
      formattingPaths.map((entry) => [entry.filePath, entry.displayPath])
    );
    const formattingOptions = await prettier.resolveConfig(
      path.join(config.root, "domains", "format-options.json")
    );

    errors.push(
      ...(await checkFormatting(
        formattingPaths.map((entry) => entry.filePath),
        {
          displayPath: (filePath) => displayByPath.get(filePath) ?? filePath,
          options: formattingOptions
        }
      ))
    );
  }

  if (!trusted) {
    errors.push(...validatePullRequestTemplate(body, config.prTemplate));
  }

  return {
    domainChanges,
    trusted,
    errors: sortErrors(dedupeErrors(errors))
  };
}

export function derivePullRequestLabels({ errors, domainChanges, trusted, labelsConfig }) {
  const add = new Set();
  const remove = new Set();
  const name = (key) => labelsConfig[key].name;

  if (domainChanges.length > 0) {
    add.add(name("domain"));
  } else {
    remove.add(name("domain"));
  }

  if (trusted) {
    add.add(name("maintainer"));
  } else {
    remove.add(name("maintainer"));
  }

  if (errors.length > 0) {
    add.add(name("invalid"));
  } else {
    remove.add(name("invalid"));
  }

  if (errors.some((error) => error.code.startsWith("template_"))) {
    add.add(name("template"));
  } else {
    remove.add(name("template"));
  }

  if (errors.some((error) => OWNER_ERROR_CODES.has(error.code))) {
    add.add(name("owner"));
  } else {
    remove.add(name("owner"));
  }

  if (errors.some((error) => error.code === ERROR_CODES.NOT_FORMATTED)) {
    add.add(name("notFormatted"));
  } else {
    remove.add(name("notFormatted"));
  }

  for (const label of add) {
    remove.delete(label);
  }

  return {
    add: [...add],
    remove: [...remove]
  };
}
