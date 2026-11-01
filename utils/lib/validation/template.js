import { ERROR_CODES, createError, dedupeErrors } from "../errors.js";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(value, search) {
  let count = 0;
  let index = 0;

  while ((index = value.indexOf(search, index)) !== -1) {
    count += 1;
    index += search.length;
  }

  return count;
}

export function validatePullRequestTemplate(body, prTemplate) {
  const errors = [];
  const file = "pull request";
  const add = (code, path, detail) => {
    errors.push(createError(code, { file, path, detail }));
  };

  if (typeof body !== "string" || body.trim().length === 0) {
    add(ERROR_CODES.TEMPLATE_MISSING, "body", "The pull request description is empty.");
    return dedupeErrors(errors);
  }

  for (const marker of prTemplate.requiredCheckboxes) {
    const pattern = new RegExp(`-\\s*\\[[xX]\\]\\s*<!--\\s*${escapeRegExp(marker)}\\s*-->`, "i");

    if (!pattern.test(body)) {
      add(
        ERROR_CODES.TEMPLATE_MISSING_CHECKBOX,
        marker,
        `The ${marker} requirement has not been checked.`
      );
    }
  }

  for (const section of prTemplate.requiredSections) {
    const startCount = countOccurrences(body, section.start);
    const endCount = countOccurrences(body, section.end);

    if (startCount !== 1 || endCount !== 1) {
      add(
        ERROR_CODES.TEMPLATE_MARKER_MISSING,
        section.key,
        `The ${section.key} markers must each appear exactly once.`
      );
      continue;
    }

    const startIndex = body.indexOf(section.start) + section.start.length;
    const endIndex = body.indexOf(section.end);
    const content = body.slice(startIndex, endIndex).trim();

    if (content.length === 0) {
      add(
        ERROR_CODES.TEMPLATE_MISSING_SECTION,
        section.key,
        `The ${section.key} section is empty.`
      );
    }
  }

  return dedupeErrors(errors);
}
