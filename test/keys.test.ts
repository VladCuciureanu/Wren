import assert from "node:assert/strict";
import { test } from "node:test";
import { keyAction } from "../src/keys.ts";

test("keyAction: q and Ctrl+C (0x03 in raw mode) quit", () => {
  assert.equal(keyAction("q".charCodeAt(0)), "quit");
  assert.equal(keyAction(0x03), "quit");
});

test("keyAction: volume and mute keys", () => {
  assert.equal(keyAction("m".charCodeAt(0)), "mute");
  assert.equal(keyAction("+".charCodeAt(0)), "volume_up");
  assert.equal(keyAction("=".charCodeAt(0)), "volume_up");
  assert.equal(keyAction("-".charCodeAt(0)), "volume_down");
  assert.equal(keyAction("x".charCodeAt(0)), undefined);
});
