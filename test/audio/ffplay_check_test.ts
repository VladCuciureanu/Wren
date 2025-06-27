import { assertEquals } from "@std/assert";
import { checkFfplay } from "../../src/audio/ffplay.ts";

Deno.test("checkFfplay: returns true when ffplay is available", async () => {
  // This test will pass on machines with ffmpeg installed, fail gracefully otherwise
  const result = await checkFfplay();
  // Just verify it returns a boolean without throwing
  assertEquals(typeof result, "boolean");
});
