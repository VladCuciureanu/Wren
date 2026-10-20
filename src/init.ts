import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { getConfigPath } from "./config.ts";

const DEFAULT_CONFIG_TOML = `# Wren configuration
# See: https://github.com/VladCuciureanu/Wren

[general]
# Polling interval in seconds (minimum 10)
poll_interval = 45

# Master volume (0–100)
volume = 80

# Sound theme ("forest" is the only built-in theme for now)
theme = "forest"

# Add repos to monitor. Each [[repos]] block is one repository.
# Uncomment and edit the examples below:

# [[repos]]
# owner = "your-org"
# name = "your-repo"
# provider = "github"
# token = "ghp_your_token_here"
#
# [[repos]]
# owner = "your-org"
# name = "another-repo"
# provider = "github"
# # Omit token to use GITHUB_TOKEN env var
`;

/**
 * Write the starter config to `path`, or to the default config path when none
 * is given. Throws if a file is already there.
 */
export async function runInit(path?: string): Promise<void> {
  const configPath = path ?? getConfigPath();

  await mkdir(dirname(configPath), { recursive: true });
  try {
    await writeFile(configPath, DEFAULT_CONFIG_TOML, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    throw new Error(`Config already exists at ${configPath}; delete it first to regenerate it`);
  }
  const run = path === undefined ? "wren" : `wren --config ${shellQuote(path)}`;
  console.log(`Config written to ${configPath}`);
  console.log(`Edit it to add your repos, then run \`${run}\` to start.`);
}

/**
 * Quote `arg` for pasting into a shell when it holds anything beyond plain
 * path characters: single quotes on POSIX shells, double quotes on Windows
 * (where a path cannot contain a double quote).
 */
export function shellQuote(arg: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg}"`;
  }
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
}
