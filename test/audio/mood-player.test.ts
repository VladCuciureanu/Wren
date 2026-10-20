import assert from "node:assert/strict";
import { test } from "node:test";
import type { AudioEngine } from "../../src/audio/ffplay.ts";
import { MoodPlayer } from "../../src/audio/mood-player.ts";
import type { Mood } from "../../src/state.ts";

const calm: Mood = {
  birdsong: 1.0,
  wind: 0.2,
  thunder: 0.0,
  rain: 0.0,
  hum: 0.0,
  chime: 0.0,
  static: 0.0,
};
const storm: Mood = {
  birdsong: 0.0,
  wind: 0.4,
  thunder: 0.8,
  rain: 0.7,
  hum: 0.0,
  chime: 0.0,
  static: 0.0,
};

function recordingEngine() {
  const calls: { op: "start" | "update"; mood: Mood }[] = [];
  const engine: AudioEngine = {
    start: (mood) => {
      calls.push({ op: "start", mood: { ...mood } });
    },
    update: (mood) => {
      calls.push({ op: "update", mood: { ...mood } });
    },
    setMasterVolume: () => {},
    stop: () => {},
  };
  return { calls, engine };
}

test("MoodPlayer: first transition calls start", () => {
  const { calls, engine } = recordingEngine();
  new MoodPlayer(engine).transitionTo(calm);
  assert.deepEqual(calls, [{ op: "start", mood: calm }]);
});

test("MoodPlayer: no-op when mood unchanged", () => {
  const { calls, engine } = recordingEngine();
  const player = new MoodPlayer(engine);
  player.transitionTo(calm);
  player.transitionTo({ ...calm });
  assert.equal(calls.length, 1);
});

test("MoodPlayer: a mood change is applied with a single update at the target volumes", () => {
  const { calls, engine } = recordingEngine();
  const player = new MoodPlayer(engine);
  player.transitionTo(calm);
  player.transitionTo(storm);
  assert.deepEqual(calls, [
    { op: "start", mood: calm },
    { op: "update", mood: storm },
  ]);
});

test("MoodPlayer: back-to-back transitions settle on the latest mood", async () => {
  const { calls, engine } = recordingEngine();
  const player = new MoodPlayer(engine);
  player.transitionTo(calm);
  // Fire-and-forget, as the ingestion callback does: the last call must win.
  const pending = [player.transitionTo(storm), player.transitionTo(calm)];
  await Promise.all(pending);
  assert.deepEqual(player.currentMood, calm);
  assert.deepEqual(calls.at(-1)?.mood, calm);
});
