import { assertEquals } from "@std/assert";
import type { Provider, PipelineState } from "../src/providers/mod.ts";
import type { RepoConfig } from "../src/config.ts";
import { IngestionLoop } from "../src/ingestion.ts";
import { calculateMood } from "../src/state.ts";
import type { Mood } from "../src/state.ts";
import { Crossfader } from "../src/audio/crossfade.ts";
import type { AudioEngine } from "../src/audio/ffplay.ts";

Deno.test({
  name: "integration: poll → mood → crossfade pipeline",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const states: PipelineState[] = ["passing", "failing"];
    let pollIdx = 0;

    const fakeProvider: Provider = {
      poll: () => Promise.resolve(states[pollIdx++ % states.length]),
    };

    const repos: RepoConfig[] = [
      { owner: "a", name: "b", provider: "fake" },
    ];

    const updates: Mood[] = [];
    const engine: AudioEngine = {
      start: (mood) => { updates.push({ ...mood }); },
      update: (mood) => { updates.push({ ...mood }); },
      setMasterVolume: () => {},
      stop: () => {},
    };

    const crossfader = new Crossfader(engine, { durationMs: 20, steps: 2 });

    const providers = new Map<string, Provider>([["fake", fakeProvider]]);

    const loop = new IngestionLoop(repos, providers, 80, async (statuses) => {
      const mood = calculateMood(statuses);
      await crossfader.transitionTo(mood);
    });

    loop.start();
    await new Promise((r) => setTimeout(r, 250));
    loop.stop();
    crossfader.stop();

    // Should have received at least 2 mood updates (start + transition)
    if (updates.length < 2) {
      throw new Error(`Expected at least 2 mood updates, got ${updates.length}`);
    }

    // First poll: passing → birdsong should be high
    assertEquals(updates[0].birdsong, 1.0);
  },
});
