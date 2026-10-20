import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AudioHealth,
  applyVolumeKey,
  createUpdateHandler,
  currentNotice,
  missingTokenWarning,
  type ViewState,
} from "../src/app.ts";
import type { RepoStatus } from "../src/ingestion.ts";

const passing: RepoStatus[] = [{ owner: "a", name: "b", state: "passing" }];
const healthy: AudioHealth = { audioError: undefined };

test("createUpdateHandler: a successful update clears the previous update failure", () => {
  const view: ViewState = {
    statuses: [],
    volume: 80,
    muted: false,
    updateError: "Update failed: boom",
  };
  const drawn: (string | undefined)[] = [];
  const onUpdate = createUpdateHandler(view, { transitionTo: () => {} }, () =>
    drawn.push(currentNotice(view, healthy)),
  );

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
  const onUpdate = createUpdateHandler(view, { transitionTo: () => {} }, () =>
    drawn.push(currentNotice(view, audio)),
  );

  onUpdate(passing);
  onUpdate(passing);
  audio.audioError = undefined; // a layer spawned again
  onUpdate(passing);

  assert.deepEqual(drawn, [
    "Audio error: spawn ffplay ENOENT",
    "Audio error: spawn ffplay ENOENT",
    undefined,
  ]);
});

test("currentNotice: an update failure takes precedence over an audio failure", () => {
  const view: ViewState = {
    statuses: [],
    volume: 80,
    muted: false,
    updateError: "Update failed: boom",
  };
  assert.equal(currentNotice(view, { audioError: new Error("x") }), "Update failed: boom");
});

test("missingTokenWarning: only when a repo relies on an unset GITHUB_TOKEN", () => {
  const withToken = { token: "ghp_x" };
  assert.match(missingTokenWarning([withToken, {}], undefined) ?? "", /GITHUB_TOKEN is not set/);
  assert.match(missingTokenWarning([{}], "") ?? "", /unauthenticated/);
  assert.equal(missingTokenWarning([{}], "ghp_env"), undefined);
  assert.equal(missingTokenWarning([withToken], undefined), undefined);
});

test("currentNotice: the standing warning shows only while nothing is failing", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false, warning: "no token" };
  assert.equal(currentNotice(view, healthy), "no token");
  assert.equal(currentNotice(view, { audioError: new Error("x") }), "Audio error: x");
  view.updateError = "Update failed: boom";
  assert.equal(currentNotice(view, healthy), "Update failed: boom");
});

test("applyVolumeKey: m toggles mute; + and - step the volume within 0-100 and unmute", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false };
  applyVolumeKey(view, "mute");
  assert.equal(view.muted, true);
  applyVolumeKey(view, "mute");
  assert.equal(view.muted, false);

  view.muted = true;
  applyVolumeKey(view, "volume_down");
  assert.deepEqual([view.volume, view.muted], [75, false]);

  view.muted = true;
  applyVolumeKey(view, "volume_up");
  assert.deepEqual([view.volume, view.muted], [80, false]);

  view.volume = 98;
  applyVolumeKey(view, "volume_up");
  assert.equal(view.volume, 100);
  view.volume = 3;
  applyVolumeKey(view, "volume_down");
  assert.equal(view.volume, 0);
});
