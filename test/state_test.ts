import { assertEquals } from "@std/assert";
import { calculateMood, moodLabel } from "../src/state.ts";
import type { RepoStatus } from "../src/ingestion.ts";

function status(state: RepoStatus["state"]): RepoStatus {
  return { owner: "a", name: "b", state };
}

Deno.test("calculateMood: all passing = calm", () => {
  const mood = calculateMood([status("passing"), status("passing")]);
  assertEquals(mood.birdsong, 1.0);
  assertEquals(mood.thunder, 0.0);
  assertEquals(mood.rain, 0.0);
});

Deno.test("calculateMood: all failing = storm", () => {
  const mood = calculateMood([status("failing"), status("failing")]);
  assertEquals(mood.thunder, 0.5);
  assertEquals(mood.rain, 0.3);
  assertEquals(mood.birdsong, 0.1);
});

Deno.test("calculateMood: mixed blend is proportional", () => {
  // 3 passing + 1 failing
  const mood = calculateMood([
    status("passing"),
    status("passing"),
    status("passing"),
    status("failing"),
  ]);
  // birdsong: (1.0*3 + 0.1) / 4 = 0.775
  assertEquals(mood.birdsong, 0.78);
  // thunder: (0*3 + 0.5) / 4 = 0.125
  assertEquals(mood.thunder, 0.13);
});

Deno.test("calculateMood: single repo", () => {
  const mood = calculateMood([status("error")]);
  assertEquals(mood.thunder, 0.8);
  assertEquals(mood.rain, 0.7);
  assertEquals(mood.birdsong, 0.0);
});

Deno.test("calculateMood: empty list returns unknown/fog", () => {
  const mood = calculateMood([]);
  assertEquals(mood.static_, 0.5);
  assertEquals(mood.birdsong, 0.0);
});

Deno.test("moodLabel: passing mood is Clear skies", () => {
  const mood = calculateMood([status("passing")]);
  assertEquals(moodLabel(mood), "Clear skies");
});

Deno.test("moodLabel: error mood is Stormy", () => {
  const mood = calculateMood([status("error")]);
  assertEquals(moodLabel(mood), "Stormy");
});

Deno.test("moodLabel: unknown mood is Fog", () => {
  const mood = calculateMood([]);
  assertEquals(moodLabel(mood), "Fog");
});
