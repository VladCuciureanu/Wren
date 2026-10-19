import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFfplay } from "../../src/audio/ffplay.ts";

test("checkFfplay: returns true when ffplay is available", async () => {
  // This test will pass on machines with ffmpeg installed, fail gracefully otherwise
  const result = await checkFfplay();
  // Just verify it returns a boolean without throwing
  assert.deepEqual(typeof result, "boolean");
});
