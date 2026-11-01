# Review guidelines

This document describes how maintainers review domain pull requests.

## Acceptance criteria

A domain request can be merged when:

- The website is reachable.
- The website is complete rather than a placeholder.
- The website is related to software development.
- The website is not commercial.
- The owner username matches the pull request author, or the author is a trusted maintainer.
- Contact information is present.
- The pull request template is complete.
- The JSON file passes all validation checks.
- The requested name is not reserved, blocked, or internal.
- Nested subdomains have an existing parent owned by the same account.
- The records are valid and appropriate for the website.

## Reasons to request changes

- The website is unreachable.
- The website is a placeholder, a parked page, or a copied template with minimal changes.
- The website is unrelated to software development.
- The website is commercial.
- The website purpose is unclear.
- The owner username does not match the pull request author.
- The template is incomplete.
- The JSON is invalid or violates a rule.
- A nested parent is missing or owned by someone else.
- The CNAME target is blocked.
- The IP address is private, reserved, or a public resolver.
- The pull request attempts to change or delete a domain owned by someone else.

## Ownership

A domain can be changed or deleted by:

- The owner listed in the current domain file.
- A trusted maintainer.

Owner changes require a trusted maintainer.

A pull request cannot take ownership of an existing domain by changing the `owner.username` field.

## Nested subdomains

Nested subdomains must use the same owner as their parent.

A parent with a CNAME cannot have children.

## Policy enforcement

Maintainers can deny a request that violates the service rules even if it passes automated validation.

Maintainers can add names to the blocked list when needed.

## Abuse

Use the abuse issue template to report a domain. Include:

- The subdomain.
- The reason for the report.
- Supporting evidence.

Maintainers may remove a domain, block a name, or restrict an account in response to abuse.

## Discretion

The maintainers may reject or remove any domain at any time to protect the service, its users, or third parties.
