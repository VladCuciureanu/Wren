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
function fakeSpawn(onSpawn?: (file: string) => void) {
  const spawned: Spawned[] = [];
  const spawn = (_cmd: string, args: readonly string[]): ChildProcess => {
    onSpawn?.(args[args.length - 1]);
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

/** Manually advanced clock implementing the engine's Timers. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    get now() {
      return now;
    },
    setTimeout(fn: () => void, ms: number): unknown {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(handle: unknown): void {
      timers.delete(handle as number);
    },
    /** Move time forward, firing due timers in order (including ones they schedule). */
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | undefined;
        for (const entry of timers) {
          if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) due = entry;
        }
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    pending(): number {
      return timers.size;
    },
  };
}

/** Read through a call so TypeScript doesn't keep an earlier narrowing of the getter. */
function audioMessage(engine: FfplayEngine): string {
  return engine.audioError?.message ?? "";
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

test("FfplayEngine: a spawn error drops the layer and is reported once per failure episode", () => {
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

test("FfplayEngine: audioError persists while ffplay keeps failing and clears once layers keep playing", () => {
  const { spawned, spawn } = fakeSpawn();
  const clock = fakeClock();
  const engine = new FfplayEngine("assets", 100, spawn, () => {}, { timers: clock });
  assert.equal(engine.audioError, undefined);

  engine.start(calm);
  for (const s of spawned) s.proc.emit("error", new Error("spawn ffplay ENOENT"));
  for (let i = 0; i < 3; i++) {
    engine.update(calm);
    for (const s of spawned.slice(-2)) s.proc.emit("error", new Error("spawn ffplay ENOENT"));
    assert.match(audioMessage(engine), /ENOENT/);
  }

  engine.update(calm);
  const [birdsong, wind] = spawned.slice(-2);
  birdsong.proc.emit("spawn");
  wind.proc.emit("spawn");
  assert.match(audioMessage(engine), /ENOENT/, "not healthy until the layers keep playing");
  clock.advance(5_000);
  assert.equal(engine.audioError, undefined);
});

test("FfplayEngine: a new failure after recovery is reported again", () => {
  const { spawned, spawn } = fakeSpawn();
  const clock = fakeClock();
  const errors: Error[] = [];
  const engine = new FfplayEngine("assets", 100, spawn, (e) => errors.push(e), { timers: clock });
  engine.start(calm);
  spawned[0].proc.emit("error", new Error("first"));
  engine.update(calm);
  spawned.at(-1)?.proc.emit("spawn");
  clock.advance(5_000);
  assert.equal(engine.audioError, undefined);

  spawned[1].proc.emit("error", new Error("second"));
  assert.deepEqual(errors.map((e) => e.message), ["first", "second"]);
});

/** Advance the clock in small steps until another process is spawned; returns the wait. */
function untilNextSpawn(clock: ReturnType<typeof fakeClock>, spawned: Spawned[]): number {
  const start = clock.now;
  const count = spawned.length;
  while (spawned.length === count) {
    if (clock.now - start > 120_000) throw new Error("no respawn");
    clock.advance(100);
  }
  return clock.now - start;
}

test("FfplayEngine: a failed layer is retried with a doubling, capped delay", () => {
  const clock = fakeClock();
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 100, spawn, () => {}, {
    timers: clock,
    retry: { baseMs: 1_000, maxMs: 4_000, stableMs: 5_000 },
  });
  engine.start({ ...calm, wind: 0 });
  const waits: number[] = [];
  for (let i = 0; i < 4; i++) {
    spawned.at(-1)?.proc.emit("error", new Error("spawn ffplay ENOENT"));
    waits.push(untilNextSpawn(clock, spawned));
  }
  assert.deepEqual(waits, [1_000, 2_000, 4_000, 4_000]);
  assert.ok(spawned.every((s) => s.file === "assets/birdsong.ogg"));
});

test("FfplayEngine: a layer that starts and dies right away keeps backing off", () => {
  const clock = fakeClock();
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 100, spawn, () => {}, { timers: clock });
  engine.start({ ...calm, wind: 0 });
  const waits: number[] = [];
  for (let i = 0; i < 4; i++) {
    const proc = spawned.at(-1)?.proc;
    proc?.emit("spawn");
    clock.advance(100); // corrupt file: ffplay exits almost immediately
    proc?.emit("exit", 1, null);
    assert.ok(engine.audioError, "still failing");
    waits.push(untilNextSpawn(clock, spawned));
  }
  assert.deepEqual(waits, [1_000, 2_000, 4_000, 8_000]);
});

test("FfplayEngine: a layer that stays up resets the backoff", () => {
  const clock = fakeClock();
  const log: { file: string; at: number }[] = [];
  const { spawned, spawn } = fakeSpawn((file) => log.push({ file, at: clock.now }));
  const engine = new FfplayEngine("assets", 100, spawn, () => {}, { timers: clock });
  engine.start({ ...calm, wind: 0 });
  spawned.at(-1)?.proc.emit("error", new Error("a"));
  clock.advance(1_000); // retry #1
  spawned.at(-1)?.proc.emit("error", new Error("b"));
  clock.advance(2_000); // retry #2
  spawned.at(-1)?.proc.emit("spawn");
  clock.advance(5_000); // stable: healthy again
  assert.equal(engine.audioError, undefined);

  const before = log.length;
  spawned.at(-1)?.proc.emit("exit", 1, null);
  clock.advance(1_000);
  assert.equal(log.length, before + 1, "retried after the base delay again");
});

test("FfplayEngine: no retry for a layer that was silenced or after stop", () => {
  const clock = fakeClock();
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 100, spawn, () => {}, { timers: clock });
  engine.start(calm);
  spawned[0].proc.emit("error", new Error("birdsong broke"));
  spawned[1].proc.emit("error", new Error("wind broke"));
  engine.update({ ...calm, birdsong: 0, wind: 0.2 }); // wind respawned now, birdsong silenced
  assert.equal(spawned.length, 3);
  engine.stop();
  clock.advance(60_000);
  assert.equal(spawned.length, 3);
  assert.equal(clock.pending(), 0);
});

test("FfplayEngine: an update during a pending retry spawns once, not twice", () => {
  const clock = fakeClock();
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 100, spawn, () => {}, { timers: clock });
  engine.start({ ...calm, wind: 0 });
  spawned[0].proc.emit("error", new Error("x"));
  engine.update({ ...calm, wind: 0 }); // respawns birdsong immediately
  clock.advance(60_000);
  assert.equal(spawned.length, 2);
});

test("FfplayEngine: an unexpected ffplay exit is a failure and the layer respawns", () => {
  const { spawned, spawn } = fakeSpawn();
  const errors: Error[] = [];
  const engine = new FfplayEngine("assets", 100, spawn, (e) => errors.push(e));
  engine.start(calm);
  spawned[0].proc.emit("spawn");
  spawned[0].proc.emit("exit", 1, null);

  assert.match(audioMessage(engine), /birdsong\.ogg \(exit code 1\)/);
  assert.equal(errors.length, 1);
  engine.update(calm);
  assert.equal(spawned.at(-1)?.file, "assets/birdsong.ogg");
});

test("FfplayEngine: exits of layers we killed are not failures", () => {
  const { spawned, spawn } = fakeSpawn();
  const errors: Error[] = [];
  const engine = new FfplayEngine("assets", 100, spawn, (e) => errors.push(e));
  engine.start(calm);
  engine.update({ ...calm, wind: 0.5 }); // wind restarted
  spawned[1].proc.emit("exit", null, "SIGTERM");
  engine.stop();
  for (const s of spawned) s.proc.emit("exit", null, "SIGTERM");
  assert.equal(engine.audioError, undefined);
  assert.equal(errors.length, 0);
});

test("FfplayEngine: silencing a failing layer clears its failure", () => {
  const { spawned, spawn } = fakeSpawn();
  const engine = new FfplayEngine("assets", 100, spawn, () => {});
  engine.start(calm);
  spawned[1].proc.emit("error", new Error("wind broke"));
  assert.ok(engine.audioError);
  engine.update({ ...calm, wind: 0 });
  assert.equal(engine.audioError, undefined);
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
