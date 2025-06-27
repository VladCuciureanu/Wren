import { assertEquals } from "@std/assert";
import { renderTui } from "../src/tui.ts";
import type { Mood } from "../src/state.ts";

const calm: Mood = { birdsong: 1.0, wind: 0.2, thunder: 0.0, rain: 0.0, hum: 0.0, chime: 0.0, static_: 0.0 };
const fog: Mood = { birdsong: 0.0, wind: 0.0, thunder: 0.0, rain: 0.0, hum: 0.0, chime: 0.0, static_: 0.5 };

Deno.test("renderTui: shows mood label", () => {
  const output = renderTui({ mood: calm, statuses: [], volume: 80, muted: false });
  assertEquals(output.includes("Clear skies"), true);
});

Deno.test("renderTui: shows volume", () => {
  const output = renderTui({ mood: calm, statuses: [], volume: 50, muted: false });
  assertEquals(output.includes("50%"), true);
});

Deno.test("renderTui: shows muted", () => {
  const output = renderTui({ mood: calm, statuses: [], volume: 50, muted: true });
  assertEquals(output.includes("muted"), true);
});

Deno.test("renderTui: shows no repos message", () => {
  const output = renderTui({ mood: fog, statuses: [], volume: 80, muted: false });
  assertEquals(output.includes("No repos configured"), true);
});

Deno.test("renderTui: shows repo statuses", () => {
  const output = renderTui({
    mood: calm,
    statuses: [
      { owner: "acme", name: "api", state: "passing" },
      { owner: "acme", name: "web", state: "failing" },
    ],
    volume: 80,
    muted: false,
  });
  assertEquals(output.includes("[ok] acme/api"), true);
  assertEquals(output.includes("[FAIL] acme/web"), true);
});

Deno.test("renderTui: shows error info", () => {
  const output = renderTui({
    mood: fog,
    statuses: [{ owner: "a", name: "b", state: "unknown", error: "timeout" }],
    volume: 80,
    muted: false,
  });
  assertEquals(output.includes("(timeout)"), true);
});
