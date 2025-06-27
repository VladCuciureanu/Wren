import type { PipelineState, Provider } from "./types.ts";

interface WorkflowRun {
  status: string;
  conclusion: string | null;
  name: string;
}

interface WorkflowRunsResponse {
  workflow_runs: WorkflowRun[];
}

export class GitHubProvider implements Provider {
  #token: string;
  #rateLimitRemaining = Infinity;
  #rateLimitReset = 0;

  constructor(token: string) {
    this.#token = token;
  }

  async poll(owner: string, name: string): Promise<PipelineState> {
    if (this.#rateLimitRemaining < 50) {
      const waitMs = (this.#rateLimitReset * 1000) - Date.now();
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 60_000)));
      }
    }

    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?per_page=10`;
    const resp = await fetch(url, {
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

    if (!resp.ok) {
      if (resp.status === 403 && this.#rateLimitRemaining === 0) {
        return "unknown";
      }
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }

    const data: WorkflowRunsResponse = await resp.json();
    return mapRunsToState(data.workflow_runs);
  }
}

export function mapRunsToState(runs: WorkflowRun[]): PipelineState {
  if (runs.length === 0) return "unknown";

  const latest = runs[0];

  if (latest.status === "queued" || latest.status === "waiting") {
    return "pending";
  }
  if (latest.status === "in_progress") {
    const name = latest.name.toLowerCase();
    if (name.includes("deploy")) return "deploying";
    return "pending";
  }

  // completed
  switch (latest.conclusion) {
    case "success": {
      const name = latest.name.toLowerCase();
      if (name.includes("deploy")) return "deploy_success";
      return "passing";
    }
    case "failure": {
      const name = latest.name.toLowerCase();
      if (name.includes("deploy")) return "deploy_failed";
      return "failing";
    }
    case "cancelled":
    case "skipped":
      return "unknown";
    default:
      return "error";
  }
}
