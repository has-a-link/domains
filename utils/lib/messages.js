import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./config.js";

export const MESSAGES_ROOT = path.join(REPO_ROOT, "messages");
export const PR_COMMENT_MARKER = "<!-- has-a-link-bot: pr-validation -->";
export const MERGE_CONFLICT_MARKER = "<!-- has-a-link-bot: merge-conflict -->";

export function loadManifest(root = MESSAGES_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
}

export function loadMessage(relativePath, root = MESSAGES_ROOT) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

export function renderTemplate(template, context) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!Object.hasOwn(context, key)) {
      throw new Error(`Missing message variable: ${key}`);
    }

    return String(context[key] ?? "");
  });
}

export function renderError(
  error,
  { root = MESSAGES_ROOT, repoUrl = "", manifest = loadManifest(root) } = {}
) {
  const target = manifest[error.code] ?? manifest.unknown;
  const message = renderTemplate(loadMessage(target, root), {
    ...error,
    repoUrl
  });
  const wrapper = loadMessage("pr/error.md", root);

  return renderTemplate(wrapper, {
    file: error.file ?? "unknown",
    path: error.path ?? "/",
    message
  }).trim();
}

function plural(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm;
}

export function renderPrComment({ errors, root = MESSAGES_ROOT, repoUrl = "" }) {
  if (errors.length === 0) {
    return `${renderTemplate(loadMessage("pr/success.md", root), { repoUrl }).trim()}\n`;
  }

  const manifest = loadManifest(root);
  const fileCount = new Set(errors.map((error) => error.file ?? "unknown")).size;
  const summary = `Found ${errors.length} validation ${plural(
    errors.length,
    "issue",
    "issues"
  )} in ${fileCount} ${plural(fileCount, "file", "files")}.`;
  const renderedErrors = errors
    .map((error) => renderError(error, { root, repoUrl, manifest }))
    .join("\n\n");
  const footer = loadMessage("pr/footer.md", root).trim();
  const comment = renderTemplate(loadMessage("pr/comment.md", root), {
    summary,
    errors: renderedErrors,
    footer
  });

  return `${comment.trim()}\n`;
}

export function renderMergeConflict({ root = MESSAGES_ROOT } = {}) {
  return `${loadMessage("pr/merge-conflict.md", root).trim()}\n`;
}
