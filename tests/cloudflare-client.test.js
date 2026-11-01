import test from "ava";

import { CloudflareApiError, createCloudflareClient } from "../utils/lib/cloudflare/client.js";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });
}

function cloudflareSuccess(result, resultInfo = undefined) {
  return jsonResponse({
    success: true,
    errors: [],
    messages: [],
    result,
    ...(resultInfo ? { result_info: resultInfo } : {})
  });
}

function createMockFetch(handler) {
  const calls = [];

  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      return handler(String(url), options, calls.length);
    }
  };
}

test("Cloudflare client requires token and zone ID", (t) => {
  t.throws(() => createCloudflareClient({ zoneId: "zone" }), {
    message: /token is required/
  });
  t.throws(() => createCloudflareClient({ token: "token" }), {
    message: /zone ID is required/
  });
});

test("Cloudflare client fetches zone and paginates DNS records", async (t) => {
  const mock = createMockFetch((url) => {
    if (url.includes("/dns_records")) {
      if (url.includes("page=1")) {
        return cloudflareSuccess(
          [
            { id: "1", type: "A", name: "a.has-a.link", content: "1.2.3.4" },
            { id: "2", type: "A", name: "b.has-a.link", content: "1.2.3.5" }
          ],
          { total_pages: 2 }
        );
      }

      return cloudflareSuccess([{ id: "3", type: "A", name: "c.has-a.link", content: "1.2.3.6" }], {
        total_pages: 2
      });
    }

    return cloudflareSuccess({ id: "zone-id", name: "has-a.link" });
  });
  const client = createCloudflareClient({
    token: "secret",
    zoneId: "zone-id",
    fetchImpl: mock.fetch,
    perPage: 2
  });

  t.deepEqual(await client.getZone(), { id: "zone-id", name: "has-a.link" });
  const records = await client.listDnsRecords();

  t.is(records.length, 3);
  t.true(mock.calls.some((call) => call.url.includes("/zones/zone-id/dns_records")));
  t.true(mock.calls.some((call) => call.url.includes("per_page=2")));
  t.is(mock.calls[0].options.headers.Authorization, "Bearer secret");
  t.is(mock.calls[0].options.headers["User-Agent"], "has-a-link-registry");
});

test("Cloudflare client creates, updates, and deletes records", async (t) => {
  const responses = [
    cloudflareSuccess({ id: "created" }),
    cloudflareSuccess({ id: "updated" }),
    cloudflareSuccess({ id: "deleted" })
  ];
  const mock = createMockFetch(() => responses.shift());
  const client = createCloudflareClient({
    token: "token",
    zoneId: "zone-id",
    fetchImpl: mock.fetch
  });
  const record = {
    type: "A",
    name: "a.has-a.link",
    content: "1.2.3.4",
    ttl: 300,
    proxied: false,
    comment: "managed"
  };

  t.deepEqual(await client.createDnsRecord(record), { id: "created" });
  t.deepEqual(await client.updateDnsRecord("1", record), { id: "updated" });
  t.deepEqual(await client.deleteDnsRecord("1"), { id: "deleted" });

  t.is(mock.calls[0].options.method, "POST");
  t.deepEqual(JSON.parse(mock.calls[0].options.body), record);
  t.is(mock.calls[1].options.method, "PATCH");
  t.is(mock.calls[1].url.endsWith("/dns_records/1"), true);
  t.is(mock.calls[2].options.method, "DELETE");
});

test("Cloudflare client retries rate limits with Retry-After", async (t) => {
  const responses = [
    jsonResponse({ success: false, errors: [{ message: "rate limited" }] }, 429, {
      "retry-after": "1"
    }),
    cloudflareSuccess({ id: "zone-id", name: "has-a.link" })
  ];
  const sleeps = [];
  const mock = createMockFetch(() => responses.shift());
  const client = createCloudflareClient({
    token: "token",
    zoneId: "zone-id",
    fetchImpl: mock.fetch,
    sleep: async (milliseconds) => sleeps.push(milliseconds)
  });

  t.deepEqual(await client.getZone(), { id: "zone-id", name: "has-a.link" });
  t.deepEqual(sleeps, [1000]);
  t.is(mock.calls.length, 2);
});

test("Cloudflare client retries server errors", async (t) => {
  const responses = [
    jsonResponse({ success: false, errors: [{ message: "temporary" }] }, 500),
    cloudflareSuccess({ id: "zone-id", name: "has-a.link" })
  ];
  const sleeps = [];
  const mock = createMockFetch(() => responses.shift());
  const client = createCloudflareClient({
    token: "token",
    zoneId: "zone-id",
    fetchImpl: mock.fetch,
    sleep: async (milliseconds) => sleeps.push(milliseconds)
  });

  t.deepEqual(await client.getZone(), { id: "zone-id", name: "has-a.link" });
  t.is(sleeps.length, 1);
});

test("Cloudflare client reports API errors", async (t) => {
  const mock = createMockFetch(() =>
    jsonResponse({ success: false, errors: [{ message: "bad token" }] }, 403)
  );
  const client = createCloudflareClient({
    token: "token",
    zoneId: "zone-id",
    fetchImpl: mock.fetch
  });

  const error = await t.throwsAsync(() => client.getZone());

  t.true(error instanceof CloudflareApiError);
  t.is(error.status, 403);
  t.is(error.message, "bad token");
});

test("Cloudflare client reports non-JSON failures and stops retrying", async (t) => {
  const mock = createMockFetch(() => new Response("bad gateway", { status: 500 }));
  const client = createCloudflareClient({
    token: "token",
    zoneId: "zone-id",
    fetchImpl: mock.fetch,
    retries: 0
  });

  const error = await t.throwsAsync(() => client.getZone());

  t.is(error.status, 500);
  t.is(error.message, "bad gateway");
});

test("Cloudflare client supports a custom API base", async (t) => {
  const mock = createMockFetch(() => cloudflareSuccess([]));
  const client = createCloudflareClient({
    token: "token",
    zoneId: "zone-id",
    fetchImpl: mock.fetch,
    apiBase: "https://example.test/client/v4/"
  });

  await client.listDnsRecords();

  t.true(mock.calls[0].url.startsWith("https://example.test/client/v4/zones/zone-id/dns_records"));
});
