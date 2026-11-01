import test from "ava";

import { GitHubApiError, createGitHubClient } from "../utils/lib/github/client.js";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
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

test("client requires a token and repository", (t) => {
  t.throws(() => createGitHubClient({ repository: "owner/repo" }), {
    message: /token is required/
  });
  t.throws(() => createGitHubClient({ token: "token" }), {
    message: /Invalid repository/
  });
  t.throws(() => createGitHubClient({ token: "token", repository: "invalid" }), {
    message: /Invalid repository/
  });
});

test("pull request files are paginated with the expected headers", async (t) => {
  const mock = createMockFetch((url) => {
    if (url.includes("page=1")) {
      return jsonResponse([
        { filename: "domains/a.json", status: "added" },
        { filename: "domains/b.json", status: "added" }
      ]);
    }

    return jsonResponse([{ filename: "domains/c.json", status: "added" }]);
  });
  const client = createGitHubClient({
    token: "secret",
    repository: "has-a-link/domains",
    fetchImpl: mock.fetch,
    perPage: 2
  });
  const files = await client.listPullRequestFiles(5);

  t.is(files.length, 3);
  t.is(mock.calls.length, 2);
  t.true(mock.calls[0].url.includes("/repos/has-a-link/domains/pulls/5/files"));
  t.true(mock.calls[0].url.includes("per_page=2"));
  t.true(mock.calls[0].url.includes("page=1"));
  t.is(mock.calls[0].options.headers.Authorization, "Bearer secret");
  t.is(mock.calls[0].options.headers.Accept, "application/vnd.github+json");
  t.is(mock.calls[0].options.headers["User-Agent"], "has-a-link-registry");
});

test("comments, labels, and merge helpers use the expected endpoints", async (t) => {
  const responses = [
    jsonResponse([{ id: 1, body: "hello" }]),
    jsonResponse({ id: 2, body: "created" }),
    jsonResponse({ id: 1, body: "updated" }),
    new Response(null, { status: 204 }),
    jsonResponse([{ name: "domain" }]),
    jsonResponse([{ name: "domain" }]),
    jsonResponse({ name: "new" }),
    jsonResponse({ name: "new", color: "ffffff" }),
    jsonResponse([{ name: "domain" }]),
    new Response(null, { status: 204 })
  ];
  const mock = createMockFetch(() => responses.shift());
  const client = createGitHubClient({
    token: "token",
    repository: "has-a-link/domains",
    fetchImpl: mock.fetch
  });

  t.deepEqual(await client.listIssueComments(7), [{ id: 1, body: "hello" }]);
  t.deepEqual(await client.createIssueComment(7, "created"), { id: 2, body: "created" });
  t.deepEqual(await client.updateIssueComment(1, "updated"), { id: 1, body: "updated" });
  t.is(await client.deleteIssueComment(1), null);
  t.deepEqual(await client.listLabelsOnIssue(7), [{ name: "domain" }]);
  t.deepEqual(await client.listRepositoryLabels(), [{ name: "domain" }]);
  await client.createLabel({ name: "new", color: "ffffff", description: "New label" });
  await client.updateLabel("new", {
    name: "new",
    color: "000000",
    description: "Updated label"
  });
  await client.addLabels(7, ["domain", "bug"]);
  await client.removeLabel(7, "bug");

  t.true(mock.calls[0].url.includes("/issues/7/comments"));
  t.is(mock.calls[1].options.method, "POST");
  t.deepEqual(JSON.parse(mock.calls[1].options.body), { body: "created" });
  t.is(mock.calls[2].options.method, "PATCH");
  t.is(mock.calls[3].options.method, "DELETE");
  t.is(mock.calls[4].url.includes("/issues/7/labels"), true);
  t.is(mock.calls[5].url.includes("/labels"), true);
  t.is(mock.calls[6].options.method, "POST");
  t.is(mock.calls[7].options.method, "PATCH");
  t.is(mock.calls[8].url.includes("/issues/7/labels"), true);
  t.is(mock.calls[9].url.includes("/labels/bug"), true);
});

test("upsert updates an existing bot comment", async (t) => {
  const responses = [
    jsonResponse([
      {
        id: 99,
        body: "<!-- marker -->",
        user: { login: "github-actions[bot]", type: "Bot" }
      }
    ]),
    jsonResponse({ id: 99, body: "updated" })
  ];
  const mock = createMockFetch(() => responses.shift());
  const client = createGitHubClient({
    token: "token",
    repository: "has-a-link/domains",
    fetchImpl: mock.fetch
  });
  const result = await client.upsertIssueComment({
    issueNumber: 1,
    marker: "<!-- marker -->",
    body: "updated"
  });

  t.is(result.action, "updated");
  t.is(mock.calls[1].options.method, "PATCH");
});

test("upsert creates a comment when no bot comment exists", async (t) => {
  const responses = [
    jsonResponse([
      {
        id: 99,
        body: "<!-- marker -->",
        user: { login: "someone", type: "User" }
      }
    ]),
    jsonResponse({ id: 100, body: "created" })
  ];
  const mock = createMockFetch(() => responses.shift());
  const client = createGitHubClient({
    token: "token",
    repository: "has-a-link/domains",
    fetchImpl: mock.fetch
  });
  const result = await client.upsertIssueComment({
    issueNumber: 1,
    marker: "<!-- marker -->",
    body: "created"
  });

  t.is(result.action, "created");
  t.is(mock.calls[1].options.method, "POST");
});

test("upsert supports a custom bot login", async (t) => {
  const responses = [
    jsonResponse([
      {
        id: 99,
        body: "<!-- marker -->",
        user: { login: "has-a-link-bot", type: "User" }
      }
    ]),
    jsonResponse({ id: 99, body: "updated" })
  ];
  const mock = createMockFetch(() => responses.shift());
  const client = createGitHubClient({
    token: "token",
    repository: "has-a-link/domains",
    fetchImpl: mock.fetch
  });
  const result = await client.upsertIssueComment({
    issueNumber: 1,
    marker: "<!-- marker -->",
    body: "updated",
    botLogin: "has-a-link-bot"
  });

  t.is(result.action, "updated");
});

test("removeLabelIfPresent ignores 404", async (t) => {
  const mock = createMockFetch(() => jsonResponse({ message: "Not Found" }, 404));
  const client = createGitHubClient({
    token: "token",
    repository: "has-a-link/domains",
    fetchImpl: mock.fetch
  });

  t.is(await client.removeLabelIfPresent(1, "missing"), null);
});

test("API errors include the status and message", async (t) => {
  const mock = createMockFetch(() => jsonResponse({ message: "Not Found" }, 404));
  const client = createGitHubClient({
    token: "token",
    repository: "has-a-link/domains",
    fetchImpl: mock.fetch
  });

  const error = await t.throwsAsync(() => client.listPullRequestFiles(1));

  t.true(error instanceof GitHubApiError);
  t.is(error.status, 404);
  t.is(error.message, "Not Found");
});

test("custom API base and query pagination work", async (t) => {
  const mock = createMockFetch(() => jsonResponse([]));
  const client = createGitHubClient({
    token: "token",
    repository: "owner/repo",
    fetchImpl: mock.fetch,
    apiBase: "https://example.test/api/"
  });

  await client.listRepositoryLabels();

  t.true(mock.calls[0].url.startsWith("https://example.test/api/repos/owner/repo/labels"));
  t.true(mock.calls[0].url.includes("per_page=100"));
});
