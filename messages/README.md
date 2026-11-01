# Messages

All bot-facing text lives in this directory.

## Layout

- `manifest.json` maps validation error codes to message files.
- `pr/comment.md` is the main pull request validation comment.
- `pr/success.md` is used when validation passes.
- `pr/merge-conflict.md` is used when a pull request has merge conflicts.
- `pr/errors/` contains one message per validation error code.
- `stale/` contains stale issue and pull request messages.
- `maintenance/` contains maintenance workflow messages.

## Placeholders

Messages use double-brace placeholders:

```text
{{repoUrl}}
{{file}}
{{detail}}
```

The renderer replaces every placeholder before posting.

## Rules

- No emojis.
- No unrendered placeholders.
- No references to other domain services.
- Use HTTPS links.
- Keep messages direct and helpful.
- Every validation error code must have a message file.
- Every message file must map to an existing error code.

## Testing

Run:

```bash
npm test
```

To preview a pull request scenario:

```bash
npm run simulate:pr -- --scenario invalid-record
```
