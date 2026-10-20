import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { loadConfig, parseConfig } from "../src/config.ts";

test("parseConfig: parses valid TOML with all fields", () => {
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
  assert.deepEqual(config.general.poll_interval, 60);
  assert.deepEqual(config.general.volume, 50);
  assert.deepEqual(config.general.theme, "ocean");
  assert.deepEqual(config.repos.length, 2);
  assert.deepEqual(config.repos[0].owner, "acme");
  assert.deepEqual(config.repos[0].name, "api");
  assert.deepEqual(config.repos[0].token, "ghp_abc123");
  assert.deepEqual(config.repos[1].provider, "github");
  assert.deepEqual(config.repos[1].token, undefined);
});

test("parseConfig: uses defaults when general section is missing", () => {
  const config = parseConfig("");
  assert.deepEqual(config.general.poll_interval, 45);
  assert.deepEqual(config.general.volume, 80);
  assert.deepEqual(config.general.theme, "forest");
  assert.deepEqual(config.repos.length, 0);
});

test("parseConfig: uses defaults for missing general keys", () => {
  const toml = `
[general]
volume = 30
`;
  const config = parseConfig(toml);
  assert.deepEqual(config.general.poll_interval, 45);
  assert.deepEqual(config.general.volume, 30);
  assert.deepEqual(config.general.theme, "forest");
});

test("parseConfig: rejects poll_interval < 10", () => {
  const toml = `
[general]
poll_interval = 5
`;
  assert.throws(() => parseConfig(toml), /poll_interval must be a number >= 10/);
});

test("parseConfig: rejects volume out of range", () => {
  assert.throws(
    () =>
      parseConfig(`
[general]
volume = 150
`),
    /volume must be a number between 0 and 100/,
  );
});

test("parseConfig: rejects repo missing owner", () => {
  const toml = `
[[repos]]
name = "api"
`;
  assert.throws(() => parseConfig(toml), /repos\[0\]\.owner must be a non-empty string/);
});

test("parseConfig: rejects repo missing name", () => {
  const toml = `
[[repos]]
owner = "acme"
`;
  assert.throws(() => parseConfig(toml), /repos\[0\]\.name must be a non-empty string/);
});

test("parseConfig: rejects an unknown repo provider", () => {
  const toml = `
[[repos]]
owner = "acme"
name = "api"
provider = "gitlab"
`;
  assert.throws(() => parseConfig(toml), /repos\[0\]\.provider must be one of: github/);
});

test("parseConfig: rejects a non-string repo provider", () => {
  const toml = `
[[repos]]
owner = "acme"
name = "api"
provider = 3
`;
  assert.throws(() => parseConfig(toml), /repos\[0\]\.provider must be one of: github/);
});

test("loadConfig: a missing default config falls back to the defaults", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "wren-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const origXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  t.after(() => {
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = origXdg;
  });

  const config = await loadConfig();
  assert.deepEqual(config.repos, []);
  assert.equal(config.general.theme, "forest");
});

test("loadConfig: a missing explicit config is an error", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "wren-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "nope.toml");
  await assert.rejects(loadConfig(path), { message: `Config file not found: ${path}` });
});
