import test from "ava";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ERROR_CODES } from "../utils/lib/errors.js";
import {
  PR_COMMENT_MARKER,
  MERGE_CONFLICT_MARKER,
  renderError,
  renderMergeConflict,
  renderPrComment,
  renderTemplate
} from "../utils/lib/messages.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const messagesRoot = path.join(root, "messages");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(directory) {
  const results = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

const messageFiles = walk(messagesRoot).filter((file) => file.endsWith(".md"));
const emojiPattern = /\p{Extended_Pictographic}/u;

test("every message file is non-empty", (t) => {
  for (const file of messageFiles) {
    t.true(fs.statSync(file).size > 0, `${path.relative(root, file)} is empty`);
  }
});

test("message files contain no emojis", (t) => {
  for (const file of messageFiles) {
    t.false(
      emojiPattern.test(read(path.relative(root, file))),
      `${path.relative(root, file)} contains an emoji`
    );
  }
});

test("message files contain no foreign service references", (t) => {
  for (const file of messageFiles) {
    t.false(
      read(path.relative(root, file)).includes("is-a.dev"),
      `${path.relative(root, file)} contains a foreign service reference`
    );
  }
});

test("message placeholders use known names", (t) => {
  const allowed = new Set([
    "repoUrl",
    "summary",
    "errors",
    "footer",
    "file",
    "path",
    "message",
    "detail"
  ]);

  for (const file of messageFiles) {
    const contents = read(path.relative(root, file));
    const matches = [...contents.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)];

    for (const match of matches) {
      t.true(
        allowed.has(match[1]),
        `${path.relative(root, file)} uses unknown placeholder ${match[1]}`
      );
    }
  }
});

test("manifest entries are safe relative markdown paths", (t) => {
  const manifest = JSON.parse(read("messages/manifest.json"));

  t.true(typeof manifest === "object" && manifest !== null && !Array.isArray(manifest));

  for (const [code, target] of Object.entries(manifest)) {
    t.is(typeof target, "string", `${code} should map to a string`);
    t.true(target.endsWith(".md"), `${code} should map to a markdown file`);
    t.false(target.startsWith("/"), `${code} should be relative`);
    t.false(target.includes(".."), `${code} should not escape messages/`);
    t.true(fs.existsSync(path.join(messagesRoot, target)), `${code} maps to a missing file`);
  }
});

test("manifest covers every validation error code", (t) => {
  const manifest = JSON.parse(read("messages/manifest.json"));
  const missing = Object.values(ERROR_CODES).filter((code) => !manifest[code]);

  t.deepEqual(missing, []);
});

test("manifest only contains known error codes and the fallback", (t) => {
  const manifest = JSON.parse(read("messages/manifest.json"));
  const known = new Set([...Object.values(ERROR_CODES), "unknown"]);

  for (const code of Object.keys(manifest)) {
    t.true(known.has(code), `Unknown manifest code ${code}`);
  }
});

test("every manifest target renders without leftover placeholders", (t) => {
  const manifest = JSON.parse(read("messages/manifest.json"));

  for (const code of [...Object.values(ERROR_CODES), "unknown"]) {
    const rendered = renderError(
      {
        code,
        file: "domains/test.json",
        path: "/records/A",
        detail: "Test detail."
      },
      { root: messagesRoot }
    );

    t.false(rendered.includes("{{"), `${code} left a placeholder`);
    t.true(rendered.includes("domains/test.json"), `${code} did not include the file`);
    t.true(rendered.includes("Test detail."), `${code} did not include the detail`);
  }
});

test("renderTemplate throws for a missing variable", (t) => {
  t.throws(() => renderTemplate("Hello {{name}}", {}), {
    message: /Missing message variable/
  });
});

test("a failed PR comment includes the marker, summary, and footer", (t) => {
  const comment = renderPrComment({
    errors: [
      {
        code: ERROR_CODES.INVALID_A,
        file: "domains/test.json",
        path: "/records/A/0",
        detail: "Invalid address."
      }
    ],
    root: messagesRoot
  });

  t.true(comment.includes(PR_COMMENT_MARKER));
  t.true(comment.includes("Found 1 validation issue in 1 file."));
  t.true(comment.includes("Invalid address."));
  t.true(comment.includes("Push a fix to this branch"));
  t.false(comment.includes("{{"));
});

test("a successful PR comment includes the marker and success message", (t) => {
  const comment = renderPrComment({ errors: [], root: messagesRoot });

  t.true(comment.includes(PR_COMMENT_MARKER));
  t.true(comment.includes("All checks passed."));
});

test("the merge conflict message includes its marker", (t) => {
  const comment = renderMergeConflict({ root: messagesRoot });

  t.true(comment.includes(MERGE_CONFLICT_MARKER));
  t.true(comment.includes("conflicts with the `main` branch"));
});

test("the PR validation comment has its marker", (t) => {
  const comment = read("messages/pr/comment.md");

  t.true(comment.includes(PR_COMMENT_MARKER));
});
