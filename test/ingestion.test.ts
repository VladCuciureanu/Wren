import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepoConfig } from "../src/config.ts";
import { buildProviders, IngestionLoop, providerKey } from "../src/ingestion.ts";
import { GitHubProvider, type PipelineState, type Provider } from "../src/providers/mod.ts";

function fakeProvider(state: PipelineState): Provider {
  return {
    poll: () => Promise.resolve(state),
  };
}

function failingProvider(msg: string): Provider {
  return {
    poll: () => Promise.reject(new Error(msg)),
  };
}

test("IngestionLoop.pollOnce: returns statuses for all repos", async () => {
  const repos: RepoConfig[] = [
    { owner: "a", name: "b", provider: "github" },
    { owner: "c", name: "d", provider: "github" },
  ];
  const providers = new Map([["github", fakeProvider("passing")]]);
  const loop = new IngestionLoop(repos, providers, 1000, () => {});
  const statuses = await loop.pollOnce();
  assert.deepEqual(statuses.length, 2);
  assert.deepEqual(statuses[0].state, "passing");
  assert.deepEqual(statuses[1].state, "passing");
});

test("IngestionLoop.pollOnce: isolates errors per repo", async () => {
  const repos: RepoConfig[] = [
    { owner: "a", name: "ok", provider: "good" },
    { owner: "b", name: "bad", provider: "broken" },
  ];
  const providers = new Map<string, Provider>([
    ["good", fakeProvider("passing")],
    ["broken", failingProvider("network error")],
  ]);
  const loop = new IngestionLoop(repos, providers, 1000, () => {});
  const statuses = await loop.pollOnce();
  assert.deepEqual(statuses[0].state, "passing");
  assert.deepEqual(statuses[0].error, undefined);
  assert.deepEqual(statuses[1].state, "unknown");
  assert.deepEqual(statuses[1].error, "network error");
});

test("IngestionLoop: start polls repeatedly and stop halts polling", async () => {
  const repos: RepoConfig[] = [{ owner: "a", name: "b", provider: "github" }];
  const providers = new Map([["github", fakeProvider("failing")]]);

  // Wait for the second callback rather than sleeping a fixed wall-clock time.
  const { promise: secondCall, resolve } = Promise.withResolvers<void>();
  let callCount = 0;
  const loop = new IngestionLoop(repos, providers, 1, (statuses) => {
    callCount++;
    assert.deepEqual(statuses[0].state, "failing");
    if (callCount === 2) resolve();
  });

  loop.start();
  await secondCall;
  loop.stop();

  const stoppedAt = callCount;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(callCount, stoppedAt);
});

test("buildProviders: repos with different tokens get different providers", async () => {
  const repos: RepoConfig[] = [
    { owner: "a", name: "one", provider: "github", token: "token-a" },
    { owner: "b", name: "two", provider: "github", token: "token-b" },
    { owner: "c", name: "three", provider: "github", token: "token-a" },
  ];
  const created: string[] = [];
  const providers = buildProviders(repos, "env-token", (_name, token) => {
    created.push(token);
    return { poll: () => Promise.resolve(token === "token-a" ? "passing" : "failing") };
  });
  assert.deepEqual(created, ["token-a", "token-b"]);
  assert.notEqual(providers.get(providerKey(repos[0])), providers.get(providerKey(repos[1])));
  assert.equal(providers.get(providerKey(repos[0])), providers.get(providerKey(repos[2])));

  const loop = new IngestionLoop(repos, providers, 1000, () => {});
  const statuses = await loop.pollOnce();
  assert.deepEqual(
    statuses.map((s) => s.state),
    ["passing", "failing", "passing"],
  );
});

test("buildProviders: repos without a token share the default-token provider", () => {
  const repos: RepoConfig[] = [
    { owner: "a", name: "one", provider: "github" },
    { owner: "b", name: "two", provider: "github" },
  ];
  const created: string[] = [];
  const providers = buildProviders(repos, "env-token", (_name, token) => {
    created.push(token);
    return fakeProvider("passing");
  });
  assert.deepEqual(created, ["env-token"]);
  assert.equal(providers.size, 1);
});

test("IngestionLoop: a throwing callback is reported and polling continues", {
  timeout: 2000,
}, async () => {
  const repos: RepoConfig[] = [{ owner: "a", name: "b", provider: "github" }];
  const providers = new Map([["github", fakeProvider("passing")]]);

  const errors: Error[] = [];
  const { promise: secondCall, resolve } = Promise.withResolvers<void>();
  let callCount = 0;
  const loop = new IngestionLoop(
    repos,
    providers,
    1,
    () => {
      callCount++;
      if (callCount === 1) throw new Error("drawTui exploded");
      resolve();
    },
    (e) => errors.push(e),
  );

  loop.start();
  await secondCall;
  loop.stop();

  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, "drawTui exploded");
});

test("buildProviders: creates GitHub providers by default", () => {
  const repos: RepoConfig[] = [{ owner: "a", name: "b", provider: "github" }];
  const providers = buildProviders(repos, "env-token");
  assert.ok(providers.get("github") instanceof GitHubProvider);
});
