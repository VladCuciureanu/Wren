import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { parse as parseToml } from "smol-toml";
import { providerNames } from "./providers/mod.ts";

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
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "wren");
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(home, ".config", "wren");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.toml");
}

export function parseConfig(toml: string): Config {
  const raw = parseToml(toml);

  if (raw.general !== undefined && !isTable(raw.general)) {
    throw new Error("general must be a table ([general])");
  }
  const general = { ...DEFAULT_CONFIG.general, ...raw.general };

  if (typeof general.poll_interval !== "number" || general.poll_interval < 10) {
    throw new Error("general.poll_interval must be a number >= 10");
  }
  if (typeof general.volume !== "number" || general.volume < 0 || general.volume > 100) {
    throw new Error("general.volume must be a number between 0 and 100");
  }
  if (typeof general.theme !== "string" || general.theme.length === 0) {
    throw new Error("general.theme must be a non-empty string");
  }

  const rawRepos = raw.repos ?? [];
  if (!Array.isArray(rawRepos)) {
    throw new Error("repos must be an array of tables ([[repos]])");
  }
  const repos: RepoConfig[] = rawRepos.map((r: unknown, i) => {
    if (!isTable(r)) {
      throw new Error(`repos[${i}] must be a table ([[repos]])`);
    }
    if (typeof r.owner !== "string" || r.owner.length === 0) {
      throw new Error(`repos[${i}].owner must be a non-empty string`);
    }
    if (typeof r.name !== "string" || r.name.length === 0) {
      throw new Error(`repos[${i}].name must be a non-empty string`);
    }
    const provider = r.provider ?? "github";
    if (typeof provider !== "string" || !providerNames().includes(provider)) {
      throw new Error(`repos[${i}].provider must be one of: ${providerNames().join(", ")}`);
    }
    if (r.token !== undefined && (typeof r.token !== "string" || r.token.length === 0)) {
      throw new Error(`repos[${i}].token must be a non-empty string`);
    }
    return { owner: r.owner, name: r.name, provider, token: r.token };
  });

  return { general, repos };
}

/** A TOML table: a plain object, not an array or a date-time. */
function isTable(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

/**
 * Load the config at `path`, or at the default path when none is given. Only
 * a missing default config falls back to the defaults; a missing file that
 * was asked for explicitly is an error.
 */
export async function loadConfig(path?: string): Promise<Config> {
  const configPath = path ?? getConfigPath();
  try {
    const text = await readFile(configPath, "utf8");
    return parseConfig(text);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      if (path !== undefined) throw new Error(`Config file not found: ${path}`);
      return { ...DEFAULT_CONFIG };
    }
    throw e;
  }
}
