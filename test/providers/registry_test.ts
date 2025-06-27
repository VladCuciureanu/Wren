import { assertThrows } from "@std/assert";
import { createProvider } from "../../src/providers/mod.ts";

Deno.test("createProvider: resolves github provider", () => {
  const provider = createProvider("github", "fake-token");
  // Should return an object with a poll method
  if (typeof provider.poll !== "function") {
    throw new Error("Expected provider to have a poll method");
  }
});

Deno.test("createProvider: throws on unknown provider", () => {
  assertThrows(() => createProvider("bitbucket", "token"), Error, 'Unknown provider: "bitbucket"');
});
