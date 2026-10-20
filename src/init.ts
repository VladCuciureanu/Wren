import { mkdir, writeFile } from "node:fs/promises";
import { getConfigDir, getConfigPath } from "./config.ts";

const DEFAULT_CONFIG_TOML = `# Wren configuration
# See: https://github.com/your-username/wren

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

/** Write the starter config; throws if a config is already there. */
export async function runInit(): Promise<void> {
  const configPath = getConfigPath();

  await mkdir(getConfigDir(), { recursive: true });
  try {
    await writeFile(configPath, DEFAULT_CONFIG_TOML, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    throw new Error(`Config already exists at ${configPath}; delete it first to regenerate it`);
  }
  console.log(`Config written to ${configPath}`);
  console.log("Edit it to add your repos, then run `wren` to start.");
}
