import { assertEquals } from "@std/assert";
import { parseCli } from "../src/cli.ts";

Deno.test("parseCli: defaults", () => {
  const args = parseCli([]);
  assertEquals(args.help, false);
  assertEquals(args.version, false);
  assertEquals(args.mute, false);
  assertEquals(args.volume, 80);
  assertEquals(args.config, undefined);
  assertEquals(args.init, false);
});

Deno.test("parseCli: --help flag", () => {
  assertEquals(parseCli(["--help"]).help, true);
  assertEquals(parseCli(["-h"]).help, true);
});

Deno.test("parseCli: --version flag", () => {
  assertEquals(parseCli(["--version"]).version, true);
  assertEquals(parseCli(["-v"]).version, true);
});

Deno.test("parseCli: --config path", () => {
  assertEquals(parseCli(["--config", "/tmp/wren.toml"]).config, "/tmp/wren.toml");
  assertEquals(parseCli(["-c", "/tmp/wren.toml"]).config, "/tmp/wren.toml");
});

Deno.test("parseCli: --mute flag", () => {
  assertEquals(parseCli(["--mute"]).mute, true);
  assertEquals(parseCli(["-m"]).mute, true);
});

Deno.test("parseCli: init subcommand", () => {
  assertEquals(parseCli(["init"]).init, true);
});
