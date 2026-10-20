import type { RepoConfig } from "./config.ts";
import type { PipelineState, Provider } from "./providers/mod.ts";

export interface RepoStatus {
  owner: string;
  name: string;
  state: PipelineState;
  error?: string;
}

export type StatusCallback = (statuses: RepoStatus[]) => void;

/** Receives errors thrown while handling a tick, so one bad update can't stop polling. */
export type TickErrorHandler = (error: Error) => void;

const defaultTickErrorHandler: TickErrorHandler = (e) => {
  console.error(`Update failed: ${e.message}`);
};

/**
 * Key identifying which provider instance serves a repo. Repos without an
 * explicit token share the provider-wide default instance (keyed by provider
 * name); repos with their own token get an instance per distinct token.
 */
export function providerKey(repo: RepoConfig): string {
  return repo.token === undefined ? repo.provider : `${repo.provider}#${repo.token}`;
}

/** Build one provider per distinct provider+credentials pair. */
export function buildProviders(
  repos: RepoConfig[],
  defaultToken: string,
  create: (name: string, token: string) => Provider,
): Map<string, Provider> {
  const providers = new Map<string, Provider>();
  for (const repo of repos) {
    const key = providerKey(repo);
    if (!providers.has(key)) {
      providers.set(key, create(repo.provider, repo.token ?? defaultToken));
    }
  }
  return providers;
}

export class IngestionLoop {
  #repos: RepoConfig[];
  #providers: Map<string, Provider>;
  #intervalMs: number;
  #callback: StatusCallback;
  #onError: TickErrorHandler;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running = false;

  constructor(
    repos: RepoConfig[],
    providers: Map<string, Provider>,
    intervalMs: number,
    callback: StatusCallback,
    onError: TickErrorHandler = defaultTickErrorHandler,
  ) {
    this.#repos = repos;
    this.#providers = providers;
    this.#intervalMs = intervalMs;
    this.#callback = callback;
    this.#onError = onError;
  }

  async pollOnce(): Promise<RepoStatus[]> {
    const results = await Promise.all(
      this.#repos.map(async (repo): Promise<RepoStatus> => {
        try {
          // buildProviders creates an instance for every configured repo, and
          // parseConfig rejects unknown providers.
          const provider = this.#providers.get(providerKey(repo)) as Provider;
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
      try {
        const statuses = await this.pollOnce();
        if (this.#running) this.#callback(statuses);
      } catch (e) {
        try {
          this.#onError(e instanceof Error ? e : new Error(String(e)));
        } catch {
          // Nothing left to report to; keep polling regardless.
        }
      }
      if (this.#running) {
        this.#timer = setTimeout(tick, this.#intervalMs);
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
