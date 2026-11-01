# Contributing

Thanks for helping improve has-a.link.

## Local development

Requirements:

- Node.js 24 or newer
- npm

Install dependencies:

```bash
npm ci
```

Run the test suite:

```bash
npm test
```

Watch tests during development:

```bash
npm run test:watch
```

Format the repository:

```bash
npm run format
```

Check formatting without writing:

```bash
npm run format:check
```

Validate the full registry:

```bash
npm run validate
```

Validate a pull request scenario without opening a pull request:

```bash
npm run simulate:pr -- --scenario valid
```

Preview Cloudflare DNS changes without applying them:

```bash
npm run deploy:dry
```

Create or update GitHub labels from `config/labels.json`:

```bash
npm run sync:labels
```

Use `--dry-run` with `sync:labels` or `deploy` to preview changes.

## Documentation

- [Registering a subdomain](./docs/registering.md)
- [Domain structure](./docs/domain-structure.md)
- [Record types](./docs/record-types.md)
- [Review guidelines](./docs/review-guidelines.md)
- [Maintainer guide](./docs/maintainers.md)

## Registering a domain

Follow the registration steps in the [README](./README.md#register-a-subdomain). Domain pull requests must use the repository pull request template and pass validation before review.

## Changing validation or configuration

- Validation logic belongs in `utils/lib/validation/`.
- Command entry points belong in `utils/commands/`.
- Policy lists and limits belong in `config/`.
- Domain structure changes must update `schema/domain.schema.json`, the relevant documentation, and the tests.
- Every new validation rule needs at least one invalid fixture and an expected error code.

## Changing bot messages

- All bot-facing text belongs in `messages/`.
- Error messages are mapped through `messages/manifest.json`.
- Messages must not contain emojis.
- Messages must not contain unrendered placeholders.
- Run `npm test` after changing messages.

## Changing labels

- Label names, colors, and descriptions belong in `config/labels.json`.
- Colors must be six hexadecimal characters without a leading `#`.
- Run `npm run sync:labels` to create or update labels.
- The pull request bot also creates missing labels before applying them.

## Pull requests

- Keep changes focused.
- Run `npm run format:check` and `npm test` before opening a pull request.
- Explain what changed and why.
- Do not include secrets, tokens, or personal credentials.
- Use Conventional Commits for commit messages, for example `feat: add record validation`, `fix: correct mx priority check`, or `docs: update registration steps`.

## Security

Do not report security vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md).
