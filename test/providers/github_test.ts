import { assertEquals } from "@std/assert";
import { mapRunsToState } from "../../src/providers/github.ts";

Deno.test("mapRunsToState: empty runs returns unknown", () => {
  assertEquals(mapRunsToState([]), "unknown");
});

Deno.test("mapRunsToState: successful build returns passing", () => {
  assertEquals(
    mapRunsToState([{ status: "completed", conclusion: "success", name: "CI" }]),
    "passing",
  );
});

Deno.test("mapRunsToState: failed build returns failing", () => {
  assertEquals(
    mapRunsToState([{ status: "completed", conclusion: "failure", name: "CI" }]),
    "failing",
  );
});

Deno.test("mapRunsToState: in_progress returns pending", () => {
  assertEquals(
    mapRunsToState([{ status: "in_progress", conclusion: null, name: "Build" }]),
    "pending",
  );
});

Deno.test("mapRunsToState: in_progress deploy returns deploying", () => {
  assertEquals(
    mapRunsToState([{ status: "in_progress", conclusion: null, name: "Deploy to prod" }]),
    "deploying",
  );
});

Deno.test("mapRunsToState: successful deploy returns deploy_success", () => {
  assertEquals(
    mapRunsToState([{ status: "completed", conclusion: "success", name: "Deploy" }]),
    "deploy_success",
  );
});

Deno.test("mapRunsToState: failed deploy returns deploy_failed", () => {
  assertEquals(
    mapRunsToState([{ status: "completed", conclusion: "failure", name: "Deploy staging" }]),
    "deploy_failed",
  );
});

Deno.test("mapRunsToState: queued returns pending", () => {
  assertEquals(
    mapRunsToState([{ status: "queued", conclusion: null, name: "CI" }]),
    "pending",
  );
});

Deno.test("mapRunsToState: cancelled returns unknown", () => {
  assertEquals(
    mapRunsToState([{ status: "completed", conclusion: "cancelled", name: "CI" }]),
    "unknown",
  );
});

Deno.test("mapRunsToState: unexpected conclusion returns error", () => {
  assertEquals(
    mapRunsToState([{ status: "completed", conclusion: "timed_out", name: "CI" }]),
    "error",
  );
});
