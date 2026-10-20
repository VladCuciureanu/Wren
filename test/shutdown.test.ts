import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const shutdownUrl = new URL("../src/shutdown.ts", import.meta.url).href;

/** Run a module snippet in a fresh Node process that registers a cleanup via onceOnExit. */
function run(body: string) {
  const script = `
    import { onceOnExit } from ${JSON.stringify(shutdownUrl)};
    const shutdown = onceOnExit(() => process.stdout.write("cleanup;"));
    ${body}
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 10_000,
  });
}

function cleanups(stdout: string): number {
  return stdout.split("cleanup;").length - 1;
}

test("onceOnExit: cleanup runs as a last resort when the process crashes", () => {
  const result = run(`setTimeout(() => { throw new Error("boom"); }, 0);`);
  assert.equal(result.status, 1);
  assert.equal(cleanups(result.stdout), 1);
});

test("onceOnExit: cleanup runs on an unhandled rejection", () => {
  const result = run(`Promise.reject(new Error("boom"));`);
  assert.notEqual(result.status, 0);
  assert.equal(cleanups(result.stdout), 1);
});

test("onceOnExit: the normal shutdown path and the exit handler don't both run cleanup", () => {
  const result = run(`shutdown(); shutdown(); process.exit(0);`);
  assert.equal(result.status, 0);
  assert.equal(cleanups(result.stdout), 1);
});
