const INFRA_PREFIXES = [".github/", "config/", "messages/", "schema/", "tests/", "utils/"];
const INFRA_FILES = new Set([
  "package.json",
  "package-lock.json",
  ".prettierrc",
  ".prettierignore",
  ".editorconfig",
  ".nvmrc",
  ".gitignore"
]);
const DOC_FILES = new Set([
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "AGENTS.md",
  "LICENSE",
  "domains/README.md"
]);

export function isDomainFile(fileName) {
  return (
    typeof fileName === "string" && fileName.startsWith("domains/") && fileName.endsWith(".json")
  );
}

export function isInfrastructureFile(fileName) {
  return (
    typeof fileName === "string" &&
    (INFRA_PREFIXES.some((prefix) => fileName.startsWith(prefix)) || INFRA_FILES.has(fileName))
  );
}

export function isDocumentationFile(fileName) {
  return typeof fileName === "string" && (DOC_FILES.has(fileName) || fileName.startsWith("docs/"));
}

export function classifyChangedFiles(files) {
  const names = files.flatMap((file) => [file.filename, file.previous_filename]).filter(Boolean);

  return {
    domain: names.some(isDomainFile),
    infra: names.some(isInfrastructureFile),
    docs: names.some(isDocumentationFile)
  };
}
