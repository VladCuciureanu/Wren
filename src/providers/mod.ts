export type { PipelineState, Provider } from "./types.ts";
export { GitHubProvider } from "./github.ts";

import type { Provider } from "./types.ts";
import { GitHubProvider } from "./github.ts";

const factories: Record<string, (token: string) => Provider> = {
  github: (token) => new GitHubProvider(token),
};

export function createProvider(name: string, token: string): Provider {
  const factory = factories[name];
  if (!factory) {
    throw new Error(`Unknown provider: "${name}". Available: ${Object.keys(factories).join(", ")}`);
  }
  return factory(token);
}
