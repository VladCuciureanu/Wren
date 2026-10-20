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

test("main: an option value that looks like an option is one usage line with exit code 2", () => {
  const result = spawnSync(process.execPath, [mainPath, "--volume", "-5"], {
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 2);
  assert.equal(
    result.stderr,
    "wren: option '--volume' got '-5', which looks like an option; write --volume=-5 (see 'wren --help')\n",
  );
  assert.equal(result.stdout, "");
});

test("main: an option followed by a long option says it needs a value", () => {
  const result = spawnSync(process.execPath, [mainPath, "--volume", "--config", "x"], {
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 2);
  assert.equal(result.stderr, "wren: option '--volume' needs a value (see 'wren --help')\n");
  assert.equal(result.stdout, "");
});

test("main: --volume=-5 reaches the volume check instead of the ambiguity error", () => {
  const result = spawnSync(process.execPath, [mainPath, "--volume=-5"], {
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 2);
  assert.equal(
    result.stderr,
    "wren: --volume must be a whole number from 0 to 100, got '-5' (see 'wren --help')\n",
  );
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

test("main: a theme with no directory under assets/ is a config error", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "wren-main-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const configPath = join(dir, "config.toml");
  writeFileSync(
    configPath,
    '[general]\ntheme = "forrest"\n\n[[repos]]\nowner = "acme"\nname = "api"\n',
  );

  const result = spawnSync(process.execPath, [mainPath, "--config", configPath], {
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "Error: general.theme must be one of: forest\n");
});
