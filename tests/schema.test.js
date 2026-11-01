import test from "ava";

import { validateSchema } from "../utils/lib/validation/schema.js";

const base = {
  owner: { username: "alice" },
  records: { CNAME: "example.com" }
};

function codesFor(data) {
  return [...new Set(validateSchema(data, "domains/test.json").map((error) => error.code))].sort();
}

const schemaCases = [
  ["valid domain", base, null],
  ["top-level null", null, "invalid_domain"],
  ["owner missing", { records: { CNAME: "example.com" } }, "owner_missing"],
  ["owner not an object", { owner: "alice", records: { CNAME: "example.com" } }, "invalid_owner"],
  [
    "owner username missing",
    { owner: {}, records: { CNAME: "example.com" } },
    "missing_owner_username"
  ],
  [
    "owner username not a string",
    { owner: { username: 123 }, records: { CNAME: "example.com" } },
    "invalid_owner_username"
  ],
  [
    "owner username invalid",
    { owner: { username: "-alice" }, records: { CNAME: "example.com" } },
    "invalid_owner_username"
  ],
  [
    "owner email not a string",
    { owner: { username: "alice", email: 123 }, records: { CNAME: "example.com" } },
    "invalid_email"
  ],
  [
    "owner email invalid",
    { owner: { username: "alice", email: "bad" }, records: { CNAME: "example.com" } },
    "invalid_email"
  ],
  [
    "unknown owner field",
    { owner: { username: "alice", extra: true }, records: { CNAME: "example.com" } },
    "unknown_field"
  ],
  ["records missing", { owner: { username: "alice" } }, "missing_records"],
  [
    "records not an object",
    { owner: { username: "alice" }, records: "invalid" },
    "invalid_records"
  ],
  ["records empty", { owner: { username: "alice" }, records: {} }, "missing_records"],
  [
    "unknown record type",
    {
      owner: { username: "alice" },
      records: { A: ["93.184.216.34"], NS: ["ns1.example.com"] }
    },
    "unknown_record_type"
  ],
  [
    "too many record types",
    {
      owner: { username: "alice" },
      records: {
        A: ["93.184.216.34"],
        AAAA: ["2606:2800:220:1:248:1893:25c8:1946"],
        CNAME: "example.com",
        MX: [{ priority: 10, target: "mx.example.com" }],
        TXT: ["value"],
        NS: ["ns1.example.com"]
      }
    },
    "too_many_records"
  ],
  [
    "proxied not a boolean",
    { owner: { username: "alice" }, records: { CNAME: "example.com" }, proxied: "yes" },
    "invalid_proxied"
  ],
  [
    "A not an array",
    { owner: { username: "alice" }, records: { A: "93.184.216.34" } },
    "invalid_a"
  ],
  ["A empty", { owner: { username: "alice" }, records: { A: [] } }, "invalid_a"],
  [
    "A invalid format",
    { owner: { username: "alice" }, records: { A: ["not-an-ip"] } },
    "invalid_a"
  ],
  [
    "A too many",
    {
      owner: { username: "alice" },
      records: {
        A: [
          "93.184.216.34",
          "93.184.216.35",
          "93.184.216.36",
          "93.184.216.37",
          "93.184.216.38",
          "93.184.216.39"
        ]
      }
    },
    "too_many_records"
  ],
  [
    "A duplicate",
    { owner: { username: "alice" }, records: { A: ["93.184.216.34", "93.184.216.34"] } },
    "duplicate_record_value"
  ],
  [
    "AAAA invalid format",
    { owner: { username: "alice" }, records: { AAAA: ["not-an-ip"] } },
    "invalid_aaaa"
  ],
  [
    "AAAA too many",
    {
      owner: { username: "alice" },
      records: {
        AAAA: [
          "2606:2800:220:1:248:1893:25c8:1946",
          "2606:2800:220:1:248:1893:25c8:1947",
          "2606:2800:220:1:248:1893:25c8:1948",
          "2606:2800:220:1:248:1893:25c8:1949",
          "2606:2800:220:1:248:1893:25c8:1950",
          "2606:2800:220:1:248:1893:25c8:1951"
        ]
      }
    },
    "too_many_records"
  ],
  [
    "CNAME not a string",
    { owner: { username: "alice" }, records: { CNAME: 123 } },
    "invalid_cname"
  ],
  [
    "CNAME invalid",
    { owner: { username: "alice" }, records: { CNAME: "https://example.com" } },
    "invalid_cname"
  ],
  ["TXT not an array", { owner: { username: "alice" }, records: { TXT: "value" } }, "invalid_txt"],
  ["TXT empty", { owner: { username: "alice" }, records: { TXT: [] } }, "invalid_txt"],
  ["TXT empty value", { owner: { username: "alice" }, records: { TXT: [""] } }, "invalid_txt"],
  [
    "TXT too long",
    { owner: { username: "alice" }, records: { TXT: ["a".repeat(256)] } },
    "txt_too_long"
  ],
  [
    "TXT too many",
    {
      owner: { username: "alice" },
      records: { TXT: ["a", "b", "c", "d", "e", "f"] }
    },
    "too_many_records"
  ],
  [
    "TXT duplicate",
    { owner: { username: "alice" }, records: { TXT: ["value", "value"] } },
    "duplicate_record_value"
  ],
  [
    "MX not an array",
    { owner: { username: "alice" }, records: { MX: "mx.example.com" } },
    "invalid_mx"
  ],
  ["MX empty", { owner: { username: "alice" }, records: { MX: [] } }, "invalid_mx"],
  ["MX item not an object", { owner: { username: "alice" }, records: { MX: [123] } }, "invalid_mx"],
  [
    "MX missing target",
    { owner: { username: "alice" }, records: { MX: [{ priority: 10 }] } },
    "invalid_mx"
  ],
  [
    "MX extra field",
    {
      owner: { username: "alice" },
      records: { MX: [{ priority: 10, target: "mx.example.com", extra: true }] }
    },
    "invalid_mx"
  ],
  [
    "MX priority not an integer",
    {
      owner: { username: "alice" },
      records: { MX: [{ priority: "10", target: "mx.example.com" }] }
    },
    "mx_priority"
  ],
  [
    "MX priority out of range",
    {
      owner: { username: "alice" },
      records: { MX: [{ priority: 70000, target: "mx.example.com" }] }
    },
    "mx_priority"
  ],
  [
    "MX invalid target",
    {
      owner: { username: "alice" },
      records: { MX: [{ priority: 10, target: "https://mx.example.com" }] }
    },
    "invalid_mx"
  ],
  [
    "MX duplicate",
    {
      owner: { username: "alice" },
      records: {
        MX: [
          { priority: 10, target: "mx.example.com" },
          { priority: 10, target: "mx.example.com" }
        ]
      }
    },
    "duplicate_record_value"
  ],
  [
    "MX too many",
    {
      owner: { username: "alice" },
      records: {
        MX: Array.from({ length: 6 }, (_, index) => ({
          priority: index + 1,
          target: `mx${index}.example.com`
        }))
      }
    },
    "too_many_records"
  ],
  ["unknown top-level field", { ...base, extra: true }, "unknown_field"]
];

for (const [name, data, expected] of schemaCases) {
  test(`schema: ${name}`, (t) => {
    const codes = codesFor(data);

    if (expected === null) {
      t.deepEqual(codes, []);
    } else {
      t.true(codes.includes(expected), codes.join(", "));
    }
  });
}
