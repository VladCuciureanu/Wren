import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

test("package.json exposes a `wren` bin backed by a build script", () => {
  assert.equal(pkg.bin?.wren, "./dist/main.js");
  assert.equal(typeof pkg.scripts?.build, "string");
  assert.match(pkg.scripts?.prepare ?? "", /build/);
});

test("the built bin runs: shebang, --help, --version and assets path", { timeout: 120_000 }, () => {
  const build = spawnSync("npm run build", { cwd: rootPath, shell: true, encoding: "utf8" });
  assert.equal(build.status, 0, build.stdout + build.stderr);

  const binUrl = new URL(pkg.bin.wren, root);
  const bin = readFileSync(binUrl, "utf8");
  assert.ok(bin.startsWith("#!/usr/bin/env node\n"), "dist/main.js must start with a shebang");

  const help = spawnSync(process.execPath, [fileURLToPath(binUrl), "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /wren init/);

  const version = spawnSync(process.execPath, [fileURLToPath(binUrl), "--version"], {
    encoding: "utf8",
  });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^wren \d+\.\d+\.\d+/);

  // Assets live outside src; the URL main resolves must reach them from dist too.
  assert.match(bin, /new URL\(`\.\.\/assets\//);
  assert.ok(existsSync(fileURLToPath(new URL("../assets/forest", binUrl))));
});
