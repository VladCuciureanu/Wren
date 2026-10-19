import assert from "node:assert/strict";
import { test } from "node:test";
import { IngestionLoop } from "../src/ingestion.ts";
import type { PipelineState, Provider } from "../src/providers/mod.ts";
import type { RepoConfig } from "../src/config.ts";

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

test("IngestionLoop.pollOnce: unknown provider returns unknown state", async () => {
  const repos: RepoConfig[] = [{ owner: "a", name: "b", provider: "gitlab" }];
  const providers = new Map<string, Provider>();
  const loop = new IngestionLoop(repos, providers, 1000, () => {});
  const statuses = await loop.pollOnce();
  assert.deepEqual(statuses[0].state, "unknown");
  assert.deepEqual(statuses[0].error, "No provider: gitlab");
});

test("IngestionLoop: start/stop calls callback", async () => {
  const repos: RepoConfig[] = [{ owner: "a", name: "b", provider: "github" }];
  const providers = new Map([["github", fakeProvider("failing")]]);

  let callCount = 0;
  const loop = new IngestionLoop(repos, providers, 50, (statuses) => {
    callCount++;
    assert.deepEqual(statuses[0].state, "failing");
  });

  loop.start();
  await new Promise((r) => setTimeout(r, 180));
  loop.stop();

  // Should have been called at least 2 times in 180ms with 50ms interval
  if (callCount < 2) {
    throw new Error(`Expected at least 2 callbacks, got ${callCount}`);
  }
});
