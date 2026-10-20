export { GitHubProvider } from "./github.ts";
export type { PipelineState, Provider } from "./types.ts";

import { GitHubProvider } from "./github.ts";
import type { Provider } from "./types.ts";

const factories: Record<string, (token: string) => Provider> = {
  github: (token) => new GitHubProvider(token),
};

/** Names accepted as a repo's `provider`. */
export function providerNames(): string[] {
  return Object.keys(factories);
}

export function createProvider(name: string, token: string): Provider {
  const factory = factories[name];
  if (!factory) {
    throw new Error(`Unknown provider: "${name}". Available: ${providerNames().join(", ")}`);
  }
  return factory(token);
}
