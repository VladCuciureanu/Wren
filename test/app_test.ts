import assert from "node:assert/strict";
import { test } from "node:test";
import { type ViewState, createUpdateHandler } from "../src/app.ts";
import type { RepoStatus } from "../src/ingestion.ts";

const passing: RepoStatus[] = [{ owner: "a", name: "b", state: "passing" }];

test("createUpdateHandler: a successful update clears a stale notice", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false, notice: "Update failed: boom" };
  const drawn: (string | undefined)[] = [];
  const onUpdate = createUpdateHandler(view, { transitionTo: () => {} }, () => drawn.push(view.notice));

  onUpdate(passing);

  assert.equal(view.notice, undefined);
  assert.deepEqual(drawn, [undefined]);
  assert.deepEqual(view.statuses, passing);
});

test("createUpdateHandler: an audio error raised during the update stays visible", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false, notice: "Update failed: boom" };
  const drawn: (string | undefined)[] = [];
  const crossfader = {
    transitionTo: () => {
      view.notice = "Audio error: spawn ffplay ENOENT";
    },
  };
  const onUpdate = createUpdateHandler(view, crossfader, () => drawn.push(view.notice));

  onUpdate(passing);

  assert.deepEqual(drawn, ["Audio error: spawn ffplay ENOENT"]);
});

test("createUpdateHandler: a failing update leaves the notice for the error handler", () => {
  const view: ViewState = { statuses: [], volume: 80, muted: false };
  const onUpdate = createUpdateHandler(view, { transitionTo: () => {} }, () => {
    throw new Error("drawTui exploded");
  });
  assert.throws(() => onUpdate(passing), /drawTui exploded/);
});
