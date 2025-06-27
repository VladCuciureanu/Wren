import { assertEquals, assertThrows } from "@std/assert";
import { parseConfig } from "../src/config.ts";

Deno.test("parseConfig: parses valid TOML with all fields", () => {
  const toml = `
[general]
poll_interval = 60
volume = 50
theme = "ocean"

[[repos]]
owner = "acme"
name = "api"
provider = "github"
token = "ghp_abc123"

[[repos]]
owner = "acme"
name = "web"
`;
  const config = parseConfig(toml);
  assertEquals(config.general.poll_interval, 60);
  assertEquals(config.general.volume, 50);
  assertEquals(config.general.theme, "ocean");
  assertEquals(config.repos.length, 2);
  assertEquals(config.repos[0].owner, "acme");
  assertEquals(config.repos[0].name, "api");
  assertEquals(config.repos[0].token, "ghp_abc123");
  assertEquals(config.repos[1].provider, "github");
  assertEquals(config.repos[1].token, undefined);
});

Deno.test("parseConfig: uses defaults when general section is missing", () => {
  const config = parseConfig("");
  assertEquals(config.general.poll_interval, 45);
  assertEquals(config.general.volume, 80);
  assertEquals(config.general.theme, "forest");
  assertEquals(config.repos.length, 0);
});

Deno.test("parseConfig: uses defaults for missing general keys", () => {
  const toml = `
[general]
volume = 30
`;
  const config = parseConfig(toml);
  assertEquals(config.general.poll_interval, 45);
  assertEquals(config.general.volume, 30);
  assertEquals(config.general.theme, "forest");
});

Deno.test("parseConfig: rejects poll_interval < 10", () => {
  const toml = `
[general]
poll_interval = 5
`;
  assertThrows(() => parseConfig(toml), Error, "poll_interval must be a number >= 10");
});

Deno.test("parseConfig: rejects volume out of range", () => {
  assertThrows(
    () =>
      parseConfig(`
[general]
volume = 150
`),
    Error,
    "volume must be a number between 0 and 100",
  );
});

Deno.test("parseConfig: rejects repo missing owner", () => {
  const toml = `
[[repos]]
name = "api"
`;
  assertThrows(() => parseConfig(toml), Error, "repos[0].owner must be a non-empty string");
});

Deno.test("parseConfig: rejects repo missing name", () => {
  const toml = `
[[repos]]
owner = "acme"
`;
  assertThrows(() => parseConfig(toml), Error, "repos[0].name must be a non-empty string");
});
