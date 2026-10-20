import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Crossfader } from "../../src/audio/crossfade.ts";
import { FfplayEngine, checkFfplay } from "../../src/audio/ffplay.ts";
import type { Mood } from "../../src/state.ts";

const calm: Mood = { birdsong: 1.0, wind: 0.2, thunder: 0.0, rain: 0.0, hum: 0.0, chime: 0.0, static_: 0.0 };
const storm: Mood = { birdsong: 0.0, wind: 0.4, thunder: 0.8, rain: 0.7, hum: 0.0, chime: 0.0, static_: 0.0 };

interface Spawned {
  file: string;
  volume: number;
  killed: boolean;
  proc: EventEmitter;
}

/** Fake `spawn` that records each ffplay layer instead of starting a process. */
function fakeSpawn() {
  const spawned: Spawned[] = [];
  const spawn = (_cmd: string, args: readonly string[]): ChildProcess => {
    const proc = Object.assign(new EventEmitter(), {
      kill: () => {
        entry.killed = true;
        return true;
      },
    });
    const entry: Spawned = {
      file: args[args.length - 1],
      volume: Number(args[args.indexOf("-volume") + 1]),
      killed: false,
      proc,
    };
    spawned.push(entry);
    return proc as unknown as ChildProcess;
  };
  return { spawned, spawn };
}

test("checkFfplay: returns false when the binary is missing", async () => {
  assert.equal(await checkFfplay("wren-definitely-missing-binary"), false);
});

test("FfplayEngine: start spawns one looping process per audible layer", () => {
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 50, spawn);
  engine.start(calm);
  assert.deepEqual(spawned.map((s) => [s.file, s.volume]), [["assets/birdsong.ogg", 50], ["assets/wind.ogg", 10]]);
});

test("FfplayEngine: update only restarts layers whose volume changed", () => {
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 100, spawn);
  engine.start(calm);
  engine.update({ ...calm, wind: 0.5, rain: 0.3 });
  // birdsong unchanged: keeps looping. wind restarted, rain added.
  assert.deepEqual(spawned.map((s) => [s.file, s.volume, s.killed]), [
    ["assets/birdsong.ogg", 100, false],
    ["assets/wind.ogg", 20, true],
    ["assets/wind.ogg", 50, false],
    ["assets/rain.ogg", 30, false],
  ]);
});

test("Crossfader + FfplayEngine: a mood change restarts each layer at most once", async () => {
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 100, spawn);
  const fader = new Crossfader(engine);
  await fader.transitionTo(calm);
  assert.equal(spawned.length, 2);
  await fader.transitionTo(storm);
  // storm has 3 audible layers (wind changed, thunder and rain new): exactly 3 new spawns.
  assert.equal(spawned.length - 2, 3);
  assert.deepEqual(
    spawned.filter((s) => !s.killed).map((s) => [s.file, s.volume]),
    [["assets/wind.ogg", 40], ["assets/thunder.ogg", 80], ["assets/rain.ogg", 70]],
  );
});

test("FfplayEngine: a spawn error drops the layer and is reported once", () => {
  const { spawned, spawn } = fakeSpawn();
  const errors: Error[] = [];
  const engine = new FfplayEngine("assets", 100, spawn, (e) => errors.push(e));
  engine.start(calm);
  const enoent = Object.assign(new Error("spawn ffplay ENOENT"), { code: "ENOENT" });
  // Without an 'error' listener, emitting would throw (and crash Node).
  for (const s of spawned) s.proc.emit("error", enoent);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /ENOENT/);

  // The failed layers were dropped, so the next update spawns them afresh.
  engine.update(calm);
  assert.equal(spawned.length, 4);
  for (const s of spawned.slice(2)) s.proc.emit("error", enoent);
  assert.equal(errors.length, 1);
});

test("FfplayEngine: an error from an already replaced process does not drop the new layer", () => {
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 100, spawn, () => {});
  engine.start(calm);
  engine.update({ ...calm, wind: 0.5 }); // wind restarted: spawned[1] replaced by spawned[2]
  spawned[1].proc.emit("error", new Error("late"));
  engine.update({ ...calm, wind: 0.5 });
  assert.equal(spawned.length, 3);
  engine.stop();
  assert.equal(spawned[2].killed, true);
});

test("FfplayEngine: a synchronous spawn throw drops the layer instead of throwing", () => {
  const errors: Error[] = [];
  const spawn = (): ChildProcess => {
    throw new Error("spawn EINVAL");
  };
  const engine = new FfplayEngine("assets", 100, spawn, (e) => errors.push(e));
  assert.doesNotThrow(() => engine.start(calm));
  assert.equal(errors.length, 1);
});
