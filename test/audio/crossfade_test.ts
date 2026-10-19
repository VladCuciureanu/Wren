import assert from "node:assert/strict";
import { test } from "node:test";
import { interpolateMood } from "../../src/audio/crossfade.ts";
import { Crossfader } from "../../src/audio/crossfade.ts";
import type { Mood } from "../../src/state.ts";
import type { AudioEngine } from "../../src/audio/ffplay.ts";

const calm: Mood = { birdsong: 1.0, wind: 0.2, thunder: 0.0, rain: 0.0, hum: 0.0, chime: 0.0, static_: 0.0 };
const storm: Mood = { birdsong: 0.0, wind: 0.4, thunder: 0.8, rain: 0.7, hum: 0.0, chime: 0.0, static_: 0.0 };

test("interpolateMood: t=0 returns start", () => {
  const result = interpolateMood(calm, storm, 0);
  assert.deepEqual(result.birdsong, 1.0);
  assert.deepEqual(result.thunder, 0.0);
});

test("interpolateMood: t=1 returns end", () => {
  const result = interpolateMood(calm, storm, 1);
  assert.deepEqual(result.birdsong, 0.0);
  assert.deepEqual(result.thunder, 0.8);
});

test("interpolateMood: t=0.5 returns midpoint", () => {
  const result = interpolateMood(calm, storm, 0.5);
  assert.deepEqual(result.birdsong, 0.5);
  assert.deepEqual(result.thunder, 0.4);
  assert.deepEqual(result.wind, 0.3);
});

test("Crossfader: first transition calls start", async () => {
  let started = false;
  const engine: AudioEngine = {
    start: () => { started = true; },
    update: () => {},
    setMasterVolume: () => {},
    stop: () => {},
  };
  const fader = new Crossfader(engine, { durationMs: 50, steps: 2 });
  await fader.transitionTo(calm);
  assert.deepEqual(started, true);
});

test("Crossfader: no-op when mood unchanged", async () => {
  let updateCount = 0;
  const engine: AudioEngine = {
    start: () => {},
    update: () => { updateCount++; },
    setMasterVolume: () => {},
    stop: () => {},
  };
  const fader = new Crossfader(engine, { durationMs: 50, steps: 2 });
  await fader.transitionTo(calm);
  await fader.transitionTo(calm);
  assert.deepEqual(updateCount, 0);
});

test("Crossfader: transition calls update for each step", async () => {
  let updateCount = 0;
  const engine: AudioEngine = {
    start: () => {},
    update: () => { updateCount++; },
    setMasterVolume: () => {},
    stop: () => {},
  };
  const fader = new Crossfader(engine, { durationMs: 50, steps: 5 });
  await fader.transitionTo(calm);
  await fader.transitionTo(storm);
  assert.deepEqual(updateCount, 5);
});
