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

export async function runInit(): Promise<void> {
  const configPath = getConfigPath();

  // Check if config already exists
  try {
    await Deno.stat(configPath);
    console.error(`Config already exists at ${configPath}`);
    console.error("Delete it first if you want to regenerate.");
    Deno.exit(1);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  // Create directory
  await Deno.mkdir(getConfigDir(), { recursive: true });

  // Write config
  await Deno.writeTextFile(configPath, DEFAULT_CONFIG_TOML);
  console.log(`Config written to ${configPath}`);
  console.log("Edit it to add your repos, then run `wren` to start.");
}
