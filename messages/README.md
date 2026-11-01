# Messages

All bot-facing text lives in this directory.

## Layout

- `manifest.json` maps every validation error code to a message file.
- `pr/comment.md` is the failed validation comment wrapper.
- `pr/success.md` is used when validation passes.
- `pr/error.md` wraps each individual error.
- `pr/footer.md` is appended to failed validation comments.
- `pr/errors/` contains the message text for each category of error.
- `pr/merge-conflict.md` is used by the branch updater.
- `stale/` contains stale issue and pull request messages.
- `maintenance/` contains maintenance workflow messages.

## Placeholders

Messages use double-brace placeholders:

```text
{{file}}
{{path}}
{{detail}}
{{summary}}
{{errors}}
{{footer}}
```

`pr/error.md` receives `{{file}}`, `{{path}}`, and `{{message}}`. Error message files receive the validation error fields, including `{{detail}}`.

The renderer throws when a placeholder has no value. Tests render every manifest target with sample data to catch missing variables.

## Rules

- No emojis.
- No unrendered placeholders.
- No references to other domain services.
- Use HTTPS links.
- Keep messages direct and helpful.
- Every value in `utils/lib/errors.js` must have a manifest entry.
- Every manifest entry must point to an existing file.
- Every message file must remain plain Markdown.

## Adding an error message

1. Add the error code to `utils/lib/errors.js`.
2. Add the code to `messages/manifest.json`.
3. Add or update the target file in `messages/pr/errors/`.
4. Run `npm test`.
5. Run `npm run simulate:pr -- --scenario all` to review the rendered comments.

## Testing

```bash
npm test
npm run simulate:pr -- --scenario all
```

The manual `Simulate PR` workflow runs the same scenarios from GitHub Actions and writes the rendered output to the job summary.
