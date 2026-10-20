import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseCli, resolveVolume, UsageError, VERSION } from "../src/cli.ts";

test("parseCli: defaults", () => {
  const args = parseCli([]);
  assert.deepEqual(args.help, false);
  assert.deepEqual(args.version, false);
  assert.deepEqual(args.mute, false);
  assert.deepEqual(args.volume, undefined);
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

test("parseCli: --volume value", () => {
  assert.deepEqual(parseCli(["--volume", "35"]).volume, 35);
});

test("resolveVolume: uses configured volume when --volume is absent", () => {
  assert.deepEqual(resolveVolume(parseCli([]), 40), { volume: 40, muted: false, engineVolume: 40 });
});

test("resolveVolume: --volume overrides configured volume", () => {
  assert.deepEqual(resolveVolume(parseCli(["--volume", "65"]), 40), {
    volume: 65,
    muted: false,
    engineVolume: 65,
  });
});

test("resolveVolume: --mute starts engine silent but keeps configured volume for unmute", () => {
  assert.deepEqual(resolveVolume(parseCli(["--mute"]), 40), {
    volume: 40,
    muted: true,
    engineVolume: 0,
  });
});

test("parseCli: rejects unknown options", () => {
  assert.throws(() => parseCli(["--frobnicate"]), {
    name: "Error",
    message: "unknown option '--frobnicate'",
  });
  assert.throws(() => parseCli(["-x"]), UsageError);
  assert.throws(() => parseCli(["--mute=yes"]), UsageError);
});

test("parseCli: rejects unknown commands and extra arguments", () => {
  assert.throws(() => parseCli(["start"]), { message: "unknown command 'start'" });
  assert.throws(() => parseCli(["init", "now"]), { message: "unexpected argument 'now'" });
});

test("parseCli: rejects --config without a path", () => {
  assert.throws(() => parseCli(["--config"]), UsageError);
  assert.throws(() => parseCli(["--config", "--mute"]), UsageError);
  assert.throws(() => parseCli(["--config="]), /needs a path/);
});

test("parseCli: rejects a --volume that is not a whole number from 0 to 100", () => {
  for (const value of ["abc", "500", "-1", "", "NaN"]) {
    assert.throws(() => parseCli([`--volume=${value}`]), UsageError, value);
  }
  // Number() accepts all of these, but they are not plain decimal integers.
  for (const value of ["0x10", "1e2", "50.5", " 50", "+50", "Infinity"]) {
    assert.throws(() => parseCli([`--volume=${value}`]), UsageError, value);
  }
  assert.throws(() => parseCli(["--volume", "abc"]), {
    message: "--volume must be a whole number from 0 to 100, got 'abc'",
  });
  assert.equal(parseCli(["--volume", "0"]).volume, 0);
  assert.equal(parseCli(["--volume", "100"]).volume, 100);
  assert.equal(parseCli(["--volume", "050"]).volume, 50);
});

test("parseCli: an option value that looks like an option suggests the = form", () => {
  assert.throws(() => parseCli(["--volume", "-5"]), {
    name: "Error",
    message: "option '--volume' got '-5', which looks like an option; write --volume=-5",
  });
  assert.throws(() => parseCli(["-c", "-x"]), {
    message: "option '-c' got '-x', which looks like an option; write --config=-x",
  });
});

test("parseCli: an option followed by a long option is missing its value", () => {
  assert.throws(() => parseCli(["--volume", "--config", "x"]), {
    message: "option '--volume' needs a value",
  });
  assert.throws(() => parseCli(["-c", "--mute"]), { message: "option '-c' needs a value" });
});

test("parseCli: the --opt=-value form accepts a value starting with a dash", () => {
  assert.equal(parseCli(["--config=-x"]).config, "-x");
  assert.throws(() => parseCli(["--volume=-5"]), {
    message: "--volume must be a whole number from 0 to 100, got '-5'",
  });
});

test("parseCli: parseArgs errors become a single line without trailing periods", () => {
  for (const args of [["--frobnicate"], ["-x"], ["--mute=yes"], ["--config"], ["--volume", "-5"]]) {
    assert.throws(
      () => parseCli(args),
      (e: unknown) =>
        e instanceof UsageError && !e.message.includes("\n") && !/\.$/.test(e.message),
      args.join(" "),
    );
  }
});

test("parseCli: init is a command, not a flag", () => {
  assert.throws(() => parseCli(["--init"]), { message: "unknown option '--init'" });
});

test("VERSION: comes from package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(VERSION, pkg.version);
});
