import assert from "node:assert/strict";
import { test } from "node:test";
import { Crossfader } from "../src/audio/crossfade.ts";
import type { AudioEngine } from "../src/audio/ffplay.ts";
import type { RepoConfig } from "../src/config.ts";
import { IngestionLoop } from "../src/ingestion.ts";
import type { PipelineState, Provider } from "../src/providers/mod.ts";
import type { Mood } from "../src/state.ts";
import { calculateMood } from "../src/state.ts";

test("integration: poll → mood → crossfade pipeline", async () => {
  const states: PipelineState[] = ["passing", "failing"];
  let pollIdx = 0;

  const fakeProvider: Provider = {
    poll: () => Promise.resolve(states[pollIdx++ % states.length]),
  };

  const repos: RepoConfig[] = [{ owner: "a", name: "b", provider: "fake" }];

  const updates: Mood[] = [];
  const engine: AudioEngine = {
    start: (mood) => {
      updates.push({ ...mood });
    },
    update: (mood) => {
      updates.push({ ...mood });
    },
    setMasterVolume: () => {},
    stop: () => {},
  };

  const crossfader = new Crossfader(engine);
  const providers = new Map<string, Provider>([["fake", fakeProvider]]);

  // Resolve once the pipeline has produced a start and one transition,
  // instead of sleeping for a fixed wall-clock time.
  const { promise: twoUpdates, resolve } = Promise.withResolvers<void>();
  const loop = new IngestionLoop(repos, providers, 1, (statuses) => {
    crossfader.transitionTo(calculateMood(statuses));
    if (updates.length >= 2) resolve();
  });

  loop.start();
  await twoUpdates;
  loop.stop();
  crossfader.stop();

  // First poll: passing → birdsong high; second: failing → thunder rolls in.
  assert.deepEqual(updates[0].birdsong, 1.0);
  assert.deepEqual(updates[1].thunder, 0.5);
});
