import test from "ava";

import {
  createError,
  dedupeErrors,
  formatError,
  formatErrors,
  groupErrorsByFile,
  sortErrors
} from "../utils/lib/errors.js";
import { formatValidationResult } from "../utils/lib/format.js";

test("createError applies defaults", (t) => {
  const error = createError("invalid_a");

  t.deepEqual(error, {
    code: "invalid_a",
    file: null,
    path: null,
    detail: ""
  });
});

test("dedupeErrors removes duplicate codes per file and path", (t) => {
  const errors = [
    createError("invalid_a", { file: "domains/a.json", path: "/records/A", detail: "one" }),
    createError("invalid_a", { file: "domains/a.json", path: "/records/A", detail: "two" }),
    createError("invalid_a", { file: "domains/b.json", path: "/records/A", detail: "three" })
  ];

  t.is(dedupeErrors(errors).length, 2);
});

test("sortErrors orders by file, path, and code", (t) => {
  const errors = [
    createError("zeta", { file: "domains/b.json", path: "/z" }),
    createError("alpha", { file: "domains/a.json", path: "/z" }),
    createError("beta", { file: "domains/a.json", path: "/a" })
  ];

  t.deepEqual(
    sortErrors(errors).map((error) => error.code),
    ["beta", "alpha", "zeta"]
  );
});

test("groupErrorsByFile groups by file", (t) => {
  const errors = [
    createError("invalid_a", { file: "domains/a.json" }),
    createError("invalid_cname", { file: "domains/b.json" })
  ];
  const groups = groupErrorsByFile(errors);

  t.is(groups.size, 2);
  t.is(groups.get("domains/a.json").length, 1);
});

test("formatError includes the file, path, detail, and code", (t) => {
  const error = createError("invalid_a", {
    file: "domains/a.json",
    path: "/records/A/0",
    detail: "Invalid address."
  });

  t.is(formatError(error), "domains/a.json /records/A/0: Invalid address. [invalid_a]");
  t.is(formatError(createError("invalid_a")), "Validation failed [invalid_a]");
});

test("formatErrors sorts and joins errors", (t) => {
  const errors = [
    createError("zeta", { file: "domains/b.json", detail: "Second." }),
    createError("alpha", { file: "domains/a.json", detail: "First." })
  ];

  t.is(formatErrors(errors), "domains/a.json: First. [alpha]\ndomains/b.json: Second. [zeta]");
});

test("formatValidationResult handles success and failure", (t) => {
  t.is(formatValidationResult({ entries: [1, 2], errors: [] }), "Validated 2 domain file(s).");

  const failed = formatValidationResult({
    entries: [1],
    errors: [createError("invalid_a", { file: "domains/a.json", detail: "Bad." })]
  });

  t.true(failed.includes("1 validation error(s):"));
  t.true(failed.includes("Bad. [invalid_a]"));
});
