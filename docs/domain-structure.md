# Domain structure

## Directory

All domain files live in `domains/`.

```text
domains/
├── example.json
├── blog.example.json
└── _vercel.example.json
```

## File names

The file name, without `.json`, is the subdomain.

| File                   | DNS name                     |
| ---------------------- | ---------------------------- |
| `example.json`         | `example.has-a.link`         |
| `blog.example.json`    | `blog.example.has-a.link`    |
| `_vercel.example.json` | `_vercel.example.has-a.link` |

Rules:

- Must end in `.json`.
- Lowercase only.
- Letters, numbers, hyphens, dots, and leading underscores are allowed.
- No consecutive hyphens.
- No consecutive dots.
- No leading or trailing dot.
- No leading or trailing hyphen in a label.
- Each label must be 1 to 63 characters.
- The full subdomain must be 253 characters or fewer.
- No punycode names starting with `xn--`.
- The root label cannot start with an underscore.
- The file name cannot contain `.has-a.link`.
- The file name cannot be `@`.

## Nested subdomains

A nested subdomain requires its parent to exist.

```text
domains/example.json        required
domains/blog.example.json   allowed
```

The child must have the same owner username as the parent.

A parent with a CNAME cannot have children, because a CNAME already claims the entire name.

## JSON structure

```json
{
  "owner": {
    "username": "devs-des1re",
    "email": "me@devs-des1re.com"
  },
  "records": {
    "CNAME": "devs-des1re.com"
  },
  "proxied": false
}
```

Required:

- `owner`
- `owner.username`
- `records` with at least one record

Optional:

- `owner.email`
- `proxied`

Unknown fields are rejected.

## Record limits

| Type    | Format                | Maximum |
| ------- | --------------------- | ------- |
| `A`     | Array of IPv4 strings | 5       |
| `AAAA`  | Array of IPv6 strings | 5       |
| `CNAME` | String                | 1       |
| `TXT`   | Array of strings      | 5       |
| `MX`    | Array of objects      | 5       |

The total number of records per domain is 10.

## CNAME exclusivity

A CNAME must be the only record type at that name.

Invalid:

```json
{
  "records": {
    "CNAME": "example.com",
    "TXT": ["verification=value"]
  }
}
```

Use A or AAAA records if you need TXT or MX records at the same name.

## Proxying

Set `"proxied": true` to enable Cloudflare proxying.

Proxying is only valid for A, AAAA, and CNAME records. A domain cannot be proxied if it only has TXT or MX records.

## Reserved, blocked, and internal names

- Reserved names cannot be registered.
- Blocked names cannot be registered and are used for policy enforcement.
- Internal names are used by the service and are protected from deployment changes.

The lists live in `config/`.

## Validation

Every file is validated for:

- JSON syntax.
- Duplicate keys.
- File name rules.
- Reserved, blocked, and internal names.
- Parent existence and ownership.
- Record types and values.
- Record combinations.
- Limits.
- Owner authorization on pull requests.
- Formatting.

Validation errors are reported on the pull request.
