import test from "ava";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../utils/lib/config.js";
import { checkFileFormatting, checkFormatting } from "../utils/lib/format.js";
import { validateFilename } from "../utils/lib/validation/filename.js";
import {
  findDuplicateKeys,
  validateDomainFile,
  validatePullRequestTemplate,
  validateRegistry
} from "../utils/lib/validation/index.js";
import {
  authorizeDomainChange,
  isAdminUser,
  isTrustedUser,
  validateOwner
} from "../utils/lib/validation/owner.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = loadConfig();
const validDir = path.join(root, "tests", "fixtures", "valid");
const prDir = path.join(root, "tests", "fixtures", "pr");
const invalidCases = JSON.parse(
  fs.readFileSync(path.join(root, "tests", "fixtures", "invalid", "cases.json"), "utf8")
);

function readFixture(name) {
  return fs.readFileSync(path.join(prDir, name), "utf8");
}

function createTempRegistry(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-registry-"));

  for (const [fileName, content] of Object.entries(files)) {
    const filePath = path.join(directory, fileName);
    fs.writeFileSync(
      filePath,
      typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`
    );
  }

  return directory;
}

function codesFor(errors) {
  return [...new Set(errors.map((error) => error.code))].sort();
}

function configWith(overrides) {
  const custom = structuredClone(config);

  for (const [key, value] of Object.entries(overrides)) {
    custom[key] = value;
  }

  return custom;
}

test("valid fixtures pass validation", (t) => {
  const result = validateRegistry({ domainsDir: validDir, config });

  t.deepEqual(result.errors, []);
  t.is(result.entries.length, 9);
});

test("the real registry validates", (t) => {
  const result = validateRegistry({ config });

  t.deepEqual(result.errors, []);
});

for (const fixture of invalidCases) {
  test(`invalid fixture: ${fixture.name}`, (t) => {
    const directory = createTempRegistry(fixture.files);

    try {
      const result = validateRegistry({ domainsDir: directory, config });
      const actual = codesFor(result.errors);
      const expected = [...new Set(fixture.codes)].sort();

      t.deepEqual(
        actual,
        expected,
        result.errors
          .map((error) => `${error.code} ${error.file} ${error.path} ${error.detail}`)
          .join("\n")
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("filename: blocked exact name", (t) => {
  const custom = configWith({
    blockedSubdomains: { exact: ["blocked-test"], suffixes: [] }
  });
  const errors = validateFilename({
    file: "domains/blocked-test.json",
    subdomain: "blocked-test",
    config: custom
  });

  t.deepEqual(codesFor(errors), ["blocked_subdomain"]);
});

test("filename: blocked suffix", (t) => {
  const custom = configWith({
    blockedSubdomains: { exact: [], suffixes: [".blocked-suffix"] }
  });
  const errors = validateFilename({
    file: "domains/example.blocked-suffix.json",
    subdomain: "example.blocked-suffix",
    config: custom
  });

  t.deepEqual(codesFor(errors), ["blocked_subdomain"]);
});

test("filename: zone suffix", (t) => {
  const custom = configWith({
    reservedSubdomains: { exact: [], suffixes: [] },
    blockedSubdomains: { exact: [], suffixes: [] },
    internalSubdomains: { exact: [], suffixes: [] }
  });
  const errors = validateFilename({
    file: "domains/foo.has-a.link.json",
    subdomain: "foo.has-a.link",
    config: custom
  });

  t.deepEqual(codesFor(errors), ["filename_contains_zone"]);
});

test("filename: root label underscore", (t) => {
  const custom = configWith({
    reservedSubdomains: { exact: [], suffixes: [] },
    blockedSubdomains: { exact: [], suffixes: [] },
    internalSubdomains: { exact: [], suffixes: [] }
  });
  const errors = validateFilename({
    file: "domains/_vercel.json",
    subdomain: "_vercel",
    config: custom
  });

  t.deepEqual(codesFor(errors), ["root_label_underscore"]);
});

test("filename: punycode", (t) => {
  const custom = configWith({
    reservedSubdomains: { exact: [], suffixes: [] },
    blockedSubdomains: { exact: [], suffixes: [] },
    internalSubdomains: { exact: [], suffixes: [] }
  });
  const errors = validateFilename({
    file: "domains/xn--example.json",
    subdomain: "xn--example",
    config: custom
  });

  t.deepEqual(codesFor(errors), ["punycode_filename"]);
});

test("filename: reserved suffix", (t) => {
  const custom = configWith({
    reservedSubdomains: { exact: [], suffixes: [".reserved"] },
    blockedSubdomains: { exact: [], suffixes: [] },
    internalSubdomains: { exact: [], suffixes: [] }
  });
  const errors = validateFilename({
    file: "domains/example.reserved.json",
    subdomain: "example.reserved",
    config: custom
  });

  t.deepEqual(codesFor(errors), ["reserved_subdomain"]);
});

test("filename: empty", (t) => {
  const errors = validateFilename({
    file: "domains/.json",
    subdomain: "",
    config
  });

  t.deepEqual(codesFor(errors), ["invalid_filename"]);
});

test("filename: too long", (t) => {
  const subdomain = [63, 63, 63, 63].map(() => "a".repeat(63)).join(".");
  const errors = validateFilename({
    file: "domains/long.json",
    subdomain,
    config
  });

  t.true(codesFor(errors).includes("filename_too_long"));
});

test("filename: leading dot", (t) => {
  const custom = configWith({
    reservedSubdomains: { exact: [], suffixes: [] },
    blockedSubdomains: { exact: [], suffixes: [] },
    internalSubdomains: { exact: [], suffixes: [] }
  });
  const errors = validateFilename({
    file: "domains/.bad.json",
    subdomain: ".bad",
    config: custom
  });

  t.deepEqual(codesFor(errors), ["leading_or_trailing_dot"]);
});

test("filename: trailing dot", (t) => {
  const custom = configWith({
    reservedSubdomains: { exact: [], suffixes: [] },
    blockedSubdomains: { exact: [], suffixes: [] },
    internalSubdomains: { exact: [], suffixes: [] }
  });
  const errors = validateFilename({
    file: "domains/bad.json",
    subdomain: "bad.",
    config: custom
  });

  t.deepEqual(codesFor(errors), ["leading_or_trailing_dot"]);
});

test("duplicate key detection ignores invalid or property-free input", (t) => {
  t.deepEqual(findDuplicateKeys("not json"), []);
  t.deepEqual(findDuplicateKeys("{}"), []);
  t.deepEqual(findDuplicateKeys('[{"a":1}]'), []);
});

test("template: valid body", (t) => {
  t.deepEqual(validatePullRequestTemplate(readFixture("valid.md"), config.prTemplate), []);
});

test("template: extra content is allowed", (t) => {
  t.deepEqual(validatePullRequestTemplate(readFixture("extra-content.md"), config.prTemplate), []);
});

test("template: missing checkbox", (t) => {
  const errors = validatePullRequestTemplate(readFixture("missing-checkbox.md"), config.prTemplate);

  t.deepEqual(codesFor(errors), ["template_missing_checkbox"]);
});

test("template: missing preview section", (t) => {
  const errors = validatePullRequestTemplate(readFixture("missing-preview.md"), config.prTemplate);

  t.deepEqual(codesFor(errors), ["template_missing_section"]);
});

test("template: missing purpose section", (t) => {
  const errors = validatePullRequestTemplate(readFixture("missing-purpose.md"), config.prTemplate);

  t.deepEqual(codesFor(errors), ["template_missing_section"]);
});

test("template: missing markers", (t) => {
  const errors = validatePullRequestTemplate(readFixture("missing-markers.md"), config.prTemplate);

  t.deepEqual(codesFor(errors), ["template_marker_missing"]);
});

test("template: empty body", (t) => {
  const errors = validatePullRequestTemplate("", config.prTemplate);

  t.deepEqual(codesFor(errors), ["template_missing"]);
});

test("authorization: new domain by its owner", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "alice", id: 10 },
    base: null,
    head: { owner: { username: "alice" } },
    changeType: "added",
    trustedUsers: []
  });

  t.deepEqual(errors, []);
});

test("authorization: new domain for another owner", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "alice", id: 10 },
    base: null,
    head: { owner: { username: "bob" } },
    changeType: "added",
    trustedUsers: []
  });

  t.deepEqual(codesFor(errors), ["owner_mismatch"]);
});

test("authorization: trusted maintainer can register for another owner", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "maintainer", id: 1 },
    base: null,
    head: { owner: { username: "bob" } },
    changeType: "added",
    trustedUsers: [{ username: "maintainer", id: 1 }]
  });

  t.deepEqual(errors, []);
});

test("authorization: owner can modify their domain", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "alice", id: 10 },
    base: { owner: { username: "alice" } },
    head: { owner: { username: "alice" } },
    changeType: "modified",
    trustedUsers: []
  });

  t.deepEqual(errors, []);
});

test("authorization: owner cannot transfer a domain without admin", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "alice", id: 10 },
    base: { owner: { username: "alice" } },
    head: { owner: { username: "bob" } },
    changeType: "modified",
    trustedUsers: []
  });

  t.deepEqual(codesFor(errors), ["owner_change", "owner_mismatch"]);
});

test("authorization: admin can transfer a domain", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "admin", id: 2 },
    base: { owner: { username: "alice" } },
    head: { owner: { username: "bob" } },
    changeType: "modified",
    trustedUsers: [{ username: "admin", id: 2, admin: true }]
  });

  t.deepEqual(errors, []);
});

test("authorization: trusted non-admin cannot transfer a domain", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "maintainer", id: 1 },
    base: { owner: { username: "alice" } },
    head: { owner: { username: "bob" } },
    changeType: "modified",
    trustedUsers: [{ username: "maintainer", id: 1 }]
  });

  t.deepEqual(codesFor(errors), ["owner_change"]);
});

test("authorization: unrelated user cannot modify a domain", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "bob", id: 11 },
    base: { owner: { username: "alice" } },
    head: { owner: { username: "alice" } },
    changeType: "modified",
    trustedUsers: []
  });

  t.deepEqual(codesFor(errors), ["owner_mismatch"]);
});

test("authorization: unrelated user cannot delete a domain", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "bob", id: 11 },
    base: { owner: { username: "alice" } },
    head: null,
    changeType: "deleted",
    trustedUsers: []
  });

  t.deepEqual(codesFor(errors), ["unauthorized_delete"]);
});

test("authorization: owner can rename a domain", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "alice", id: 10 },
    base: { owner: { username: "alice" } },
    head: { owner: { username: "alice" } },
    changeType: "renamed",
    trustedUsers: []
  });

  t.deepEqual(errors, []);
});

test("authorization: rename with owner change requires admin", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "alice", id: 10 },
    base: { owner: { username: "alice" } },
    head: { owner: { username: "bob" } },
    changeType: "renamed",
    trustedUsers: []
  });

  t.deepEqual(codesFor(errors), ["owner_change", "owner_mismatch"]);
});

test("trusted user matching works by id and username", (t) => {
  const trustedUsers = [
    { username: "alice", id: 10 },
    { username: "admin", id: 20, admin: true }
  ];

  t.true(isTrustedUser({ username: "alice", id: 10 }, trustedUsers));
  t.true(isTrustedUser({ username: "ALICE", id: 999 }, trustedUsers));
  t.true(isTrustedUser({ username: "unknown", id: 20 }, trustedUsers));
  t.false(isTrustedUser({ username: "unknown", id: 30 }, trustedUsers));
  t.false(isTrustedUser(null, trustedUsers));
  t.true(isAdminUser({ username: "admin", id: 20 }, trustedUsers));
  t.false(isAdminUser({ username: "alice", id: 10 }, trustedUsers));
  t.false(isAdminUser(null, trustedUsers));
});

test("owner validation rejects a non-object owner", (t) => {
  const errors = validateOwner(
    { owner: "alice", records: { CNAME: "example.com" } },
    { file: "domains/example.json" }
  );

  t.deepEqual(codesFor(errors), ["invalid_owner"]);
});

test("authorization: unrelated user cannot rename a domain", (t) => {
  const errors = authorizeDomainChange({
    file: "domains/example.json",
    author: { username: "bob", id: 11 },
    base: { owner: { username: "alice" } },
    head: { owner: { username: "alice" } },
    changeType: "renamed",
    trustedUsers: []
  });

  t.deepEqual(codesFor(errors), ["owner_mismatch", "unauthorized_rename"]);
});

test("authorization: unknown change type throws", (t) => {
  t.throws(
    () =>
      authorizeDomainChange({
        file: "domains/example.json",
        author: { username: "alice", id: 10 },
        base: null,
        head: { owner: { username: "alice" } },
        changeType: "unknown",
        trustedUsers: []
      }),
    { message: /Unknown change type/ }
  );
});

test("owner domain limit", (t) => {
  const files = {};

  for (let index = 0; index < 11; index += 1) {
    files[`site${index}.json`] = {
      owner: { username: "alice" },
      records: { CNAME: `site${index}.example.com` }
    };
  }

  const directory = createTempRegistry(files);

  try {
    const result = validateRegistry({ domainsDir: directory, config });
    const codes = codesFor(result.errors);

    t.true(codes.includes("too_many_domains"));
    t.false(codes.includes("too_many_single_character_subdomains"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("duplicate key detection handles nested objects and arrays", (t) => {
  t.deepEqual(findDuplicateKeys('{"a":1,"a":2}'), ["a"]);
  t.deepEqual(findDuplicateKeys('{"a":{"b":1,"b":2}}'), ["b"]);
  t.deepEqual(findDuplicateKeys('[{"a":1,"a":2}]'), ["a"]);
});

test("direct validation reports invalid JSON", (t) => {
  const errors = validateDomainFile({
    file: "domains/bad.json",
    subdomain: "bad",
    raw: "{",
    data: null,
    parseError: new Error("Unexpected end of JSON input"),
    config
  });

  t.deepEqual(codesFor(errors), ["invalid_json"]);
});

test("formatting check detects formatted and unformatted files", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-format-"));
  const formatted = path.join(directory, "formatted.json");
  const unformatted = path.join(directory, "unformatted.json");
  const options = {
    printWidth: 100,
    tabWidth: 2,
    trailingComma: "none",
    endOfLine: "lf"
  };

  fs.writeFileSync(formatted, '{\n  "a": 1\n}\n');
  fs.writeFileSync(unformatted, '{"a":1}');

  try {
    t.true(await checkFileFormatting(formatted, options));
    t.false(await checkFileFormatting(unformatted, options));

    const errors = await checkFormatting([unformatted], {
      displayPath: () => "domains/unformatted.json",
      options
    });

    t.deepEqual(codesFor(errors), ["not_formatted"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
