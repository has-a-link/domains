import test from "ava";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const allowed = new Set(["repoUrl", "summary", "errors", "footer", "file", "detail"]);

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

test("the PR validation comment has its marker", (t) => {
  const comment = read("messages/pr/comment.md");

  t.true(comment.includes("<!-- has-a-link-bot: pr-validation -->"));
});
