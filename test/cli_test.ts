import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCli } from "../src/cli.ts";

test("parseCli: defaults", () => {
  const args = parseCli([]);
  assert.deepEqual(args.help, false);
  assert.deepEqual(args.version, false);
  assert.deepEqual(args.mute, false);
  assert.deepEqual(args.volume, 80);
  assert.deepEqual(args.config, undefined);
  assert.deepEqual(args.init, false);
});

test("parseCli: --help flag", () => {
  assert.deepEqual(parseCli(["--help"]).help, true);
  assert.deepEqual(parseCli(["-h"]).help, true);
});

test("parseCli: --version flag", () => {
  assert.deepEqual(parseCli(["--version"]).version, true);
  assert.deepEqual(parseCli(["-v"]).version, true);
});

test("parseCli: --config path", () => {
  assert.deepEqual(parseCli(["--config", "/tmp/wren.toml"]).config, "/tmp/wren.toml");
  assert.deepEqual(parseCli(["-c", "/tmp/wren.toml"]).config, "/tmp/wren.toml");
});

test("parseCli: --mute flag", () => {
  assert.deepEqual(parseCli(["--mute"]).mute, true);
  assert.deepEqual(parseCli(["-m"]).mute, true);
});

test("parseCli: init subcommand", () => {
  assert.deepEqual(parseCli(["init"]).init, true);
});
