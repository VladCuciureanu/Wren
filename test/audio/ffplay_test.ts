import { assertEquals } from "@std/assert";
import { checkFfplay } from "../../src/audio/ffplay.ts";

Deno.test("checkFfplay: returns boolean", async () => {
  const result = await checkFfplay();
  assertEquals(typeof result, "boolean");
});
