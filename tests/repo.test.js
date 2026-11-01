import test from "ava";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
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

const messageFiles = walk("messages").filter((file) => file.endsWith(".md"));
const emojiPattern = /\p{Extended_Pictographic}/u;

test("reference-only paths are absent", (t) => {
  const removedPaths = [
    "media",
    "TERMS_OF_SERVICE.md",
    "util",
    "dnsconfig.js",
    "NOTICE",
    "raw-api",
    ".github/workflows/releaselog.yml"
  ];

  for (const removedPath of removedPaths) {
    t.false(fs.existsSync(path.join(root, removedPath)), `${removedPath} should not exist`);
  }

  t.true(fs.existsSync(path.join(root, "utils")), "utils directory should exist");
});

test("README has the required sections and excludes removed content", (t) => {
  const readme = read("README.md");

  for (const heading of [
    "## Supported records",
    "## Register a subdomain",
    "## Requirements",
    "## Abuse",
    "## License"
  ]) {
    t.true(readme.includes(heading), `README should include ${heading}`);
  }

  t.true(
    readme.includes("MIT. See [LICENSE](./LICENSE)."),
    "README should end with the license section"
  );
  t.false(readme.includes("is-a.dev"), "README should not contain is-a.dev");
  t.false(readme.includes("docs/"), "README should not link to docs");
  t.false(readme.includes("## Repository layout"), "README should not contain repository layout");
  t.false(readme.includes("## Local development"), "README should not contain local development");
  t.false(readme.includes("## Credits"), "README should not contain a credits section");
});

test("CONTRIBUTING contains repository layout and local development", (t) => {
  const contributing = read("CONTRIBUTING.md");

  t.true(contributing.includes("## Repository layout"));
  t.true(contributing.includes("## Local development"));
  t.true(contributing.includes("npm ci"));
  t.true(contributing.includes("npm test"));
  t.true(contributing.includes("npm run format:check"));
});

test("messages contain no emojis or foreign service references", (t) => {
  for (const file of messageFiles) {
    const contents = read(file);

    t.false(emojiPattern.test(contents), `${file} contains an emoji`);
    t.false(contents.includes("is-a.dev"), `${file} contains a foreign service reference`);
  }
});

test("PR template markers match the configuration", (t) => {
  const config = readJson("config/pr-template.json");
  const template = read(".github/PULL_REQUEST_TEMPLATE.md");

  for (const marker of config.requiredCheckboxes) {
    t.true(template.includes(`<!-- ${marker} -->`), `Missing checkbox marker ${marker}`);
  }

  for (const section of config.requiredSections) {
    t.true(template.includes(section.start), `Missing section start marker ${section.start}`);
    t.true(template.includes(section.end), `Missing section end marker ${section.end}`);
  }
});

test("domain registry contains only JSON files and its README", (t) => {
  const entries = fs.readdirSync(path.join(root, "domains"), { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      t.fail(`Unexpected directory in domains/: ${entry.name}`);
    } else {
      t.true(
        entry.name === "README.md" || entry.name.endsWith(".json"),
        `Unexpected file in domains/: ${entry.name}`
      );
    }
  }
});

test("message manifest is an object", (t) => {
  const manifest = readJson("messages/manifest.json");

  t.true(typeof manifest === "object" && manifest !== null && !Array.isArray(manifest));
});

test("message placeholders are known", (t) => {
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
    const contents = read(file);
    const matches = [...contents.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)];

    for (const match of matches) {
      t.true(allowed.has(match[1]), `${file} uses unknown placeholder ${match[1]}`);
    }
  }
});
