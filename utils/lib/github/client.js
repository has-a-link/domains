export class GitHubApiError extends Error {
  constructor(message, { status, method, path, body } = {}) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.method = method;
    this.path = path;
    this.body = body;
  }
}

function parseRepository(repository) {
  const [owner, repo, ...rest] = String(repository ?? "").split("/");

  if (!owner || !repo || rest.length > 0) {
    throw new Error(`Invalid repository: ${repository}`);
  }

  return { owner, repo };
}

export function createGitHubClient({
  token,
  repository,
  fetchImpl = globalThis.fetch,
  apiBase = "https://api.github.com",
  perPage = 100
} = {}) {
  if (!token) {
    throw new Error("A GitHub token is required.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const { owner, repo } = parseRepository(repository);
  const base = apiBase.replace(/\/$/, "");

  async function request(method, requestPath, { body, headers = {} } = {}) {
    const requestHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "has-a-link-registry",
      ...headers
    };

    if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
    }

    const response = await fetchImpl(`${base}${requestPath}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!response.ok) {
      throw new GitHubApiError(
        data?.message ?? `GitHub API request failed with status ${response.status}`,
        {
          status: response.status,
          method,
          path: requestPath,
          body: data
        }
      );
    }

    return data;
  }

  async function paginate(requestPath, { perPage: pageSize = perPage } = {}) {
    const results = [];
    let page = 1;

    while (true) {
      const separator = requestPath.includes("?") ? "&" : "?";
      const data = await request(
        "GET",
        `${requestPath}${separator}per_page=${pageSize}&page=${page}`
      );

      results.push(...data);

      if (data.length < pageSize) {
        break;
      }

      page += 1;
    }

    return results;
  }

  function listPullRequestFiles(pullNumber) {
    return paginate(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`);
  }

  function listIssueComments(issueNumber) {
    return paginate(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
  }

  function createIssueComment(issueNumber, body) {
    return request("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      body: { body }
    });
  }

  function updateIssueComment(commentId, body) {
    return request("PATCH", `/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      body: { body }
    });
  }

  function deleteIssueComment(commentId) {
    return request("DELETE", `/repos/${owner}/${repo}/issues/comments/${commentId}`);
  }

  function listLabelsOnIssue(issueNumber) {
    return paginate(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`);
  }

  function addLabels(issueNumber, labels) {
    return request("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      body: { labels }
    });
  }

  function removeLabel(issueNumber, label) {
    return request(
      "DELETE",
      `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`
    );
  }

  async function removeLabelIfPresent(issueNumber, label) {
    try {
      return await removeLabel(issueNumber, label);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  function listRepositoryLabels() {
    return paginate(`/repos/${owner}/${repo}/labels`);
  }

  function createLabel(label) {
    return request("POST", `/repos/${owner}/${repo}/labels`, {
      body: {
        name: label.name,
        color: label.color,
        description: label.description
      }
    });
  }

  function updateLabel(name, label) {
    return request("PATCH", `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`, {
      body: {
        color: label.color,
        description: label.description
      }
    });
  }

  async function upsertIssueComment({
    issueNumber,
    marker,
    body,
    botLogin = "github-actions[bot]"
  }) {
    const comments = await listIssueComments(issueNumber);
    const existing = comments.find(
      (comment) =>
        comment.body?.includes(marker) &&
        (comment.user?.login === botLogin || comment.user?.type === "Bot")
    );

    if (existing) {
      const comment = await updateIssueComment(existing.id, body);
      return { action: "updated", comment };
    }

    const comment = await createIssueComment(issueNumber, body);
    return { action: "created", comment };
  }

  return {
    owner,
    repo,
    repository: `${owner}/${repo}`,
    listPullRequestFiles,
    listIssueComments,
    createIssueComment,
    updateIssueComment,
    deleteIssueComment,
    listLabelsOnIssue,
    addLabels,
    removeLabel,
    removeLabelIfPresent,
    listRepositoryLabels,
    createLabel,
    updateLabel,
    upsertIssueComment,
    request
  };
}
