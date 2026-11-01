import { ERROR_CODES, createError, dedupeErrors } from "../errors.js";

const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function ownerUsername(data) {
  const username = data?.owner?.username;

  return typeof username === "string" ? username.toLowerCase() : null;
}

export function isTrustedUser(author, trustedUsers) {
  if (!author) {
    return false;
  }

  const authorId = Number(author.id);
  const authorUsername = author.username?.toLowerCase();

  return trustedUsers.some((user) => {
    if (Number.isInteger(user.id) && Number.isInteger(authorId) && user.id === authorId) {
      return true;
    }

    return Boolean(
      authorUsername && user.username && user.username.toLowerCase() === authorUsername
    );
  });
}

export function isAdminUser(author, trustedUsers) {
  if (!author) {
    return false;
  }

  const authorId = Number(author.id);
  const authorUsername = author.username?.toLowerCase();

  return trustedUsers.some((user) => {
    const matches =
      (Number.isInteger(user.id) && Number.isInteger(authorId) && user.id === authorId) ||
      Boolean(authorUsername && user.username && user.username.toLowerCase() === authorUsername);

    return matches && user.admin === true;
  });
}

export function validateOwner(data, { file }) {
  const errors = [];
  const owner = data?.owner;
  const add = (code, path, detail) => {
    errors.push(createError(code, { file, path, detail }));
  };

  if (owner === undefined || owner === null) {
    add(ERROR_CODES.OWNER_MISSING, "/owner", "The owner field is required.");
    return dedupeErrors(errors);
  }

  if (typeof owner !== "object" || Array.isArray(owner)) {
    add(ERROR_CODES.INVALID_OWNER, "/owner", "The owner field must be an object.");
    return dedupeErrors(errors);
  }

  if (typeof owner.username !== "string" || owner.username.length === 0) {
    add(
      ERROR_CODES.MISSING_OWNER_USERNAME,
      "/owner/username",
      "The owner.username field is required."
    );
  } else if (!USERNAME_PATTERN.test(owner.username)) {
    add(
      ERROR_CODES.INVALID_OWNER_USERNAME,
      "/owner/username",
      "The owner.username is not a valid GitHub username."
    );
  }

  if (owner.email !== undefined) {
    if (typeof owner.email !== "string" || !EMAIL_PATTERN.test(owner.email)) {
      add(
        ERROR_CODES.INVALID_EMAIL,
        "/owner/email",
        "The owner.email is not a valid email address."
      );
    }
  }

  return dedupeErrors(errors);
}

export function authorizeDomainChange({ file, author, base, head, changeType, trustedUsers }) {
  const errors = [];
  const authorUsername = author?.username?.toLowerCase() ?? null;
  const trusted = isTrustedUser(author, trustedUsers);
  const admin = isAdminUser(author, trustedUsers);
  const baseOwner = ownerUsername(base);
  const headOwner = ownerUsername(head);
  const add = (code, detail) => {
    errors.push(createError(code, { file, path: "owner", detail }));
  };
  const authorized = (owner) => owner !== null && (owner === authorUsername || trusted);

  switch (changeType) {
    case "added":
      if (headOwner && !authorized(headOwner)) {
        add(
          ERROR_CODES.OWNER_MISMATCH,
          `The owner "${headOwner}" does not match the pull request author "${authorUsername}".`
        );
      }
      break;

    case "modified":
      if (baseOwner && !authorized(baseOwner)) {
        add(
          ERROR_CODES.OWNER_MISMATCH,
          `The existing owner "${baseOwner}" does not match the pull request author "${authorUsername}".`
        );
      }

      if (headOwner && !authorized(headOwner)) {
        add(
          ERROR_CODES.OWNER_MISMATCH,
          `The new owner "${headOwner}" does not match the pull request author "${authorUsername}".`
        );
      }

      if (baseOwner && headOwner && baseOwner !== headOwner && !admin) {
        add(
          ERROR_CODES.OWNER_CHANGE,
          "Changing the owner of an existing domain requires an admin maintainer."
        );
      }
      break;

    case "deleted":
      if (baseOwner && !authorized(baseOwner)) {
        add(
          ERROR_CODES.UNAUTHORIZED_DELETE,
          `The owner "${baseOwner}" is not authorized to delete this domain.`
        );
      }
      break;

    case "renamed":
      if (baseOwner && !authorized(baseOwner)) {
        add(
          ERROR_CODES.UNAUTHORIZED_RENAME,
          `The owner "${baseOwner}" is not authorized to rename this domain.`
        );
      }

      if (headOwner && !authorized(headOwner)) {
        add(
          ERROR_CODES.OWNER_MISMATCH,
          `The new owner "${headOwner}" does not match the pull request author "${authorUsername}".`
        );
      }

      if (baseOwner && headOwner && baseOwner !== headOwner && !admin) {
        add(
          ERROR_CODES.OWNER_CHANGE,
          "Changing the owner of an existing domain requires an admin maintainer."
        );
      }
      break;

    default:
      throw new Error(`Unknown change type: ${changeType}`);
  }

  return dedupeErrors(errors);
}
