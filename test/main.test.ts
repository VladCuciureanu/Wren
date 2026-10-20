import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
