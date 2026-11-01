# Registering a subdomain

## Before you start

- The website must already exist and be reachable.
- The website must be related to software development.
- The website must not be commercial.
- If you want a nested subdomain such as `blog.my-site.has-a.link`, `my-site.has-a.link` must already be registered and owned by the same GitHub account.

## 1. Create the domain file

Fork the repository and create a file in `domains/`.

The file name is the subdomain:

- `domains/my-site.json` creates `my-site.has-a.link`.
- `domains/blog.my-site.json` creates `blog.my-site.has-a.link`.

The file name must be lowercase and must not contain consecutive hyphens or dots.

## 2. Add your owner information

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

The `owner.username` value must match the GitHub account that opens the pull request. Email is optional, but contact information is required in the pull request template.

## 3. Add DNS records

Choose the record type that matches your hosting provider.

CNAME:

```json
{
  "owner": {
    "username": "devs-des1re"
  },
  "records": {
    "CNAME": "devs-des1re.com"
  }
}
```

A and AAAA:

```json
{
  "owner": {
    "username": "devs-des1re"
  },
  "records": {
    "A": ["93.184.216.34"],
    "AAAA": ["2606:2800:220:1:248:1893:25c8:1946"]
  }
}
```

Mail:

```json
{
  "owner": {
    "username": "devs-des1re"
  },
  "records": {
    "TXT": ["v=spf1 include:spf.example.com ~all"],
    "MX": [
      {
        "priority": 10,
        "target": "mx1.example.com"
      }
    ]
  }
}
```

See [record types](./record-types.md) for the full rules.

## 4. Open a pull request

Commit the new file and open a pull request.

Fill out every required section of the pull request template:

- Check every requirement checkbox.
- Provide a link to the existing website.
- Describe the purpose of the website.
- Keep the marker comments intact.

The validation bot will comment with any problems. Push fixes to the same branch and the comment will update.

## 5. Review and merge

A maintainer reviews the request. A maintainer may request changes, deny the request, or merge it.

Once merged, the deploy workflow publishes the DNS records to Cloudflare. DNS propagation can take a few minutes.

## Changing or deleting a domain

The owner can update or delete their own domain through another pull request.

Changing the owner of an existing domain requires a trusted maintainer.

## Limits

- A maximum of 10 domains per owner.
- A maximum of 10 records per domain.
- A maximum of 5 records for each of A, AAAA, TXT, and MX.
- One CNAME record per name.
- One single-character subdomain per owner.
- Nested names are limited to three labels, for example `a.b.c`.
