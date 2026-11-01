import test from "ava";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseArgs, runCheckFormatChanged } from "../utils/commands/check-format-changed.js";

function createRoot(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "has-a-link-format-changed-"));

  for (const [fileName, content] of Object.entries(files)) {
    const filePath = path.join(directory, fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return directory;
}

test("format changed files accepts formatted files", async (t) => {
  const root = createRoot({
    "docs/good.md": "# Title\n\nSome text.\n"
  });
  const client = {
    listPullRequestFiles: async () => [{ filename: "docs/good.md", status: "modified" }]
  };
  const lines = [];

  try {
    const errors = await runCheckFormatChanged({
      client,
      pullRequest: "1",
      root,
      write: (line) => lines.push(line)
    });

    t.deepEqual(errors, []);
    t.is(lines[0], "Changed files are formatted.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("format changed files reports unformatted files", async (t) => {
  const root = createRoot({
    "docs/bad.md": "#Title"
  });
  const client = {
    listPullRequestFiles: async () => [
      { filename: "docs/bad.md", status: "modified" },
      { filename: "docs/removed.md", status: "removed" }
    ]
  };
  const lines = [];

  try {
    const errors = await runCheckFormatChanged({
      client,
      pullRequest: "1",
      root,
      write: (line) => lines.push(line)
    });

    t.is(errors.length, 1);
    t.is(errors[0].code, "not_formatted");
    t.true(lines[0].includes("[not_formatted]"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("format changed files supports JSON output", async (t) => {
  const root = createRoot({
    "docs/bad.md": "#Title"
  });
  const client = {
    listPullRequestFiles: async () => [{ filename: "docs/bad.md", status: "modified" }]
  };
  const lines = [];

  try {
    await runCheckFormatChanged({
      client,
      pullRequest: "1",
      root,
      json: true,
      write: (line) => lines.push(line)
    });

    const output = JSON.parse(lines[0]);

    t.false(output.valid);
    t.is(output.errors.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("format changed files parses arguments", (t) => {
  t.deepEqual(parseArgs(["--pull-request", "12", "--json"]), {
    pullRequest: "12",
    repo: null,
    token: null,
    apiBase: null,
    json: true,
    help: false
  });
  t.throws(() => parseArgs(["--pull-request"]), {
    message: /--pull-request requires a value/
  });
  t.throws(() => parseArgs(["--unknown"]), { message: /Unknown argument/ });
});
