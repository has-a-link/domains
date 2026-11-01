# Security Policy

## Reporting a vulnerability

Do not open a public issue for a security vulnerability.

Report vulnerabilities through GitHub Security Advisories for this repository:

https://github.com/has-a-link/domains/security/advisories/new

Include:

- A description of the issue.
- Steps to reproduce it.
- The affected workflow, script, or configuration.
- Any suggested remediation.

## Scope

Security-sensitive areas include:

- Validation bypasses that could publish unauthorized DNS records.
- Domain takeover through owner changes or renamed files.
- Workflow permission mistakes.
- Secret exposure.
- Cloudflare API misuse or unsafe deletion behavior.
- Pull request checks that execute untrusted code with write access or secrets.

## Secrets

The repository uses these GitHub Actions secrets and variables:

- `CLOUDFLARE_API_TOKEN`: secret, scoped to DNS edit and zone read for `has-a.link`.
- `CLOUDFLARE_ZONE_ID`: repository variable.
- `BOT_TOKEN`: optional secret for a custom bot identity.

No secret belongs in a domain file, configuration file, message template, test, or documentation page.

## Supported versions

Only the current `main` branch is supported.
