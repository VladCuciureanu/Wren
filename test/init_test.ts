import { assertEquals } from "@std/assert";
import { runInit } from "../src/init.ts";

Deno.test("runInit: creates config file in temp dir", async () => {
  const tmpDir = await Deno.makeTempDir();
  // Override XDG to point to temp dir
  const origXdg = Deno.env.get("XDG_CONFIG_HOME");
  Deno.env.set("XDG_CONFIG_HOME", tmpDir);

  // Capture exit calls
  let exitCalled = false;
  const origExit = Deno.exit;
  // deno-lint-ignore no-explicit-any
  (Deno as any).exit = () => { exitCalled = true; };

  try {
    await runInit();
    const configPath = `${tmpDir}/wren/config.toml`;
    const content = await Deno.readTextFile(configPath);
    assertEquals(content.includes("[general]"), true);
    assertEquals(content.includes("poll_interval = 45"), true);
    assertEquals(content.includes("[[repos]]"), true);
    assertEquals(exitCalled, false);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).exit = origExit;
    if (origXdg) {
      Deno.env.set("XDG_CONFIG_HOME", origXdg);
    } else {
      Deno.env.delete("XDG_CONFIG_HOME");
    }
    await Deno.remove(tmpDir, { recursive: true });
  }
});
