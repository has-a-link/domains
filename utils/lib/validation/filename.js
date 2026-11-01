import { ERROR_CODES, createError, dedupeErrors } from "../errors.js";

const LABEL_PATTERN = /^_?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function matchesNameList(name, list) {
  for (const exact of list.exact ?? []) {
    if (name === exact || name.endsWith(`.${exact}`)) {
      return { value: exact, type: "exact" };
    }
  }

  for (const suffix of list.suffixes ?? []) {
    const bareSuffix = suffix.startsWith(".") ? suffix.slice(1) : suffix;

    if (name === bareSuffix || name.endsWith(suffix)) {
      return { value: suffix, type: "suffix" };
    }
  }

  return null;
}

function nameError(code, subdomain, match) {
  const kind = code.replace("_subdomain", "").replace("_", " ");

  if (match.type === "suffix") {
    return `"${subdomain}" matches the ${kind} suffix "${match.value}".`;
  }

  return `"${subdomain}" is ${kind}.`;
}

export function validateFilename({ file, subdomain, config }) {
  const errors = [];
  const add = (code, detail) => {
    errors.push(createError(code, { file, path: "filename", detail }));
  };

  if (!subdomain) {
    add(ERROR_CODES.INVALID_FILENAME, "The file name is empty.");
    return dedupeErrors(errors);
  }

  if (subdomain.length > 253) {
    add(ERROR_CODES.FILENAME_TOO_LONG, "The subdomain must be 253 characters or fewer.");
  }

  if (subdomain !== subdomain.toLowerCase()) {
    add(ERROR_CODES.UPPERCASE_FILENAME, "The file name must be lowercase.");
  }

  const labels = subdomain.split(".");
  const hasPunycode = labels.some((label) => label.toLowerCase().startsWith("xn--"));

  if (!hasPunycode && subdomain.includes("--")) {
    add(ERROR_CODES.CONSECUTIVE_HYPHENS, "The file name cannot contain consecutive hyphens.");
  }

  if (subdomain.includes("..")) {
    add(ERROR_CODES.CONSECUTIVE_DOTS, "The file name cannot contain consecutive dots.");
  }

  if (subdomain.startsWith(".") || subdomain.endsWith(".")) {
    add(ERROR_CODES.LEADING_OR_TRAILING_DOT, "The file name cannot start or end with a dot.");
  }

  if (hasPunycode) {
    add(ERROR_CODES.PUNYCODE_FILENAME, "Punycode file names are not supported.");
  }

  if (subdomain === config.cloudflare.zone || subdomain.endsWith(`.${config.cloudflare.zone}`)) {
    add(
      ERROR_CODES.FILENAME_CONTAINS_ZONE,
      `The file name cannot contain ${config.cloudflare.zone}.`
    );
  }

  if (labels.length > config.limits.maxNestingDepth) {
    add(
      ERROR_CODES.NESTING_TOO_DEEP,
      `The subdomain can have at most ${config.limits.maxNestingDepth} labels.`
    );
  }

  for (const label of labels) {
    if (label.length > 63) {
      add(ERROR_CODES.LABEL_TOO_LONG, `The label "${label}" must be 63 characters or fewer.`);
      continue;
    }

    if (label.startsWith("-") || label.endsWith("-")) {
      add(
        ERROR_CODES.LEADING_OR_TRAILING_HYPHEN,
        `The label "${label}" cannot start or end with a hyphen.`
      );
      continue;
    }

    if (label.length === 0 || label !== label.toLowerCase() || label.includes("--")) {
      continue;
    }

    if (!LABEL_PATTERN.test(label)) {
      add(ERROR_CODES.INVALID_FILENAME, `The label "${label}" contains invalid characters.`);
    }
  }

  const rootLabel = labels[labels.length - 1];

  if (rootLabel.startsWith("_")) {
    add(ERROR_CODES.ROOT_LABEL_UNDERSCORE, "The root label cannot start with an underscore.");
  }

  const internalMatch = matchesNameList(subdomain, config.internalSubdomains);

  if (internalMatch) {
    add(
      ERROR_CODES.INTERNAL_SUBDOMAIN,
      nameError(ERROR_CODES.INTERNAL_SUBDOMAIN, subdomain, internalMatch)
    );
    return dedupeErrors(errors);
  }

  const blockedMatch = matchesNameList(subdomain, config.blockedSubdomains);

  if (blockedMatch) {
    add(
      ERROR_CODES.BLOCKED_SUBDOMAIN,
      nameError(ERROR_CODES.BLOCKED_SUBDOMAIN, subdomain, blockedMatch)
    );
    return dedupeErrors(errors);
  }

  const reservedMatch = matchesNameList(subdomain, config.reservedSubdomains);

  if (reservedMatch) {
    add(
      ERROR_CODES.RESERVED_SUBDOMAIN,
      nameError(ERROR_CODES.RESERVED_SUBDOMAIN, subdomain, reservedMatch)
    );
  }

  return dedupeErrors(errors);
}
