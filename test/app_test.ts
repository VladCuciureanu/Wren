import assert from "node:assert/strict";
import { test } from "node:test";
import { type AudioHealth, type ViewState, createUpdateHandler, currentNotice } from "../src/app.ts";
import type { RepoStatus } from "../src/ingestion.ts";

const passing: RepoStatus[] = [{ owner: "a", name: "b", state: "passing" }];
const healthy: AudioHealth = { audioError: undefined };

test("createUpdateHandler: a successful update clears the previous update failure", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false, updateError: "Update failed: boom" };
  const drawn: (string | undefined)[] = [];
  const onUpdate = createUpdateHandler(view, { transitionTo: () => {} }, () => drawn.push(currentNotice(view, healthy)));

  onUpdate(passing);

  assert.equal(view.updateError, undefined);
  assert.deepEqual(drawn, [undefined]);
  assert.deepEqual(view.statuses, passing);
});

test("createUpdateHandler: a failing update leaves the error for the loop to report", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false };
  const onUpdate = createUpdateHandler(view, { transitionTo: () => {} }, () => {
    throw new Error("drawTui exploded");
  });
  assert.throws(() => onUpdate(passing), /drawTui exploded/);
});

test("currentNotice: an ongoing audio failure stays visible across successful updates", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false };
  const audio = { audioError: new Error("spawn ffplay ENOENT") as Error | undefined };
  const drawn: (string | undefined)[] = [];
  const onUpdate = createUpdateHandler(view, { transitionTo: () => {} }, () => drawn.push(currentNotice(view, audio)));

  onUpdate(passing);
  onUpdate(passing);
  audio.audioError = undefined; // a layer spawned again
  onUpdate(passing);

  assert.deepEqual(drawn, ["Audio error: spawn ffplay ENOENT", "Audio error: spawn ffplay ENOENT", undefined]);
});

test("currentNotice: an update failure takes precedence over an audio failure", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false, updateError: "Update failed: boom" };
  assert.equal(currentNotice(view, { audioError: new Error("x") }), "Update failed: boom");
});
