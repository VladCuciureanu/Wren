import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { runInit } from "../src/init.ts";

test("runInit: creates config file in temp dir", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "wren-"));
  // Override XDG to point to temp dir
  const origXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpDir;

  // Capture exit calls
  let exitCalled = false;
  const origExit = process.exit;
  process.exit = (() => {
    exitCalled = true;
  }) as typeof process.exit;

  try {
    await runInit();
    const configPath = `${tmpDir}/wren/config.toml`;
    const content = await readFile(configPath, "utf8");
    assert.deepEqual(content.includes("[general]"), true);
    assert.deepEqual(content.includes("poll_interval = 45"), true);
    assert.deepEqual(content.includes("[[repos]]"), true);
    assert.deepEqual(exitCalled, false);
  } finally {
    process.exit = origExit;
    if (origXdg) {
      process.env.XDG_CONFIG_HOME = origXdg;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    await rm(tmpDir, { recursive: true });
  }
});
