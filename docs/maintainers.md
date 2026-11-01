# Maintainer guide

## Review checklist

- The pull request template is complete.
- The website is reachable and complete.
- The website is software-related and non-commercial.
- The owner username matches the pull request author, or the author is trusted.
- The domain file passes validation.
- Nested parent rules are satisfied.
- The requested name is not reserved, blocked, or internal.
- The records are appropriate for the website.
- The pull request does not attempt a domain takeover.

## Labels

Labels are defined in `config/labels.json`.

Each label has:

- `name`
- `color`, a six-character hexadecimal value without `#`
- `description`

Create or update labels:

```bash
npm run sync:labels
```

Preview changes:

```bash
npm run sync:labels -- --dry-run
```

The pull request bot also creates missing labels before applying them, using the same configuration.

The manual `sync-labels` workflow can run the same command from GitHub Actions.

## Pull request bot

The bot:

- Validates changed domain files using trusted base-branch code.
- Validates the pull request template.
- Checks ownership and takeover rules.
- Checks formatting.
- Posts one comment per pull request.
- Updates the same comment on later pushes.
- Adds and removes reason labels.
- Deletes the validation comment when the pull request is closed.

The bot must not execute code from the pull request head. Only the read-only infrastructure test job runs pull request code.

## CI behavior

- `ci.yml` runs the full test suite for infrastructure changes on `main`.
- Domain-only changes do not trigger `ci.yml`.
- The PR gate runs domain validation for domain changes.
- Infrastructure changes in a pull request run the full test suite in a read-only job.
- Deployment validates the registry and runs tests before touching Cloudflare.

## Deployment

Required repository settings:

- Secret: `CLOUDFLARE_API_TOKEN`
- Variable: `CLOUDFLARE_ZONE_ID`
- Optional secret: `BOT_TOKEN`

Cloudflare token permissions:

- Zone DNS edit for `has-a.link`.
- Zone read for `has-a.link`.

Do not use an account-wide token.

### Preview changes

```bash
npm run deploy:dry
```

The dry-run:

- Loads the registry.
- Validates all domains.
- Fetches the current Cloudflare records.
- Prints the planned creates, updates, deletes, and no-ops.
- Does not write to Cloudflare.

### Apply changes

```bash
npm run deploy -- --apply
```

Deployment safety:

- The zone name must match `has-a.link`.
- The zone cannot be empty when records are expected.
- Mass deletions are blocked unless explicitly allowed.
- Only records carrying the managed comment are deleted.
- NS and SOA records are never touched.
- The apex and protected names are never touched.
- A backup of the current DNS state is uploaded as a workflow artifact.

### Manual deployment

Run the `deploy` workflow and leave `apply` disabled for a dry-run. Enable `apply` only when you intend to publish changes.

## Branch protection

Recommended repository settings:

- Require the `PR Checks` status check.
- Require review from CODEOWNERS.
- Require conversation resolution.
- Restrict force pushes.
- Restrict who can push to `main`.
- Enable Dependabot alerts.
- Enable secret scanning and push protection.

## Trusted users

Trusted users are listed in `config/trusted-users.json`.

Schema:

```json
[
  {
    "username": "devs-des1re",
    "id": 123456,
    "admin": true
  }
]
```

- `admin` users can manage service domains and change owners.
- Non-admin trusted users can manage user domains.
- The file starts empty. Add maintainers before relying on trusted-user bypasses.

## Reserved, blocked, and internal names

- `config/reserved-subdomains.json`: generic and service names that cannot be registered.
- `config/blocked-subdomains.json`: names blocked for policy or abuse reasons.
- `config/internal-subdomains.json`: service names that are protected from deployment changes.

Use `npm run add:reserved` to add a name to the reserved list in sorted order.

## Cloudflare settings

`config/cloudflare.json` contains:

- Zone name.
- Default TTL.
- Proxied TTL.
- Managed record comment.
- Maximum deletions per run.

`config/protected-dns-records.json` contains protected names, name patterns, and record types.

## Token rotation

1. Create a new Cloudflare API token with the same scoped permissions.
2. Update the `CLOUDFLARE_API_TOKEN` repository secret.
3. Run a dry-run deployment.
4. Revoke the old token.

## Rollback

Every deployment uploads the previous DNS state as an artifact.

To recover:

1. Download the artifact from the failed or previous deployment.
2. Compare the records with the current Cloudflare zone.
3. Restore the affected records manually or through a controlled deployment.
4. Run a dry-run to confirm the registry matches the zone.

## Weekly audit

The `audit` workflow runs the full test suite and validates the registry. It can also run a Cloudflare dry-run to detect drift.

Fix drift by merging the correct registry change, not by editing Cloudflare manually.
