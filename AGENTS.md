# Instructions for AI agents

This repository is the domain registry for `has-a.link`. It accepts domain registrations through pull requests, validates them, and publishes DNS records to Cloudflare after merge.

## Required behavior

- Run `npm test` and `npm run format:check` before finishing a task.
- Run `npm run validate` when changing registry files, configuration, or validation logic.
- Keep changes focused and consistent with the existing structure.
- Leave all changes uncommitted. Do not run `git commit`, `git push`, or create releases.
- Do not add secrets, tokens, or personal credentials to any file.
- Do not add emojis to `messages/` or workflow files.
- Keep bot-facing text in `messages/`.
- Keep shared logic in `utils/lib/` and command entry points in `utils/commands/`.
- Keep policy lists, limits, labels, and Cloudflare settings in `config/`.
- Update `schema/domain.schema.json`, documentation, and tests when changing the domain format.
- Add tests for every new validation rule, message, label behavior, or deployment path.

## Domain files

- One JSON file per DNS name in `domains/`.
- Do not edit or create a domain file unless the task is explicitly about a domain registration.
- Domain files must follow the filename rules and JSON schema.

## Commands

```bash
npm ci
npm test
npm run format
npm run format:check
npm run validate
npm run simulate:pr -- --scenario valid
npm run deploy:dry
npm run sync:labels
```

## Documentation

Detailed documentation lives in `docs/`. Contributor setup and repository layout live in `CONTRIBUTING.md`.
