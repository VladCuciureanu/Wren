import process from "node:process";

/**
 * Register `cleanup` to run at most once: either when the returned function
 * is called (the normal shutdown path) or, as a last resort, when the process
 * exits for any other reason, such as an uncaught exception.
 *
 * `cleanup` must be synchronous: nothing asynchronous runs after 'exit'.
 */
export function onceOnExit(cleanup: () => void): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    process.off("exit", run);
    cleanup();
  };
  process.on("exit", run);
  return run;
}
