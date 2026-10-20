import assert from "node:assert/strict";
import { test } from "node:test";
import { GitHubProvider, mapRunsToState } from "../../src/providers/github.ts";

test("mapRunsToState: empty runs returns unknown", () => {
  assert.deepEqual(mapRunsToState([]), "unknown");
});

test("mapRunsToState: successful build returns passing", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "success", name: "CI" }]),
    "passing",
  );
});

test("mapRunsToState: failed build returns failing", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "failure", name: "CI" }]),
    "failing",
  );
});

test("mapRunsToState: in_progress returns pending", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "in_progress", conclusion: null, name: "Build" }]),
    "pending",
  );
});

test("mapRunsToState: in_progress deploy returns deploying", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "in_progress", conclusion: null, name: "Deploy to prod" }]),
    "deploying",
  );
});

test("mapRunsToState: successful deploy returns deploy_success", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "success", name: "Deploy" }]),
    "deploy_success",
  );
});

test("mapRunsToState: failed deploy returns deploy_failed", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "failure", name: "Deploy staging" }]),
    "deploy_failed",
  );
});

test("mapRunsToState: queued returns pending", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "queued", conclusion: null, name: "CI" }]),
    "pending",
  );
});

test("mapRunsToState: cancelled returns unknown", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "cancelled", name: "CI" }]),
    "unknown",
  );
});

test("mapRunsToState: unexpected conclusion returns error", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "timed_out", name: "CI" }]),
    "error",
  );
});

test("mapRunsToState: uses the latest run of each workflow, not just the newest run overall", () => {
  // Newest first, as the API returns them.
  const runs = [
    { status: "completed", conclusion: "success", name: "CI", workflow_id: 1 },
    { status: "completed", conclusion: "failure", name: "Lint", workflow_id: 2 },
    { status: "completed", conclusion: "failure", name: "CI", workflow_id: 1 },
  ];
  assert.equal(mapRunsToState(runs), "failing");
});

test("mapRunsToState: an older failure superseded by a newer success of the same workflow is ignored", () => {
  const runs = [
    { status: "completed", conclusion: "success", name: "CI", workflow_id: 1 },
    { status: "completed", conclusion: "failure", name: "CI", workflow_id: 1 },
  ];
  assert.equal(mapRunsToState(runs), "passing");
});

test("mapRunsToState: all green keeps the state of the most recent workflow", () => {
  const runs = [
    { status: "completed", conclusion: "success", name: "Deploy", workflow_id: 2 },
    { status: "completed", conclusion: "success", name: "CI", workflow_id: 1 },
    { status: "completed", conclusion: "cancelled", name: "Nightly", workflow_id: 3 },
  ];
  assert.equal(mapRunsToState(runs), "deploy_success");
});

interface FakeRoute {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Stub `fetch` answering by URL path; records every requested URL. */
function stubFetch(routes: (url: URL) => FakeRoute) {
  const requests: URL[] = [];
  const fetchFn = (input: string | URL | Request): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push(url);
    const route = routes(url);
    return Promise.resolve(
      new Response(JSON.stringify(route.body ?? {}), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json", ...route.headers },
      }),
    );
  };
  return { requests, fetch: fetchFn as typeof fetch };
}

const NOW = 1_700_000_000_000;

test("GitHubProvider.poll: queries runs on the repo's default branch", async () => {
  const { requests, fetch } = stubFetch((url) => {
    if (url.pathname === "/repos/acme/api") return { body: { default_branch: "trunk" } };
    return {
      body: { workflow_runs: [{ status: "completed", conclusion: "success", name: "CI", workflow_id: 1 }] },
    };
  });
  const provider = new GitHubProvider("tok", { fetch, now: () => NOW });

  assert.equal(await provider.poll("acme", "api"), "passing");
  assert.equal(await provider.poll("acme", "api"), "passing");

  const runRequests = requests.filter((u) => u.pathname === "/repos/acme/api/actions/runs");
  assert.equal(runRequests.length, 2);
  for (const u of runRequests) assert.equal(u.searchParams.get("branch"), "trunk");
  // The default branch is looked up once and cached.
  assert.equal(requests.filter((u) => u.pathname === "/repos/acme/api").length, 1);
});

test("GitHubProvider.poll: throws on API errors", async () => {
  const { fetch } = stubFetch(() => ({ status: 500 }));
  const provider = new GitHubProvider("tok", { fetch, now: () => NOW });
  await assert.rejects(provider.poll("acme", "api"), /GitHub API error: 500/);
});

test("GitHubProvider.poll: a low rate limit skips the repo this tick instead of sleeping", { timeout: 2000 }, async () => {
  const resetSeconds = String(Math.floor(NOW / 1000) + 3600);
  let remaining = "4000";
  const { requests, fetch } = stubFetch((url) => {
    const headers = { "x-ratelimit-remaining": remaining, "x-ratelimit-reset": resetSeconds };
    if (url.pathname === "/repos/acme/api") return { body: { default_branch: "main" }, headers };
    return {
      body: { workflow_runs: [{ status: "completed", conclusion: "failure", name: "CI", workflow_id: 1 }] },
      headers,
    };
  });
  const provider = new GitHubProvider("tok", { fetch, now: () => NOW });

  assert.equal(await provider.poll("acme", "api"), "failing");
  remaining = "10";
  assert.equal(await provider.poll("acme", "api"), "failing"); // this response reports the low limit
  const before = requests.length;

  // Limit is low and resets in an hour: no request, last known state returned immediately.
  assert.equal(await provider.poll("acme", "api"), "failing");
  assert.equal(requests.length, before);
  // A repo never polled before has no known state: unknown.
  assert.equal(await provider.poll("acme", "web"), "unknown");
  assert.equal(requests.length, before);
});

test("GitHubProvider.poll: polling resumes once the rate limit window has reset", async () => {
  let now = NOW;
  const resetSeconds = String(Math.floor(NOW / 1000) + 60);
  const { requests, fetch } = stubFetch((url) => {
    const headers = { "x-ratelimit-remaining": "0", "x-ratelimit-reset": resetSeconds };
    if (url.pathname === "/repos/acme/api") return { body: { default_branch: "main" }, headers };
    return { body: { workflow_runs: [] }, headers };
  });
  const provider = new GitHubProvider("tok", { fetch, now: () => now });
  await provider.poll("acme", "api");
  const before = requests.length;
  await provider.poll("acme", "api");
  assert.equal(requests.length, before);
  now += 61_000;
  await provider.poll("acme", "api");
  assert.equal(requests.length, before + 1);
});
