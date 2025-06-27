import type { PipelineState, Provider } from "./providers/mod.ts";
import type { RepoConfig } from "./config.ts";

export interface RepoStatus {
  owner: string;
  name: string;
  state: PipelineState;
  error?: string;
}

export type StatusCallback = (statuses: RepoStatus[]) => void;

export class IngestionLoop {
  #repos: RepoConfig[];
  #providers: Map<string, Provider>;
  #intervalMs: number;
  #callback: StatusCallback;
  #timer: number | undefined;
  #running = false;

  constructor(
    repos: RepoConfig[],
    providers: Map<string, Provider>,
    intervalMs: number,
    callback: StatusCallback,
  ) {
    this.#repos = repos;
    this.#providers = providers;
    this.#intervalMs = intervalMs;
    this.#callback = callback;
  }

  async pollOnce(): Promise<RepoStatus[]> {
    const results = await Promise.all(
      this.#repos.map(async (repo): Promise<RepoStatus> => {
        const provider = this.#providers.get(repo.provider);
        if (!provider) {
          return { owner: repo.owner, name: repo.name, state: "unknown", error: `No provider: ${repo.provider}` };
        }
        try {
          const state = await provider.poll(repo.owner, repo.name);
          return { owner: repo.owner, name: repo.name, state };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { owner: repo.owner, name: repo.name, state: "unknown", error: msg };
        }
      }),
    );
    return results;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    const tick = async () => {
      const statuses = await this.pollOnce();
      this.#callback(statuses);
      if (this.#running) {
        this.#timer = setTimeout(tick, this.#intervalMs) as unknown as number;
      }
    };
    tick();
  }

  stop(): void {
    this.#running = false;
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }
}
