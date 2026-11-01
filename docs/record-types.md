# Record types

has-a.link supports A, AAAA, CNAME, TXT, and MX records.

NS, DS, TLSA, SRV, CAA, and URL redirect records are not supported.

## A records

Use A records when your hosting provider gives you IPv4 addresses.

```json
{
  "records": {
    "A": ["93.184.216.34", "93.184.216.35"]
  }
}
```

Rules:

- Must be an array of strings.
- One to five addresses.
- Each address must be a valid public IPv4 address.
- Duplicate addresses are rejected.
- Private, loopback, link-local, multicast, documentation, and blocked resolver ranges are rejected.

## AAAA records

Use AAAA records when your hosting provider gives you IPv6 addresses.

```json
{
  "records": {
    "AAAA": ["2606:2800:220:1:248:1893:25c8:1946"]
  }
}
```

Rules:

- Must be an array of strings.
- One to five addresses.
- Each address must be a valid public IPv6 address.
- Duplicate addresses are rejected.
- Loopback, unspecified, unique local, link-local, documentation, and multicast ranges are rejected.

## CNAME records

Use a CNAME when your hosting provider gives you a hostname.

```json
{
  "records": {
    "CNAME": "devs-des1re.com"
  }
}
```

Rules:

- Must be a single lowercase hostname string.
- No protocol, path, query string, or trailing dot.
- Cannot point to itself.
- Cannot point to `has-a.link` or any name under `has-a.link`.
- Cannot point to a blocked target from `config/blocked-cname-targets.json`.
- Must be the only record type at that name.

## TXT records

Use TXT records for verification, SPF, and similar text values.

```json
{
  "records": {
    "TXT": ["v=spf1 include:spf.example.com ~all"]
  }
}
```

Rules:

- Must be an array of strings.
- One to five values.
- Each value must be 1 to 255 characters.
- Duplicate values are rejected.

Verification records that belong to a different name should use a separate nested file.

For example, a Vercel verification record for `my-site.has-a.link` belongs in `_vercel.my-site.json`.

## MX records

Use MX records for mail providers.

```json
{
  "records": {
    "MX": [
      {
        "priority": 10,
        "target": "mx1.example.com"
      },
      {
        "priority": 20,
        "target": "mx2.example.com"
      }
    ]
  }
}
```

Rules:

- Must be an array of objects.
- Each object must have `priority` and `target`.
- Priority must be an integer from 0 to 65535.
- Target must be a lowercase hostname without a trailing dot.
- One to five targets.
- Duplicate entries are rejected.
- Cannot point to `has-a.link` or any name under `has-a.link`.

## Combining records

Allowed combinations:

- A and AAAA.
- A or AAAA with TXT.
- A or AAAA with MX.
- A or AAAA with TXT and MX.
- TXT and MX without A or AAAA.

Not allowed:

- CNAME with any other record type.

## Proxying

Set `"proxied": true` to enable Cloudflare proxying.

```json
{
  "records": {
    "CNAME": "example.pages.dev"
  },
  "proxied": true
}
```

Only A, AAAA, and CNAME records can be proxied. At least one proxyable record must exist.
