# Wren

Ambient sound from your CI pipeline. Green builds = birdsong. Failing tests = distant thunder. Deployment in progress = low hum. Your office becomes a weather system controlled by your codebase.

## Requirements

- [Node.js](https://nodejs.org/) 24 LTS or newer
- [FFmpeg](https://ffmpeg.org/) (provides `ffplay`)

## Install

```sh
# macOS
brew install node ffmpeg

# Linux
# Install Node.js 24+: https://nodejs.org/en/download
sudo apt install ffmpeg   # Debian/Ubuntu

# Then, in the repo
npm install
```

## Quick Start

```sh
# Generate a config file
npm start -- init

# Edit the config to add your repos
# (uses your default editor, or open manually)
$EDITOR ~/.config/wren/config.toml

# Run
npm start
```

## Config

Config lives at `~/.config/wren/config.toml` (respects `XDG_CONFIG_HOME`).

```toml
[general]
poll_interval = 45   # seconds (minimum 10)
volume = 80          # 0–100
theme = "forest"     # sound theme

[[repos]]
owner = "your-org"
name = "your-repo"
provider = "github"
token = "ghp_..."    # or omit to use GITHUB_TOKEN env var

[[repos]]
owner = "your-org"
name = "another-repo"
provider = "github"
```

## Sound Mapping (Forest Theme)

| Pipeline State       | Sound                          |
|----------------------|--------------------------------|
| All passing          | Birdsong, gentle breeze        |
| Tests failing        | Distant thunder, wind          |
| Build error          | Rain, close thunder            |
| Deploying            | Low hum, rustling              |
| Deploy succeeded     | Melodic chime → birdsong       |
| Deploy failed        | Thunder crack → steady rain    |
| Queued / pending     | Soft wind, ambient drone       |
| Disconnected         | Faint static                   |

Multiple repos blend linearly — one failing repo darkens the mood without fully overriding passing ones.

## Keybindings

| Key   | Action       |
|-------|--------------|
| `q`   | Quit         |
| `m`   | Toggle mute  |
| `+`   | Volume up    |
| `-`   | Volume down  |

## CLI Options

```
wren [OPTIONS]
wren init

Options:
  -c, --config <path>   Path to config.toml
  --volume <0-100>      Override volume
  -m, --mute            Start muted
  -v, --version         Print version
  -h, --help            Print help
```

## Development

```sh
# Run tests
npm test

# Type check
npm run typecheck

# Format
npm run format

# Lint
npm run lint
```