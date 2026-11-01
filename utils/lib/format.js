import fs from "node:fs/promises";

import * as prettier from "prettier";

import { ERROR_CODES, createError, formatErrors } from "./errors.js";

export { formatError, formatErrors, groupErrorsByFile } from "./errors.js";

export async function checkFileFormatting(filePath, options = null) {
  const source = await fs.readFile(filePath, "utf8");
  const resolvedOptions = options ?? (await prettier.resolveConfig(filePath)) ?? {};

  return prettier.check(source, {
    ...resolvedOptions,
    filepath: filePath
  });
}

export async function checkFormatting(
  filePaths,
  { displayPath = (filePath) => filePath, options = null } = {}
) {
  const errors = [];

  for (const filePath of filePaths) {
    if (!(await checkFileFormatting(filePath, options))) {
      errors.push(
        createError(ERROR_CODES.NOT_FORMATTED, {
          file: displayPath(filePath),
          path: "file",
          detail: "Run npm run format to fix the formatting."
        })
      );
    }
  }

  return errors;
}

export function formatValidationResult({ entries, errors }) {
  if (errors.length === 0) {
    return `Validated ${entries.length} domain file(s).`;
  }

  return `${errors.length} validation error(s):\n\n${formatErrors(errors)}`;
}
