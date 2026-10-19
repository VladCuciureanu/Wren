import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFfplay } from "../../src/audio/ffplay.ts";

test("checkFfplay: returns boolean", async () => {
  const result = await checkFfplay();
  assert.deepEqual(typeof result, "boolean");
});
