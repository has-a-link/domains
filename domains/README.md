# Domain registry

Each JSON file in this directory registers one subdomain.

- `my-site.json` registers `my-site.has-a.link`.
- `blog.my-site.json` registers `blog.my-site.has-a.link`.

Nested subdomains require the parent file to exist and to have the same owner.

See the [registration steps](../README.md#register-a-subdomain) and the [domain structure documentation](../docs/domain-structure.md) for the full rules.

Do not add a file unless you are submitting a domain registration through a pull request.
