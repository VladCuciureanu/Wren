import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepoStatus } from "../src/ingestion.ts";
import { calculateMood, moodLabel } from "../src/state.ts";

function status(state: RepoStatus["state"]): RepoStatus {
  return { owner: "a", name: "b", state };
}

test("calculateMood: all passing = calm", () => {
  const mood = calculateMood([status("passing"), status("passing")]);
  assert.deepEqual(mood.birdsong, 1.0);
  assert.deepEqual(mood.thunder, 0.0);
  assert.deepEqual(mood.rain, 0.0);
});

test("calculateMood: all failing = storm", () => {
  const mood = calculateMood([status("failing"), status("failing")]);
  assert.deepEqual(mood.thunder, 0.5);
  assert.deepEqual(mood.rain, 0.3);
  assert.deepEqual(mood.birdsong, 0.1);
});

test("calculateMood: mixed blend is proportional", () => {
  // 3 passing + 1 failing
  const mood = calculateMood([
    status("passing"),
    status("passing"),
    status("passing"),
    status("failing"),
  ]);
  // birdsong: (1.0*3 + 0.1) / 4 = 0.775
  assert.deepEqual(mood.birdsong, 0.78);
  // thunder: (0*3 + 0.5) / 4 = 0.125
  assert.deepEqual(mood.thunder, 0.13);
});

test("calculateMood: single repo", () => {
  const mood = calculateMood([status("error")]);
  assert.deepEqual(mood.thunder, 0.8);
  assert.deepEqual(mood.rain, 0.7);
  assert.deepEqual(mood.birdsong, 0.0);
});

test("calculateMood: empty list returns unknown/fog", () => {
  const mood = calculateMood([]);
  assert.deepEqual(mood.static, 0.5);
  assert.deepEqual(mood.birdsong, 0.0);
});

test("moodLabel: passing mood is Clear skies", () => {
  const mood = calculateMood([status("passing")]);
  assert.deepEqual(moodLabel(mood), "Clear skies");
});

test("moodLabel: error mood is Stormy", () => {
  const mood = calculateMood([status("error")]);
  assert.deepEqual(moodLabel(mood), "Stormy");
});

test("moodLabel: unknown mood is Fog", () => {
  const mood = calculateMood([]);
  assert.deepEqual(moodLabel(mood), "Fog");
});
