# Utilities

Shared logic lives in `lib/`. Command-line entry points live in `commands/`.

## Layout

- `lib/validation/`: domain, file name, owner, record, template, and registry validation.
- `lib/cloudflare/`: Cloudflare API client, desired-state planning, and synchronization.
- `lib/github/`: changed-file fetching, comments, and labels.
- `commands/`: CLI entry points used locally and by GitHub Actions.

## Rules

- Keep shared logic testable and free of command-line side effects.
- Keep network access behind injectable clients so tests can mock it.
- Keep policy values in `config/`.
- Keep bot text in `messages/`.
