import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { type TestContext, test } from "node:test";
import { runInit, shellQuote } from "../src/init.ts";

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

test("shellQuote: leaves plain paths alone", () => {
  assert.equal(shellQuote("/home/me/wren.toml", "linux"), "/home/me/wren.toml");
  assert.equal(
    shellQuote(String.raw`C:\Users\me\wren.toml`, "win32"),
    String.raw`C:\Users\me\wren.toml`,
  );
});

test("shellQuote: quotes paths with spaces or shell characters", () => {
  assert.equal(shellQuote("/home/me/my config.toml", "linux"), "'/home/me/my config.toml'");
  assert.equal(shellQuote("/tmp/$HOME's.toml", "darwin"), String.raw`'/tmp/$HOME'\''s.toml'`);
});

test("shellQuote: win32 uses PowerShell single quotes, which are fully literal", () => {
  const win = (arg: string) => shellQuote(arg, "win32");
  assert.equal(win(String.raw`C:\Users\me\wren.toml`), String.raw`C:\Users\me\wren.toml`);
  assert.equal(win(String.raw`C:\My Files\wren.toml`), String.raw`'C:\My Files\wren.toml'`);
  // cmd expands %x%; PowerShell splits on `,` and expands `$` inside double quotes.
  assert.equal(win(String.raw`C:\100%x%\wren.toml`), String.raw`'C:\100%x%\wren.toml'`);
  assert.equal(win(String.raw`C:\a,b\wren.toml`), String.raw`'C:\a,b\wren.toml'`);
  assert.equal(win(String.raw`C:\$HOME\wren.toml`), String.raw`'C:\$HOME\wren.toml'`);
  // An embedded single quote is doubled.
  assert.equal(win(String.raw`C:\it's\wren.toml`), String.raw`'C:\it''s\wren.toml'`);
  // PowerShell also treats the curly quotes U+2018 to U+201B as single quotes.
  for (const q of ["\u2018", "\u2019", "\u201A", "\u201B"]) {
    assert.equal(win(`C:\\it${q}s\\w.toml`), `'C:\\it${q}${q}s\\w.toml'`, q);
  }
});

test("runInit: the run hint quotes a --config path with spaces", async (t) => {
  const tmpDir = await tempXdg(t);
  const configPath = join(tmpDir, "my dir", "wren.toml");
  const lines: string[] = [];
  t.mock.method(console, "log", (line: string) => lines.push(line));

  await runInit(configPath);

  assert.equal(
    lines[1],
    `Edit it to add your repos, then run \`wren --config ${shellQuote(configPath)}\` to start.`,
  );
  assert.match(lines[1] ?? "", /--config '.*my dir.*'`/);
});
