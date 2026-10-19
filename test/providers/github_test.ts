import assert from "node:assert/strict";
import { test } from "node:test";
import { mapRunsToState } from "../../src/providers/github.ts";

test("mapRunsToState: empty runs returns unknown", () => {
  assert.deepEqual(mapRunsToState([]), "unknown");
});

test("mapRunsToState: successful build returns passing", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "success", name: "CI" }]),
    "passing",
  );
});

test("mapRunsToState: failed build returns failing", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "failure", name: "CI" }]),
    "failing",
  );
});

test("mapRunsToState: in_progress returns pending", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "in_progress", conclusion: null, name: "Build" }]),
    "pending",
  );
});

test("mapRunsToState: in_progress deploy returns deploying", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "in_progress", conclusion: null, name: "Deploy to prod" }]),
    "deploying",
  );
});

test("mapRunsToState: successful deploy returns deploy_success", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "success", name: "Deploy" }]),
    "deploy_success",
  );
});

test("mapRunsToState: failed deploy returns deploy_failed", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "failure", name: "Deploy staging" }]),
    "deploy_failed",
  );
});

test("mapRunsToState: queued returns pending", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "queued", conclusion: null, name: "CI" }]),
    "pending",
  );
});

test("mapRunsToState: cancelled returns unknown", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "cancelled", name: "CI" }]),
    "unknown",
  );
});

test("mapRunsToState: unexpected conclusion returns error", () => {
  assert.deepEqual(
    mapRunsToState([{ status: "completed", conclusion: "timed_out", name: "CI" }]),
    "error",
  );
});
