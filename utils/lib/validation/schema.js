import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { loadSchema } from "../config.js";
import { ERROR_CODES, createError } from "../errors.js";

const schema = loadSchema();
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function errorPath(error) {
  const property = error.params?.additionalProperty ?? error.params?.missingProperty;

  if (property && (error.keyword === "required" || error.keyword === "additionalProperties")) {
    return `${error.instancePath}/${property}`;
  }

  return error.instancePath || "/";
}

function errorCode(error) {
  const path = error.instancePath;
  const property = error.params?.missingProperty;

  if (error.keyword === "required") {
    if (path === "" && property === "owner") return ERROR_CODES.OWNER_MISSING;
    if (path === "" && property === "records") return ERROR_CODES.MISSING_RECORDS;
    if (path === "/owner" && property === "username") return ERROR_CODES.MISSING_OWNER_USERNAME;
    if (path.startsWith("/records/MX")) return ERROR_CODES.INVALID_MX;
    return ERROR_CODES.SCHEMA_INVALID;
  }

  if (error.keyword === "additionalProperties") {
    if (path === "/records") return ERROR_CODES.UNKNOWN_RECORD_TYPE;
    if (path.startsWith("/records/MX")) return ERROR_CODES.INVALID_MX;
    return ERROR_CODES.UNKNOWN_FIELD;
  }

  if (error.keyword === "type") {
    if (path === "") return ERROR_CODES.INVALID_DOMAIN;
    if (path === "/owner") return ERROR_CODES.INVALID_OWNER;
    if (path === "/owner/username") return ERROR_CODES.INVALID_OWNER_USERNAME;
    if (path === "/owner/email") return ERROR_CODES.INVALID_EMAIL;
    if (path === "/records") return ERROR_CODES.INVALID_RECORDS;
    if (path === "/proxied") return ERROR_CODES.INVALID_PROXIED;
    if (path.startsWith("/records/A/") || path === "/records/A") return ERROR_CODES.INVALID_A;
    if (path.startsWith("/records/AAAA") || path === "/records/AAAA")
      return ERROR_CODES.INVALID_AAAA;
    if (path === "/records/CNAME") return ERROR_CODES.INVALID_CNAME;
    if (path.startsWith("/records/TXT") || path === "/records/TXT") return ERROR_CODES.INVALID_TXT;
    if (path.startsWith("/records/MX/0/priority")) return ERROR_CODES.MX_PRIORITY;
    if (path.startsWith("/records/MX")) return ERROR_CODES.INVALID_MX;
    return ERROR_CODES.SCHEMA_INVALID;
  }

  if (error.keyword === "format") {
    if (path.startsWith("/records/AAAA")) return ERROR_CODES.INVALID_AAAA;
    if (path === "/records/A" || path.startsWith("/records/A/")) return ERROR_CODES.INVALID_A;
    if (path === "/owner/email") return ERROR_CODES.INVALID_EMAIL;
    return ERROR_CODES.SCHEMA_INVALID;
  }

  if (error.keyword === "pattern") {
    if (path === "/owner/username") return ERROR_CODES.INVALID_OWNER_USERNAME;
    if (path === "/records/CNAME") return ERROR_CODES.INVALID_CNAME;
    if (path.startsWith("/records/MX")) return ERROR_CODES.INVALID_MX;
    return ERROR_CODES.SCHEMA_INVALID;
  }

  if (error.keyword === "minItems") {
    if (path === "/records/A") return ERROR_CODES.INVALID_A;
    if (path === "/records/AAAA") return ERROR_CODES.INVALID_AAAA;
    if (path === "/records/TXT") return ERROR_CODES.INVALID_TXT;
    if (path === "/records/MX") return ERROR_CODES.INVALID_MX;
    return ERROR_CODES.SCHEMA_INVALID;
  }

  if (error.keyword === "maxItems" || error.keyword === "maxProperties") {
    return ERROR_CODES.TOO_MANY_RECORDS;
  }

  if (error.keyword === "minProperties") {
    return path === "/records" ? ERROR_CODES.MISSING_RECORDS : ERROR_CODES.SCHEMA_INVALID;
  }

  if (error.keyword === "uniqueItems") {
    return ERROR_CODES.DUPLICATE_RECORD_VALUE;
  }

  if (error.keyword === "maxLength") {
    return path.startsWith("/records/TXT") ? ERROR_CODES.TXT_TOO_LONG : ERROR_CODES.SCHEMA_INVALID;
  }

  if (error.keyword === "minLength") {
    return path.startsWith("/records/TXT") ? ERROR_CODES.INVALID_TXT : ERROR_CODES.SCHEMA_INVALID;
  }

  if (error.keyword === "minimum" || error.keyword === "maximum") {
    return path.startsWith("/records/MX") ? ERROR_CODES.MX_PRIORITY : ERROR_CODES.SCHEMA_INVALID;
  }

  return ERROR_CODES.SCHEMA_INVALID;
}

function errorDetail(error) {
  const params = error.params ?? {};

  switch (error.keyword) {
    case "required":
      return `Missing required field "${params.missingProperty}".`;
    case "additionalProperties":
      return `Unknown field "${params.additionalProperty}".`;
    case "type":
      return `Expected a value of type "${params.type}".`;
    case "format":
      return `Expected a value in ${params.format} format.`;
    case "pattern":
      return "Value does not match the required pattern.";
    case "minItems":
      return `Expected at least ${params.limit} item(s).`;
    case "maxItems":
      return `Expected at most ${params.limit} item(s).`;
    case "maxProperties":
      return `Expected at most ${params.limit} record type(s).`;
    case "minProperties":
      return `Expected at least ${params.limit} record type(s).`;
    case "uniqueItems":
      return "Duplicate values are not allowed.";
    case "minLength":
      return `Expected at least ${params.limit} character(s).`;
    case "maxLength":
      return `Expected at most ${params.limit} character(s).`;
    case "minimum":
      return `Expected a value greater than or equal to ${params.limit}.`;
    case "maximum":
      return `Expected a value less than or equal to ${params.limit}.`;
    default:
      return error.message || "Value does not match the schema.";
  }
}

export function validateSchema(data, file) {
  if (validate(data)) {
    return [];
  }

  return (validate.errors ?? []).map((error) =>
    createError(errorCode(error), {
      file,
      path: errorPath(error),
      detail: errorDetail(error)
    })
  );
}
