import ipaddr from "ipaddr.js";

import { ERROR_CODES, createError, dedupeErrors } from "../errors.js";

const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PROXYABLE_RECORD_TYPES = ["A", "AAAA", "CNAME"];
const USABLE_ROOT_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidHostname(value) {
  return typeof value === "string" && HOSTNAME_PATTERN.test(value);
}

function recordCount(value) {
  return Array.isArray(value) ? value.length : 1;
}

function isBlockedIpAddress(parsed, family, config) {
  const section = config.blockedIpRanges[family];

  if (!section) {
    return false;
  }

  if (section.addresses.includes(parsed.toString())) {
    return true;
  }

  for (const cidr of section.cidrs) {
    if (parsed.match(ipaddr.parseCIDR(cidr))) {
      return true;
    }
  }

  return false;
}

function blockedCnameTarget(target, config) {
  for (const exact of config.blockedCnameTargets.exact) {
    if (target === exact) {
      return exact;
    }
  }

  for (const suffix of config.blockedCnameTargets.suffixes) {
    if (target.endsWith(suffix)) {
      return suffix;
    }
  }

  return null;
}

function validateAddressRecords({
  key,
  value,
  family,
  invalidCode,
  privateCode,
  blockedCode,
  errors,
  file,
  config
}) {
  if (!Array.isArray(value)) {
    errors.push(
      createError(invalidCode, {
        file,
        path: `/records/${key}`,
        detail: `${key} records must be an array.`
      })
    );
    return;
  }

  if (value.length === 0) {
    errors.push(
      createError(invalidCode, {
        file,
        path: `/records/${key}`,
        detail: `${key} records cannot be empty.`
      })
    );
    return;
  }

  if (value.length > config.recordTypes[key].max) {
    errors.push(
      createError(ERROR_CODES.TOO_MANY_RECORDS, {
        file,
        path: `/records/${key}`,
        detail: `${key} records are limited to ${config.recordTypes[key].max} values.`
      })
    );
  }

  const seen = new Set();

  value.forEach((address, index) => {
    const recordPath = `/records/${key}/${index}`;

    if (typeof address !== "string") {
      errors.push(
        createError(invalidCode, {
          file,
          path: recordPath,
          detail: `${key} record values must be strings.`
        })
      );
      return;
    }

    if (seen.has(address)) {
      errors.push(
        createError(ERROR_CODES.DUPLICATE_RECORD_VALUE, {
          file,
          path: `/records/${key}`,
          detail: `The value "${address}" appears more than once.`
        })
      );
    } else {
      seen.add(address);
    }

    let parsed;

    try {
      parsed = ipaddr.parse(address);
    } catch {
      errors.push(
        createError(invalidCode, {
          file,
          path: recordPath,
          detail: `"${address}" is not a valid ${family === "ipv4" ? "IPv4" : "IPv6"} address.`
        })
      );
      return;
    }

    if (parsed.kind() !== family) {
      errors.push(
        createError(invalidCode, {
          file,
          path: recordPath,
          detail: `"${address}" is not a valid ${family === "ipv4" ? "IPv4" : "IPv6"} address.`
        })
      );
      return;
    }

    if (parsed.range() !== "unicast") {
      errors.push(
        createError(privateCode, {
          file,
          path: recordPath,
          detail: `"${address}" is not a public address.`
        })
      );
      return;
    }

    if (isBlockedIpAddress(parsed, family, config)) {
      errors.push(
        createError(blockedCode, {
          file,
          path: recordPath,
          detail: `"${address}" is blocked.`
        })
      );
    }
  });
}

function validateCname({ value, errors, file, subdomain, config }) {
  if (typeof value !== "string") {
    errors.push(
      createError(ERROR_CODES.INVALID_CNAME, {
        file,
        path: "/records/CNAME",
        detail: "CNAME must be a hostname string."
      })
    );
    return;
  }

  if (!isValidHostname(value)) {
    errors.push(
      createError(ERROR_CODES.INVALID_CNAME, {
        file,
        path: "/records/CNAME",
        detail: "CNAME must be a lowercase hostname without a protocol, path, or trailing dot."
      })
    );
    return;
  }

  const fqdn = `${subdomain}.${config.cloudflare.zone}`;

  if (value === fqdn) {
    errors.push(
      createError(ERROR_CODES.CNAME_SELF, {
        file,
        path: "/records/CNAME",
        detail: "CNAME cannot point to itself."
      })
    );
    return;
  }

  if (value === config.cloudflare.zone) {
    errors.push(
      createError(ERROR_CODES.CNAME_APEX, {
        file,
        path: "/records/CNAME",
        detail: `CNAME cannot point to ${config.cloudflare.zone}.`
      })
    );
    return;
  }

  if (value.endsWith(`.${config.cloudflare.zone}`)) {
    errors.push(
      createError(ERROR_CODES.CNAME_BLOCKED_TARGET, {
        file,
        path: "/records/CNAME",
        detail: `CNAME cannot point to a name under ${config.cloudflare.zone}.`
      })
    );
    return;
  }

  const blockedTarget = blockedCnameTarget(value, config);

  if (blockedTarget) {
    errors.push(
      createError(ERROR_CODES.CNAME_BLOCKED_TARGET, {
        file,
        path: "/records/CNAME",
        detail: `CNAME target "${value}" is blocked.`
      })
    );
  }
}

function validateTxt({ value, errors, file, config }) {
  if (!Array.isArray(value)) {
    errors.push(
      createError(ERROR_CODES.INVALID_TXT, {
        file,
        path: "/records/TXT",
        detail: "TXT records must be an array of strings."
      })
    );
    return;
  }

  if (value.length === 0) {
    errors.push(
      createError(ERROR_CODES.INVALID_TXT, {
        file,
        path: "/records/TXT",
        detail: "TXT records cannot be empty."
      })
    );
    return;
  }

  if (value.length > config.recordTypes.TXT.max) {
    errors.push(
      createError(ERROR_CODES.TOO_MANY_RECORDS, {
        file,
        path: "/records/TXT",
        detail: `TXT records are limited to ${config.recordTypes.TXT.max} values.`
      })
    );
  }

  const seen = new Set();

  value.forEach((record, index) => {
    const recordPath = `/records/TXT/${index}`;

    if (typeof record !== "string" || record.length === 0) {
      errors.push(
        createError(ERROR_CODES.INVALID_TXT, {
          file,
          path: recordPath,
          detail: "TXT values must be non-empty strings."
        })
      );
      return;
    }

    if (record.length > config.limits.maxTxtLength) {
      errors.push(
        createError(ERROR_CODES.TXT_TOO_LONG, {
          file,
          path: recordPath,
          detail: `TXT values are limited to ${config.limits.maxTxtLength} characters.`
        })
      );
    }

    if (seen.has(record)) {
      errors.push(
        createError(ERROR_CODES.DUPLICATE_RECORD_VALUE, {
          file,
          path: "/records/TXT",
          detail: "Duplicate TXT values are not allowed."
        })
      );
    } else {
      seen.add(record);
    }
  });
}

function validateMx({ value, errors, file, subdomain, config }) {
  if (!Array.isArray(value)) {
    errors.push(
      createError(ERROR_CODES.INVALID_MX, {
        file,
        path: "/records/MX",
        detail: "MX records must be an array."
      })
    );
    return;
  }

  if (value.length === 0) {
    errors.push(
      createError(ERROR_CODES.INVALID_MX, {
        file,
        path: "/records/MX",
        detail: "MX records cannot be empty."
      })
    );
    return;
  }

  if (value.length > config.recordTypes.MX.max) {
    errors.push(
      createError(ERROR_CODES.TOO_MANY_RECORDS, {
        file,
        path: "/records/MX",
        detail: `MX records are limited to ${config.recordTypes.MX.max} values.`
      })
    );
  }

  const seen = new Set();
  const fqdn = `${subdomain}.${config.cloudflare.zone}`;

  value.forEach((record, index) => {
    const recordPath = `/records/MX/${index}`;

    if (!isObject(record)) {
      errors.push(
        createError(ERROR_CODES.INVALID_MX, {
          file,
          path: recordPath,
          detail: "MX records must be objects with priority and target."
        })
      );
      return;
    }

    if (!Number.isInteger(record.priority) || record.priority < 0 || record.priority > 65535) {
      errors.push(
        createError(ERROR_CODES.MX_PRIORITY, {
          file,
          path: `${recordPath}/priority`,
          detail: "MX priority must be an integer between 0 and 65535."
        })
      );
    }

    if (!isValidHostname(record.target)) {
      errors.push(
        createError(ERROR_CODES.INVALID_MX, {
          file,
          path: `${recordPath}/target`,
          detail: "MX target must be a lowercase hostname without a trailing dot."
        })
      );
    } else {
      if (
        record.target === fqdn ||
        record.target === config.cloudflare.zone ||
        record.target.endsWith(`.${config.cloudflare.zone}`)
      ) {
        errors.push(
          createError(ERROR_CODES.MX_SELF, {
            file,
            path: `${recordPath}/target`,
            detail: `MX target cannot point to ${config.cloudflare.zone}.`
          })
        );
      }
    }

    const key = `${record.priority}|${record.target}`;

    if (seen.has(key)) {
      errors.push(
        createError(ERROR_CODES.DUPLICATE_RECORD_VALUE, {
          file,
          path: "/records/MX",
          detail: "Duplicate MX records are not allowed."
        })
      );
    } else {
      seen.add(key);
    }
  });
}

export function validateRecords({ file, subdomain, data, config }) {
  const errors = [];
  const records = data?.records;

  if (records === undefined) {
    errors.push(
      createError(ERROR_CODES.MISSING_RECORDS, {
        file,
        path: "/records",
        detail: "The records field is required."
      })
    );
    return dedupeErrors(errors);
  }

  if (!isObject(records)) {
    errors.push(
      createError(ERROR_CODES.INVALID_RECORDS, {
        file,
        path: "/records",
        detail: "The records field must be an object."
      })
    );
    return dedupeErrors(errors);
  }

  const keys = Object.keys(records);

  if (keys.length === 0) {
    errors.push(
      createError(ERROR_CODES.MISSING_RECORDS, {
        file,
        path: "/records",
        detail: "At least one DNS record is required."
      })
    );
    return dedupeErrors(errors);
  }

  for (const key of keys) {
    if (!Object.hasOwn(config.recordTypes, key)) {
      errors.push(
        createError(ERROR_CODES.UNKNOWN_RECORD_TYPE, {
          file,
          path: `/records/${key}`,
          detail: `Record type "${key}" is not supported.`
        })
      );
    }
  }

  const totalRecords = keys.reduce((total, key) => total + recordCount(records[key]), 0);

  if (totalRecords > config.limits.maxRecordsPerDomain) {
    errors.push(
      createError(ERROR_CODES.TOO_MANY_RECORDS, {
        file,
        path: "/records",
        detail: `A domain can have at most ${config.limits.maxRecordsPerDomain} records.`
      })
    );
  }

  if (records.A !== undefined) {
    validateAddressRecords({
      key: "A",
      value: records.A,
      family: "ipv4",
      invalidCode: ERROR_CODES.INVALID_A,
      privateCode: ERROR_CODES.PRIVATE_A,
      blockedCode: ERROR_CODES.BLOCKED_A,
      errors,
      file,
      config
    });
  }

  if (records.AAAA !== undefined) {
    validateAddressRecords({
      key: "AAAA",
      value: records.AAAA,
      family: "ipv6",
      invalidCode: ERROR_CODES.INVALID_AAAA,
      privateCode: ERROR_CODES.PRIVATE_AAAA,
      blockedCode: ERROR_CODES.BLOCKED_AAAA,
      errors,
      file,
      config
    });
  }

  if (records.CNAME !== undefined) {
    validateCname({
      value: records.CNAME,
      errors,
      file,
      subdomain,
      config
    });

    if (keys.length > 1) {
      errors.push(
        createError(ERROR_CODES.CNAME_COMBINED, {
          file,
          path: "/records/CNAME",
          detail: "CNAME cannot be combined with any other record type."
        })
      );
    }
  }

  if (records.TXT !== undefined) {
    validateTxt({ value: records.TXT, errors, file, config });
  }

  if (records.MX !== undefined) {
    validateMx({ value: records.MX, errors, file, subdomain, config });
  }

  if (data?.proxied !== undefined && typeof data.proxied !== "boolean") {
    errors.push(
      createError(ERROR_CODES.INVALID_PROXIED, {
        file,
        path: "/proxied",
        detail: "The proxied field must be a boolean."
      })
    );
  }

  if (data?.proxied === true) {
    const hasProxyableRecord = PROXYABLE_RECORD_TYPES.some((type) => keys.includes(type));

    if (!hasProxyableRecord) {
      errors.push(
        createError(ERROR_CODES.PROXIED_WITHOUT_PROXYABLE_RECORD, {
          file,
          path: "/proxied",
          detail: "Proxying requires at least one A, AAAA, or CNAME record."
        })
      );
    }
  }

  if (!subdomain.includes(".") && !subdomain.startsWith("_")) {
    const hasUsableRecord = USABLE_ROOT_RECORD_TYPES.some((type) => keys.includes(type));

    if (!hasUsableRecord) {
      errors.push(
        createError(ERROR_CODES.ROOT_REQUIRES_USABLE_RECORD, {
          file,
          path: "/records",
          detail: "A root subdomain must have at least one A, AAAA, CNAME, or MX record."
        })
      );
    }
  }

  return dedupeErrors(errors);
}
