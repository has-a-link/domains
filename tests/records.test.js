import test from "ava";

import { loadConfig } from "../utils/lib/config.js";
import { validateRecords } from "../utils/lib/validation/records.js";

const baseConfig = loadConfig();

const publicA = [
  "93.184.216.34",
  "93.184.216.35",
  "93.184.216.36",
  "93.184.216.37",
  "93.184.216.38",
  "93.184.216.39"
];

const publicAaaa = [
  "2606:2800:220:1:248:1893:25c8:1946",
  "2606:2800:220:1:248:1893:25c8:1947",
  "2606:2800:220:1:248:1893:25c8:1948",
  "2606:2800:220:1:248:1893:25c8:1949",
  "2606:2800:220:1:248:1893:25c8:1950",
  "2606:2800:220:1:248:1893:25c8:1951"
];

function validate(records, { subdomain = "test", configOverrides = {}, extra = {} } = {}) {
  const config = structuredClone(baseConfig);

  for (const [key, value] of Object.entries(configOverrides)) {
    config[key] = value;
  }

  return validateRecords({
    file: "domains/test.json",
    subdomain,
    data: {
      owner: { username: "alice" },
      records,
      ...extra
    },
    config
  });
}

function codesFor(errors) {
  return [...new Set(errors.map((error) => error.code))].sort();
}

const recordCases = [
  ["missing records", undefined, {}, "missing_records"],
  ["invalid records", "invalid", {}, "invalid_records"],
  ["empty records", {}, {}, "missing_records"],
  ["A not an array", { A: "93.184.216.34" }, {}, "invalid_a"],
  ["A empty", { A: [] }, {}, "invalid_a"],
  ["A non-string value", { A: [123] }, {}, "invalid_a"],
  ["A invalid address", { A: ["not-an-ip"] }, {}, "invalid_a"],
  ["A wrong family", { A: [publicAaaa[0]] }, {}, "invalid_a"],
  ["A private address", { A: ["10.0.0.1"] }, {}, "private_a"],
  ["A blocked address", { A: ["1.1.1.1"] }, {}, "blocked_a"],
  ["A too many values", { A: publicA }, {}, "too_many_records"],
  ["A duplicate value", { A: [publicA[0], publicA[0]] }, {}, "duplicate_record_value"],
  ["AAAA not an array", { AAAA: publicAaaa[0] }, {}, "invalid_aaaa"],
  ["AAAA empty", { AAAA: [] }, {}, "invalid_aaaa"],
  ["AAAA non-string value", { AAAA: [123] }, {}, "invalid_aaaa"],
  ["AAAA invalid address", { AAAA: ["not-an-ip"] }, {}, "invalid_aaaa"],
  ["AAAA wrong family", { AAAA: [publicA[0]] }, {}, "invalid_aaaa"],
  ["AAAA private address", { AAAA: ["::1"] }, {}, "private_aaaa"],
  ["AAAA too many values", { AAAA: publicAaaa }, {}, "too_many_records"],
  ["AAAA duplicate value", { AAAA: [publicAaaa[0], publicAaaa[0]] }, {}, "duplicate_record_value"],
  ["CNAME not a string", { CNAME: 123 }, {}, "invalid_cname"],
  ["CNAME with protocol", { CNAME: "https://example.com" }, {}, "invalid_cname"],
  ["CNAME inside the zone", { CNAME: "foo.has-a.link" }, {}, "cname_blocked_target"],
  ["CNAME combined", { CNAME: "example.com", A: [publicA[0]] }, {}, "cname_combined"],
  ["TXT not an array", { TXT: "value" }, {}, "invalid_txt"],
  ["TXT empty", { TXT: [] }, {}, "invalid_txt"],
  ["TXT non-string value", { TXT: [123] }, {}, "invalid_txt"],
  ["TXT empty value", { TXT: [""] }, {}, "invalid_txt"],
  ["TXT too long", { TXT: ["a".repeat(256)] }, {}, "txt_too_long"],
  ["TXT duplicate", { TXT: ["value", "value"] }, {}, "duplicate_record_value"],
  ["TXT too many values", { TXT: ["a", "b", "c", "d", "e", "f"] }, {}, "too_many_records"],
  ["MX not an array", { MX: "mx.example.com" }, {}, "invalid_mx"],
  ["MX empty", { MX: [] }, {}, "invalid_mx"],
  ["MX non-object value", { MX: [123] }, {}, "invalid_mx"],
  [
    "MX invalid priority",
    { MX: [{ priority: "10", target: "mx.example.com" }] },
    {},
    "mx_priority"
  ],
  ["MX priority range", { MX: [{ priority: 70000, target: "mx.example.com" }] }, {}, "mx_priority"],
  [
    "MX invalid target",
    { MX: [{ priority: 10, target: "https://mx.example.com" }] },
    {},
    "invalid_mx"
  ],
  [
    "MX inside the zone",
    { MX: [{ priority: 10, target: "mx.has-a.link" }] },
    { subdomain: "mx" },
    "mx_self"
  ],
  [
    "MX duplicate",
    {
      MX: [
        { priority: 10, target: "mx.example.com" },
        { priority: 10, target: "mx.example.com" }
      ]
    },
    {},
    "duplicate_record_value"
  ],
  [
    "MX too many values",
    {
      MX: Array.from({ length: 6 }, (_, index) => ({
        priority: index + 1,
        target: `mx${index}.example.com`
      }))
    },
    {},
    "too_many_records"
  ],
  ["invalid proxied", { A: [publicA[0]] }, { extra: { proxied: "yes" } }, "invalid_proxied"],
  [
    "proxied without proxyable record",
    { TXT: ["value"] },
    { subdomain: "mail.test", extra: { proxied: true } },
    "proxied_without_proxyable_record"
  ],
  [
    "root requires usable record",
    { TXT: ["value"] },
    { subdomain: "txt" },
    "root_requires_usable_record"
  ],
  ["unknown record type", { A: [publicA[0]], NS: ["ns1.example.com"] }, {}, "unknown_record_type"],
  [
    "too many total records",
    { A: publicA.slice(0, 5), AAAA: publicAaaa.slice(0, 5), TXT: ["value"] },
    {},
    "too_many_records"
  ]
];

for (const [name, records, options, expected] of recordCases) {
  test(`records: ${name}`, (t) => {
    const errors = validate(records, options);

    t.true(codesFor(errors).includes(expected), codesFor(errors).join(", "));
  });
}

test("records: blocked CNAME exact target", (t) => {
  const configOverrides = {
    blockedCnameTargets: {
      exact: ["blocked.example"],
      suffixes: []
    }
  };
  const errors = validate({ CNAME: "blocked.example" }, { configOverrides });

  t.deepEqual(codesFor(errors), ["cname_blocked_target"]);
});

test("records: blocked A CIDR", (t) => {
  const configOverrides = {
    blockedIpRanges: {
      ipv4: { addresses: [], cidrs: ["93.184.216.0/24"] },
      ipv6: { addresses: [], cidrs: [] }
    }
  };
  const errors = validate({ A: [publicA[0]] }, { configOverrides });

  t.deepEqual(codesFor(errors), ["blocked_a"]);
});

test("records: blocked AAAA exact target", (t) => {
  const configOverrides = {
    blockedIpRanges: {
      ipv4: { addresses: [], cidrs: [] },
      ipv6: { addresses: [publicAaaa[0]], cidrs: [] }
    }
  };
  const errors = validate({ AAAA: [publicAaaa[0]] }, { configOverrides });

  t.deepEqual(codesFor(errors), ["blocked_aaaa"]);
});

test("records: blocked AAAA CIDR", (t) => {
  const configOverrides = {
    blockedIpRanges: {
      ipv4: { addresses: [], cidrs: [] },
      ipv6: { addresses: [], cidrs: ["2606:2800::/32"] }
    }
  };
  const errors = validate({ AAAA: [publicAaaa[0]] }, { configOverrides });

  t.deepEqual(codesFor(errors), ["blocked_aaaa"]);
});

test("records: missing blocked IP family does not throw", (t) => {
  const configOverrides = {
    blockedIpRanges: {
      ipv4: { addresses: [], cidrs: [] }
    }
  };
  const errors = validate({ AAAA: [publicAaaa[0]] }, { configOverrides });

  t.deepEqual(errors, []);
});
