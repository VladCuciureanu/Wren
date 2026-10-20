import type { PipelineState, Provider } from "./types.ts";

interface WorkflowRun {
  status: string;
  conclusion: string | null;
  name: string;
  /** Groups runs by workflow; falls back to `name` when absent. */
  workflow_id?: number;
}

interface WorkflowRunsResponse {
  workflow_runs: WorkflowRun[];
}

interface RepoResponse {
  default_branch: string;
}

export interface GitHubProviderOptions {
  fetch?: typeof fetch;
  /** Clock in epoch milliseconds. */
  now?: () => number;
}

/** Below this many remaining requests, repos are skipped until the limit resets. */
const RATE_LIMIT_FLOOR = 50;

/** How long to back off from a rate limit that names no reset time (GitHub suggests a minute). */
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;

/** A response GitHub sent because a primary or secondary rate limit was hit. */
class RateLimitedError extends Error {
  /** Epoch milliseconds before which the repo should not be polled again. */
  readonly until: number;

  constructor(until: number) {
    super("GitHub API rate limit exceeded");
    this.until = until;
  }
}

export class GitHubProvider implements Provider {
  #token: string;
  #fetch: typeof fetch;
  #now: () => number;
  #rateLimitRemaining = Infinity;
  #rateLimitReset = 0;
  #defaultBranches = new Map<string, string>();
  #lastStates = new Map<string, PipelineState>();
  /** Repos skipped until the given epoch milliseconds after being rate-limited. */
  #skipUntil = new Map<string, number>();

  constructor(token: string, options: GitHubProviderOptions = {}) {
    this.#token = token;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
  }

  async poll(owner: string, name: string): Promise<PipelineState> {
    const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

    // Close to the rate limit: skip this repo for this tick (keeping its last
    // known state) rather than stalling every repo until the limit resets.
    if (this.#rateLimitRemaining < RATE_LIMIT_FLOOR && this.#rateLimitReset * 1000 > this.#now()) {
      return this.#lastKnown(repoPath);
    }
    if ((this.#skipUntil.get(repoPath) ?? 0) > this.#now()) {
      return this.#lastKnown(repoPath);
    }

    let resp: Response;
    try {
      const branch = await this.#defaultBranch(repoPath);
      resp = await this.#get(
        `${repoPath}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=50`,
      );
      await this.#throwIfRateLimited(resp);
    } catch (e) {
      if (!(e instanceof RateLimitedError)) throw e;
      // A rate limit says nothing about the pipeline: keep the last known
      // state rather than reporting an error, and back off until the reset.
      this.#skipUntil.set(repoPath, e.until);
      return this.#lastKnown(repoPath);
    }
    this.#skipUntil.delete(repoPath);

    if (!resp.ok) {
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as WorkflowRunsResponse;
    const state = mapRunsToState(data.workflow_runs);
    this.#lastStates.set(repoPath, state);
    return state;
  }

  async #defaultBranch(repoPath: string): Promise<string> {
    const cached = this.#defaultBranches.get(repoPath);
    if (cached) return cached;

    const resp = await this.#get(repoPath);
    await this.#throwIfRateLimited(resp);
    if (!resp.ok) {
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }
    const repo = (await resp.json()) as RepoResponse;
    this.#defaultBranches.set(repoPath, repo.default_branch);
    return repo.default_branch;
  }

  #lastKnown(repoPath: string): PipelineState {
    return this.#lastStates.get(repoPath) ?? "unknown";
  }

  /**
   * Throw a RateLimitedError if `resp` is a primary (403 with no requests
   * remaining) or secondary (429, or 403 with retry-after or a "secondary rate
   * limit" message) rate limit response.
   */
  async #throwIfRateLimited(resp: Response): Promise<void> {
    if (resp.status !== 403 && resp.status !== 429) return;

    const retryAfter = resp.headers.get("retry-after");
    let limited =
      resp.status === 429 ||
      retryAfter !== null ||
      resp.headers.get("x-ratelimit-remaining") === "0";
    if (!limited) {
      const body = await resp
        .clone()
        .text()
        .catch(() => "");
      limited = /secondary rate limit/i.test(body);
    }
    if (!limited) return;

    const now = this.#now();
    const retryAt = parseRetryAfter(retryAfter, now);
    const resetSeconds = Number(resp.headers.get("x-ratelimit-reset") ?? NaN);
    let until = now + DEFAULT_RATE_LIMIT_BACKOFF_MS;
    if (retryAt !== null) {
      until = retryAt;
    } else if (Number.isFinite(resetSeconds) && resetSeconds * 1000 > now) {
      until = resetSeconds * 1000;
    }
    throw new RateLimitedError(until);
  }

  async #get(path: string): Promise<Response> {
    const resp = await this.#fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${this.#token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const remaining = resp.headers.get("x-ratelimit-remaining");
    if (remaining) this.#rateLimitRemaining = parseInt(remaining, 10);
    const reset = resp.headers.get("x-ratelimit-reset");
    if (reset) this.#rateLimitReset = parseInt(reset, 10);

    return resp;
  }
}

/**
 * Epoch milliseconds a `retry-after` header asks us to wait until: either
 * delay-seconds or an HTTP-date. Null when absent or unparseable.
 */
function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null || value.trim() === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? now + seconds * 1000 : null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(date, now) : null;
}

/** States that win over a green run elsewhere, most severe first. */
const ATTENTION_STATES: PipelineState[] = [
  "deploy_failed",
  "failing",
  "error",
  "deploying",
  "pending",
];

/**
 * Combine runs (newest first, as the API returns them) into one state: the
 * latest run of each workflow counts, the most severe of those wins, and if
 * everything is green the most recent workflow's state is used.
 */
export function mapRunsToState(runs: WorkflowRun[]): PipelineState {
  const latestPerWorkflow = new Map<number | string, WorkflowRun>();
  for (const run of runs) {
    const key = run.workflow_id ?? run.name;
    if (!latestPerWorkflow.has(key)) latestPerWorkflow.set(key, run);
  }

  const states = [...latestPerWorkflow.values()].map(runToState);
  for (const state of ATTENTION_STATES) {
    if (states.includes(state)) return state;
  }
  return states.find((s) => s !== "unknown") ?? "unknown";
}

function runToState(run: WorkflowRun): PipelineState {
  const isDeploy = run.name.toLowerCase().includes("deploy");

  if (run.status === "queued" || run.status === "waiting") {
    return "pending";
  }
  if (run.status === "in_progress") {
    return isDeploy ? "deploying" : "pending";
  }

  // completed
  switch (run.conclusion) {
    case "success":
      return isDeploy ? "deploy_success" : "passing";
    case "failure":
      return isDeploy ? "deploy_failed" : "failing";
    case "cancelled":
    case "skipped":
      return "unknown";
    default:
      return "error";
  }
}
