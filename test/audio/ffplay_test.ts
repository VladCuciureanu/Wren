import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFfplay } from "../../src/audio/ffplay.ts";

test("checkFfplay: returns false when the binary is missing", async () => {
  assert.equal(await checkFfplay("wren-definitely-missing-binary"), false);
});
