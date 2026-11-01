import test from "ava";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import ipaddr from "ipaddr.js";
import { parse as parseYaml } from "yaml";

import { loadConfig } from "../utils/lib/config.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function isSortedUnique(values) {
  const sorted = [...values].sort();
  return (
    values.length === new Set(values).size &&
    values.every((value, index) => value === sorted[index])
  );
}

function assertSortedUnique(t, values, label) {
  t.true(Array.isArray(values), `${label} should be an array`);
  t.true(isSortedUnique(values), `${label} should be sorted and free of duplicates`);
}

function walk(directory) {
  const results = [];

  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relativePath = path.posix.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...walk(relativePath));
    } else {
      results.push(relativePath);
    }
  }

  return results;
}

const recordTypes = readJson("config/record-types.json");
const limits = readJson("config/limits.json");
const reserved = readJson("config/reserved-subdomains.json");
const blocked = readJson("config/blocked-subdomains.json");
const internal = readJson("config/internal-subdomains.json");
const blockedCnames = readJson("config/blocked-cname-targets.json");
const blockedIps = readJson("config/blocked-ip-ranges.json");
const protectedDns = readJson("config/protected-dns-records.json");
const trustedUsers = readJson("config/trusted-users.json");
const labels = readJson("config/labels.json");
const prTemplate = readJson("config/pr-template.json");
const cloudflare = readJson("config/cloudflare.json");
const schema = readJson("schema/domain.schema.json");
const packageJson = readJson("package.json");

test("record types match the schema and limits", (t) => {
  const expected = ["A", "AAAA", "CNAME", "MX", "TXT"].sort();

  t.deepEqual(Object.keys(recordTypes).sort(), expected);
  t.deepEqual(Object.keys(schema.properties.records.properties).sort(), expected);

  for (const [type, rule] of Object.entries(recordTypes)) {
    t.true(["array", "string"].includes(rule.kind), `${type} should have a valid kind`);
    t.true(Number.isInteger(rule.max) && rule.max > 0, `${type} should have a positive max`);
    t.is(typeof rule.proxyable, "boolean", `${type} should have a proxyable flag`);
  }

  t.is(recordTypes.CNAME.max, 1);
  t.is(recordTypes.A.max, 5);
  t.is(recordTypes.AAAA.max, 5);
  t.is(recordTypes.TXT.max, 5);
  t.is(recordTypes.MX.max, 5);
});

test("limits are positive integers", (t) => {
  for (const [key, value] of Object.entries(limits)) {
    t.true(Number.isInteger(value) && value > 0, `${key} should be a positive integer`);
  }

  t.is(limits.maxTxtLength, 255);
  t.true(limits.maxRecordsPerDomain >= 5);
});

test("reserved and internal name lists are sorted and unique", (t) => {
  assertSortedUnique(t, reserved.exact, "reserved-subdomains.exact");
  assertSortedUnique(t, reserved.suffixes, "reserved-subdomains.suffixes");
  assertSortedUnique(t, blocked.exact, "blocked-subdomains.exact");
  assertSortedUnique(t, blocked.suffixes, "blocked-subdomains.suffixes");
  assertSortedUnique(t, internal.exact, "internal-subdomains.exact");
  assertSortedUnique(t, internal.suffixes, "internal-subdomains.suffixes");

  t.true(reserved.exact.includes("www"));
  t.true(reserved.exact.includes("api"));
  t.true(internal.exact.includes("www"));

  for (const name of [...reserved.exact, ...blocked.exact, ...internal.exact]) {
    t.regex(name, /^[a-z0-9][a-z0-9-]*$/, `${name} should be a valid name`);
  }

  for (const suffix of [...reserved.suffixes, ...blocked.suffixes, ...internal.suffixes]) {
    t.true(suffix.startsWith("."), `${suffix} should start with a dot`);
  }
});

test("blocked CNAME targets are valid", (t) => {
  assertSortedUnique(t, blockedCnames.exact, "blocked-cname-targets.exact");
  assertSortedUnique(t, blockedCnames.suffixes, "blocked-cname-targets.suffixes");

  t.true(blockedCnames.exact.includes("has-a.link"));

  for (const target of blockedCnames.exact) {
    t.is(target, target.toLowerCase(), `${target} should be lowercase`);
  }

  for (const suffix of blockedCnames.suffixes) {
    t.true(suffix.startsWith("."), `${suffix} should start with a dot`);
    t.is(suffix, suffix.toLowerCase(), `${suffix} should be lowercase`);
  }
});

test("blocked IP addresses and ranges are valid", (t) => {
  for (const [family, section] of Object.entries(blockedIps)) {
    t.true(["ipv4", "ipv6"].includes(family), `Unknown IP family ${family}`);
    t.true(Array.isArray(section.addresses), `${family}.addresses should be an array`);
    t.true(Array.isArray(section.cidrs), `${family}.cidrs should be an array`);
    t.is(
      new Set(section.addresses).size,
      section.addresses.length,
      `${family} has duplicate addresses`
    );
    t.is(new Set(section.cidrs).size, section.cidrs.length, `${family} has duplicate ranges`);

    for (const address of section.addresses) {
      t.is(ipaddr.parse(address).kind(), family, `${address} is not ${family}`);
    }

    for (const range of section.cidrs) {
      const [address] = ipaddr.parseCIDR(range);
      t.is(address.kind(), family, `${range} is not ${family}`);
    }
  }
});

test("protected DNS records are configured", (t) => {
  t.true(Array.isArray(protectedDns.names));
  t.true(protectedDns.names.includes("@"));
  t.true(Array.isArray(protectedDns.namePatterns));
  t.true(Array.isArray(protectedDns.types));
  assertSortedUnique(t, protectedDns.types, "protected-dns-records.types");
  t.true(protectedDns.types.includes("NS"));
  t.true(protectedDns.types.includes("SOA"));
});

test("trusted users follow the documented schema", (t) => {
  t.true(Array.isArray(trustedUsers));

  const ids = trustedUsers.map((user) => user.id);
  const usernames = trustedUsers.map((user) => user.username.toLowerCase());

  t.is(new Set(ids).size, ids.length, "Trusted user IDs should be unique");
  t.is(new Set(usernames).size, usernames.length, "Trusted usernames should be unique");

  for (const user of trustedUsers) {
    t.regex(user.username, /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/);
    t.true(Number.isInteger(user.id) && user.id > 0);
    t.is(typeof (user.admin ?? false), "boolean");
  }
});

test("labels have valid names, colors, and descriptions", (t) => {
  const entries = Object.entries(labels);
  const names = entries.map(([, label]) => label.name);

  t.is(new Set(names).size, names.length, "Label names should be unique");

  for (const [key, label] of entries) {
    t.is(typeof label.name, "string");
    t.true(label.name.length > 0, `${key} should have a name`);
    t.regex(label.color, /^[0-9a-f]{6}$/i, `${key} should have a six-character hex color`);
    t.is(typeof label.description, "string");
    t.true(
      label.description.length > 0 && label.description.length <= 100,
      `${key} description is invalid`
    );
  }
});

test("issue templates reference configured labels", (t) => {
  const labelNames = new Set(Object.values(labels).map((label) => label.name));
  const templateFiles = walk(".github/ISSUE_TEMPLATE").filter((file) => file.endsWith(".yml"));

  for (const file of templateFiles) {
    const contents = parseYaml(read(file));

    if (contents?.labels) {
      const templateLabels = Array.isArray(contents.labels) ? contents.labels : [contents.labels];

      for (const label of templateLabels) {
        t.true(labelNames.has(label), `${file} references unknown label ${label}`);
      }
    }
  }
});

test("PR template configuration is valid", (t) => {
  t.true(Array.isArray(prTemplate.requiredCheckboxes));
  t.true(Array.isArray(prTemplate.requiredSections));
  t.is(new Set(prTemplate.requiredCheckboxes).size, prTemplate.requiredCheckboxes.length);

  const markers = [];

  for (const section of prTemplate.requiredSections) {
    t.is(typeof section.key, "string");
    t.is(typeof section.start, "string");
    t.is(typeof section.end, "string");
    markers.push(section.start, section.end);
  }

  t.is(new Set(markers).size, markers.length, "Section markers should be unique");
});

test("Cloudflare configuration is valid", (t) => {
  t.is(cloudflare.zone, "has-a.link");
  t.true(Number.isInteger(cloudflare.ttl) && cloudflare.ttl >= 1);
  t.is(cloudflare.proxiedTtl, 1);
  t.is(typeof cloudflare.comment, "string");
  t.true(cloudflare.comment.length > 0);
  t.true(Number.isInteger(cloudflare.maxDeletionsPerRun) && cloudflare.maxDeletionsPerRun > 0);
});

test("domain schema compiles with Ajv", (t) => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  t.notThrows(() => ajv.compile(schema));
});

test("package metadata and scripts are present", (t) => {
  t.is(packageJson.name, "has-a-link-domains");
  t.is(packageJson.license, "MIT");
  t.is(packageJson.type, "module");

  for (const script of [
    "test",
    "test:coverage",
    "test:ci",
    "format",
    "format:check",
    "validate",
    "validate:pr",
    "simulate:pr",
    "deploy",
    "deploy:dry",
    "add:reserved",
    "sync:labels"
  ]) {
    t.is(typeof packageJson.scripts[script], "string", `Missing script ${script}`);
  }

  t.true(packageJson.c8["check-coverage"]);
  t.true(packageJson.c8.all);
  t.true(packageJson.c8.lines >= 95);
  t.true(packageJson.c8.branches >= 90);
});

test("YAML files parse", (t) => {
  const yamlFiles = walk(".github").filter(
    (file) => file.endsWith(".yml") || file.endsWith(".yaml")
  );

  for (const file of yamlFiles) {
    t.notThrows(() => parseYaml(read(file)), `${file} is invalid YAML`);
  }
});

test("loadConfig reports a missing config directory", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-config-"));

  try {
    t.throws(() => loadConfig(directory), {
      message: /Failed to read JSON/
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
