import assert from "node:assert/strict";
import { test } from "node:test";
import { createProvider } from "../../src/providers/mod.ts";

test("createProvider: resolves github provider", () => {
  const provider = createProvider("github", "fake-token");
  // Should return an object with a poll method
  if (typeof provider.poll !== "function") {
    throw new Error("Expected provider to have a poll method");
  }
});

test("createProvider: throws on unknown provider", () => {
  assert.throws(() => createProvider("bitbucket", "token"), /Unknown provider: "bitbucket"/);
});
