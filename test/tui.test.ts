import assert from "node:assert/strict";
import { test } from "node:test";
import type { Mood } from "../src/state.ts";
import { renderTui } from "../src/tui.ts";

const calm: Mood = {
  birdsong: 1.0,
  wind: 0.2,
  thunder: 0.0,
  rain: 0.0,
  hum: 0.0,
  chime: 0.0,
  static: 0.0,
};
const fog: Mood = {
  birdsong: 0.0,
  wind: 0.0,
  thunder: 0.0,
  rain: 0.0,
  hum: 0.0,
  chime: 0.0,
  static: 0.5,
};

test("renderTui: shows mood label", () => {
  const output = renderTui({ mood: calm, statuses: [], volume: 80, muted: false });
  assert.deepEqual(output.includes("Clear skies"), true);
});

test("renderTui: shows volume", () => {
  const output = renderTui({ mood: calm, statuses: [], volume: 50, muted: false });
  assert.deepEqual(output.includes("50%"), true);
});

test("renderTui: shows muted", () => {
  const output = renderTui({ mood: calm, statuses: [], volume: 50, muted: true });
  assert.deepEqual(output.includes("muted"), true);
});

test("renderTui: shows no repos message", () => {
  const output = renderTui({ mood: fog, statuses: [], volume: 80, muted: false });
  assert.deepEqual(output.includes("No repos configured"), true);
});

test("renderTui: shows repo statuses", () => {
  const output = renderTui({
    mood: calm,
    statuses: [
      { owner: "acme", name: "api", state: "passing" },
      { owner: "acme", name: "web", state: "failing" },
    ],
    volume: 80,
    muted: false,
  });
  assert.deepEqual(output.includes("[ok] acme/api"), true);
  assert.deepEqual(output.includes("[FAIL] acme/web"), true);
});

test("renderTui: shows error info", () => {
  const output = renderTui({
    mood: fog,
    statuses: [{ owner: "a", name: "b", state: "unknown", error: "timeout" }],
    volume: 80,
    muted: false,
  });
  assert.deepEqual(output.includes("(timeout)"), true);
});

test("renderTui: shows a notice when one is set", () => {
  const output = renderTui({
    mood: fog,
    statuses: [],
    volume: 80,
    muted: false,
    notice: "ffplay failed",
  });
  assert.match(output, /! ffplay failed/);
});
