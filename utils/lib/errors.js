export const ERROR_CODES = Object.freeze({
  INVALID_JSON: "invalid_json",
  DUPLICATE_KEYS: "duplicate_keys",
  SCHEMA_INVALID: "schema_invalid",
  UNKNOWN_FIELD: "unknown_field",
  INVALID_DOMAIN: "invalid_domain",
  INVALID_OWNER: "invalid_owner",
  INVALID_RECORDS: "invalid_records",
  INVALID_PROXIED: "invalid_proxied",
  INVALID_FILENAME: "invalid_filename",
  UPPERCASE_FILENAME: "uppercase_filename",
  FILENAME_TOO_LONG: "filename_too_long",
  LABEL_TOO_LONG: "label_too_long",
  CONSECUTIVE_HYPHENS: "consecutive_hyphens",
  CONSECUTIVE_DOTS: "consecutive_dots",
  LEADING_OR_TRAILING_DOT: "leading_or_trailing_dot",
  LEADING_OR_TRAILING_HYPHEN: "leading_or_trailing_hyphen",
  PUNYCODE_FILENAME: "punycode_filename",
  ROOT_LABEL_UNDERSCORE: "root_label_underscore",
  FILENAME_CONTAINS_ZONE: "filename_contains_zone",
  NESTING_TOO_DEEP: "nesting_too_deep",
  RESERVED_SUBDOMAIN: "reserved_subdomain",
  BLOCKED_SUBDOMAIN: "blocked_subdomain",
  INTERNAL_SUBDOMAIN: "internal_subdomain",
  MISSING_PARENT: "missing_parent",
  PARENT_NOT_OWNED: "parent_not_owned",
  PARENT_HAS_CNAME: "parent_has_cname",
  TOO_MANY_DOMAINS: "too_many_domains",
  TOO_MANY_SINGLE_CHARACTER_SUBDOMAINS: "too_many_single_character_subdomains",
  OWNER_MISSING: "owner_missing",
  MISSING_OWNER_USERNAME: "missing_owner_username",
  INVALID_OWNER_USERNAME: "invalid_owner_username",
  INVALID_EMAIL: "invalid_email",
  OWNER_MISMATCH: "owner_mismatch",
  OWNER_CHANGE: "owner_change",
  UNAUTHORIZED_DELETE: "unauthorized_delete",
  UNAUTHORIZED_RENAME: "unauthorized_rename",
  MISSING_RECORDS: "missing_records",
  UNKNOWN_RECORD_TYPE: "unknown_record_type",
  TOO_MANY_RECORDS: "too_many_records",
  INVALID_A: "invalid_a",
  PRIVATE_A: "private_a",
  BLOCKED_A: "blocked_a",
  INVALID_AAAA: "invalid_aaaa",
  PRIVATE_AAAA: "private_aaaa",
  BLOCKED_AAAA: "blocked_aaaa",
  INVALID_CNAME: "invalid_cname",
  CNAME_SELF: "cname_self",
  CNAME_APEX: "cname_apex",
  CNAME_BLOCKED_TARGET: "cname_blocked_target",
  CNAME_COMBINED: "cname_combined",
  INVALID_TXT: "invalid_txt",
  TXT_TOO_LONG: "txt_too_long",
  INVALID_MX: "invalid_mx",
  MX_PRIORITY: "mx_priority",
  MX_SELF: "mx_self",
  DUPLICATE_RECORD_VALUE: "duplicate_record_value",
  PROXIED_WITHOUT_PROXYABLE_RECORD: "proxied_without_proxyable_record",
  PROXIED_NOT_ALLOWED: "proxied_not_allowed",
  ROOT_REQUIRES_USABLE_RECORD: "root_requires_usable_record",
  NOT_FORMATTED: "not_formatted",
  TEMPLATE_MISSING: "template_missing",
  TEMPLATE_MISSING_CHECKBOX: "template_missing_checkbox",
  TEMPLATE_MISSING_SECTION: "template_missing_section",
  TEMPLATE_MARKER_MISSING: "template_marker_missing",
  INVALID_CONFIG: "invalid_config",
  CONFIG_UNSORTED: "config_unsorted",
  CONFIG_DUPLICATE: "config_duplicate"
});

export function createError(code, { file = null, path = null, detail = "" } = {}) {
  return {
    code,
    file,
    path,
    detail
  };
}

export function dedupeErrors(errors) {
  const seen = new Set();
  const result = [];

  for (const error of errors) {
    const key = `${error.code}|${error.file ?? ""}|${error.path ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(error);
  }

  return result;
}

export function sortErrors(errors) {
  return [...errors].sort((left, right) => {
    const leftKey = `${left.file ?? ""}|${left.path ?? ""}|${left.code}`;
    const rightKey = `${right.file ?? ""}|${right.path ?? ""}|${right.code}`;

    if (leftKey < rightKey) return -1;
    if (leftKey > rightKey) return 1;
    return 0;
  });
}

export function groupErrorsByFile(errors) {
  const groups = new Map();

  for (const error of errors) {
    const file = error.file ?? "unknown";

    if (!groups.has(file)) {
      groups.set(file, []);
    }

    groups.get(file).push(error);
  }

  return groups;
}

export function formatError(error) {
  const location = [error.file, error.path].filter(Boolean).join(" ");
  const detail = error.detail || "Validation failed";

  return `${location ? `${location}: ` : ""}${detail} [${error.code}]`;
}

export function formatErrors(errors) {
  return sortErrors(errors).map(formatError).join("\n");
}
