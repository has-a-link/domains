# has-a.link

<p>
  <img alt="Domains" src="https://img.shields.io/github/directory-file-count/has-a-link/domains/domains?color=1d76db&label=domains">
  <img alt="Pull requests" src="https://img.shields.io/github/issues-pr/has-a-link/domains?color=1d76db&label=pull%20requests">
  <img alt="License" src="https://img.shields.io/github/license/has-a-link/domains?color=1d76db">
</p>

Free subdomains under `has-a.link` for personal, software-related projects.

## Supported records

| Type    | Value                                   | Notes                                  |
| ------- | --------------------------------------- | -------------------------------------- |
| `A`     | Array of IPv4 addresses                 | Public addresses only, up to five      |
| `AAAA`  | Array of IPv6 addresses                 | Public addresses only, up to five      |
| `CNAME` | Hostname string                         | Must be the only record at the name    |
| `TXT`   | Array of strings                        | Up to five values, 255 characters each |
| `MX`    | Array of `{ priority, target }` objects | Up to five targets                     |

Cloudflare proxying is available for `A`, `AAAA`, and `CNAME` records by setting `"proxied": true`.

## Register a subdomain

1. Fork this repository.
2. Create a JSON file in `domains/` named after the subdomain you want.
   - `domains/my-site.json` creates `my-site.has-a.link`.
   - `domains/blog.my-site.json` creates `blog.my-site.has-a.link` and requires `my-site.json` to exist.
3. Add your owner information and DNS records.
4. Commit the file and open a pull request.
5. Fill out every required section of the pull request template.
6. Wait for a maintainer to review the request. Changes are usually requested through the pull request comments.
7. Once merged, the records are published to Cloudflare automatically.

Example:

```json
{
  "owner": {
    "username": "devs-des1re",
    "email": "me@devs-des1re.com"
  },
  "records": {
    "CNAME": "devs-des1re.com"
  }
}
```

## Requirements

- The website must be reachable and complete.
- The website must be related to software development.
- The website must not be commercial.
- The `owner.username` must match the GitHub account opening the pull request.
- Contact information must be provided in the `owner` key.
- The pull request must include a link to the website and a short description of its purpose.
- Placeholder pages and minimal copied templates are not accepted.
- A domain can only be changed or deleted by its owner or a trusted maintainer.
- A parent subdomain is required before a nested subdomain can be registered.

## Abuse

Report abusive subdomains through the abuse issue template. Include the subdomain, the reason, and supporting evidence.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidance.

## License

MIT. See [LICENSE](./LICENSE).
