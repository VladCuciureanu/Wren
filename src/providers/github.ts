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

export class GitHubProvider implements Provider {
  #token: string;
  #fetch: typeof fetch;
  #now: () => number;
  #rateLimitRemaining = Infinity;
  #rateLimitReset = 0;
  #defaultBranches = new Map<string, string>();
  #lastStates = new Map<string, PipelineState>();

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
      return this.#lastStates.get(repoPath) ?? "unknown";
    }

    const branch = await this.#defaultBranch(repoPath);
    const resp = await this.#get(
      `${repoPath}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=50`,
    );

    if (!resp.ok) {
      if (resp.status === 403 && this.#rateLimitRemaining === 0) {
        return this.#lastStates.get(repoPath) ?? "unknown";
      }
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json() as WorkflowRunsResponse;
    const state = mapRunsToState(data.workflow_runs);
    this.#lastStates.set(repoPath, state);
    return state;
  }

  async #defaultBranch(repoPath: string): Promise<string> {
    const cached = this.#defaultBranches.get(repoPath);
    if (cached) return cached;

    const resp = await this.#get(repoPath);
    if (!resp.ok) {
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }
    const repo = await resp.json() as RepoResponse;
    this.#defaultBranches.set(repoPath, repo.default_branch);
    return repo.default_branch;
  }

  async #get(path: string): Promise<Response> {
    const resp = await this.#fetch(`https://api.github.com${path}`, {
      headers: {
        "Authorization": `Bearer ${this.#token}`,
        "Accept": "application/vnd.github+json",
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

/** States that win over a green run elsewhere, most severe first. */
const ATTENTION_STATES: PipelineState[] = ["deploy_failed", "failing", "error", "deploying", "pending"];

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
