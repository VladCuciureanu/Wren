import { parse as parseToml } from "@std/toml";
import { join } from "@std/path";

export interface RepoConfig {
  owner: string;
  name: string;
  provider: string;
  token?: string;
}

export interface Config {
  general: {
    poll_interval: number;
    volume: number;
    theme: string;
  };
  repos: RepoConfig[];
}

const DEFAULT_CONFIG: Config = {
  general: {
    poll_interval: 45,
    volume: 80,
    theme: "forest",
  },
  repos: [],
};

export function getConfigDir(): string {
  const xdg = Deno.env.get("XDG_CONFIG_HOME");
  if (xdg) return join(xdg, "wren");
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return join(home, ".config", "wren");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.toml");
}

export function parseConfig(toml: string): Config {
  const raw = parseToml(toml) as Record<string, unknown>;

  const general = {
    ...DEFAULT_CONFIG.general,
    ...(raw.general as Record<string, unknown> ?? {}),
  };

  if (typeof general.poll_interval !== "number" || general.poll_interval < 10) {
    throw new Error("general.poll_interval must be a number >= 10");
  }
  if (typeof general.volume !== "number" || general.volume < 0 || general.volume > 100) {
    throw new Error("general.volume must be a number between 0 and 100");
  }
  if (typeof general.theme !== "string" || general.theme.length === 0) {
    throw new Error("general.theme must be a non-empty string");
  }

  const rawRepos = (raw.repos ?? []) as Record<string, unknown>[];
  const repos: RepoConfig[] = rawRepos.map((r, i) => {
    if (typeof r.owner !== "string" || r.owner.length === 0) {
      throw new Error(`repos[${i}].owner must be a non-empty string`);
    }
    if (typeof r.name !== "string" || r.name.length === 0) {
      throw new Error(`repos[${i}].name must be a non-empty string`);
    }
    return {
      owner: r.owner as string,
      name: r.name as string,
      provider: (r.provider as string) ?? "github",
      token: r.token as string | undefined,
    };
  });

  return { general, repos };
}

export async function loadConfig(path?: string): Promise<Config> {
  const configPath = path ?? getConfigPath();
  try {
    const text = await Deno.readTextFile(configPath);
    return parseConfig(text);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return { ...DEFAULT_CONFIG };
    }
    throw e;
  }
}
