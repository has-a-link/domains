export class CloudflareApiError extends Error {
  constructor(message, { status, errors = [], method, path } = {}) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
    this.errors = errors;
    this.method = method;
    this.path = path;
  }
}

export function createCloudflareClient({
  token,
  zoneId,
  fetchImpl = globalThis.fetch,
  apiBase = "https://api.cloudflare.com/client/v4",
  perPage = 100,
  retries = 3,
  retryDelay = (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
  if (!token) {
    throw new Error("A Cloudflare API token is required.");
  }

  if (!zoneId) {
    throw new Error("A Cloudflare zone ID is required.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const base = apiBase.replace(/\/$/, "");

  async function request(method, requestPath, { body } = {}) {
    let attempt = 0;

    while (true) {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "has-a-link-registry"
      };
      const response = await fetchImpl(`${base}${requestPath}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let payload = null;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { success: false, errors: [{ message: text }] };
        }
      }

      if (response.ok && payload?.success !== false) {
        return payload;
      }

      const retryable = response.status === 429 || response.status >= 500;

      if (retryable && attempt < retries) {
        const retryAfterHeader = Number(response.headers?.get?.("retry-after"));
        const delay = Number.isFinite(retryAfterHeader)
          ? retryAfterHeader * 1000
          : retryDelay(attempt);

        await sleep(delay);
        attempt += 1;
        continue;
      }

      const errors = payload?.errors ?? [];
      const message =
        errors
          .map((error) => error.message)
          .filter(Boolean)
          .join("; ") || `Cloudflare API request failed with status ${response.status}`;

      throw new CloudflareApiError(message, {
        status: response.status,
        errors,
        method,
        path: requestPath
      });
    }
  }

  async function paginate(requestPath, { perPage: pageSize = perPage } = {}) {
    const results = [];
    let page = 1;
    let totalPages = 1;

    do {
      const separator = requestPath.includes("?") ? "&" : "?";
      const payload = await request(
        "GET",
        `${requestPath}${separator}per_page=${pageSize}&page=${page}`
      );

      results.push(...(payload.result ?? []));
      totalPages = payload.result_info?.total_pages ?? 1;
      page += 1;
    } while (page <= totalPages);

    return results;
  }

  function getZone() {
    return request("GET", `/zones/${zoneId}`).then((payload) => payload.result);
  }

  function listDnsRecords() {
    return paginate(`/zones/${zoneId}/dns_records`);
  }

  function createDnsRecord(record) {
    return request("POST", `/zones/${zoneId}/dns_records`, { body: record }).then(
      (payload) => payload.result
    );
  }

  function updateDnsRecord(recordId, record) {
    return request("PATCH", `/zones/${zoneId}/dns_records/${recordId}`, {
      body: record
    }).then((payload) => payload.result);
  }

  function deleteDnsRecord(recordId) {
    return request("DELETE", `/zones/${zoneId}/dns_records/${recordId}`).then(
      (payload) => payload.result
    );
  }

  return {
    zoneId,
    getZone,
    listDnsRecords,
    createDnsRecord,
    updateDnsRecord,
    deleteDnsRecord,
    request
  };
}
