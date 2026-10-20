import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { type TestContext, test } from "node:test";
import { runInit } from "../src/init.ts";

/** Point XDG_CONFIG_HOME at a fresh temp dir for the duration of the test. */
async function tempXdg(t: TestContext): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "wren-"));
  const origXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpDir;
  t.after(async () => {
    if (origXdg) {
      process.env.XDG_CONFIG_HOME = origXdg;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    await rm(tmpDir, { recursive: true });
  });
  return tmpDir;
}

test("runInit: creates config file in temp dir", async (t) => {
  const tmpDir = await tempXdg(t);

  await runInit();
  const configPath = `${tmpDir}/wren/config.toml`;
  const content = await readFile(configPath, "utf8");
  assert.deepEqual(content.includes("[general]"), true);
  assert.deepEqual(content.includes("poll_interval = 45"), true);
  assert.deepEqual(content.includes("[[repos]]"), true);
});

test("runInit: throws instead of overwriting an existing config", async (t) => {
  const tmpDir = await tempXdg(t);
  await runInit();
  const configPath = join(tmpDir, "wren", "config.toml");
  await writeFile(configPath, "# mine\n");

  await assert.rejects(runInit(), {
    message: `Config already exists at ${configPath}; delete it first to regenerate it`,
  });
  assert.equal(await readFile(configPath, "utf8"), "# mine\n");
});

test("runInit: writes to an explicit path, creating its directory", async (t) => {
  const tmpDir = await tempXdg(t);
  const configPath = join(tmpDir, "elsewhere", "wren.toml");

  await runInit(configPath);

  assert.match(await readFile(configPath, "utf8"), /^\[general\]$/m);
  await assert.rejects(readFile(join(tmpDir, "wren", "config.toml")), { code: "ENOENT" });
});

test("runInit: the starter config links to the real repository", async (t) => {
  const tmpDir = await tempXdg(t);
  await runInit();
  const content = await readFile(join(tmpDir, "wren", "config.toml"), "utf8");
  assert.match(content, /^# See: https:\/\/github\.com\/VladCuciureanu\/Wren$/m);
  assert.doesNotMatch(content, /your-username/);
});
