import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const mainPath = fileURLToPath(new URL("../src/main.ts", import.meta.url));

test("main: an invalid config prints a message and exits 1 without a stack trace", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "wren-main-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const configPath = join(dir, "config.toml");
  writeFileSync(configPath, "[general]\npoll_interval = 1\n");

  const result = spawnSync(process.execPath, [mainPath, "--config", configPath], {
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Error: general\.poll_interval must be a number >= 10$/m);
  assert.doesNotMatch(result.stderr, /^\s+at /m);
  // The cursor is never left hidden.
  const hides = result.stdout.split("\x1b[?25l").length - 1;
  const shows = result.stdout.split("\x1b[?25h").length - 1;
  assert.ok(shows >= hides);
});

test("main: an unknown option is a usage error with exit code 2", () => {
  const result = spawnSync(process.execPath, [mainPath, "--frobnicate"], {
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 2);
  assert.equal(result.stderr, "wren: unknown option '--frobnicate' (see 'wren --help')\n");
  assert.equal(result.stdout, "");
});

test("main: a --config file that does not exist is an error", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "wren-main-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const configPath = join(dir, "missing.toml");

  const result = spawnSync(process.execPath, [mainPath, "--config", configPath], {
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stderr, `Error: Config file not found: ${configPath}\n`);
});

test("main: `wren init --config <path>` writes the config there", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "wren-main-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const configPath = join(dir, "custom.toml");

  const result = spawnSync(process.execPath, [mainPath, "init", "--config", configPath], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, XDG_CONFIG_HOME: join(dir, "xdg") },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(configPath, "utf8"), /^\[general\]$/m);
  assert.equal(existsSync(join(dir, "xdg")), false);
});

test("main: the no-repos message names the config path under XDG_CONFIG_HOME", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "wren-main-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [mainPath], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, XDG_CONFIG_HOME: dir },
  });

  assert.equal(result.status, 1);
  const configPath = join(dir, "wren", "config.toml");
  assert.ok(result.stderr.includes(`then edit ${configPath} to add repos.`), result.stderr);
});
