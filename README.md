# Wren

Ambient sound from your CI pipeline. Green builds are birdsong, failing tests are distant thunder, a deploy in progress is a low hum. Your office becomes a weather system controlled by your codebase.

```
  wren

  Mood: Breezy
  Volume: 80%

  Pipelines:
    [ok] your-org/api
    [FAIL] your-org/web
    [FAIL] your-org/mobile

  q: quit  m: mute  +/-: volume
```

Wren polls GitHub Actions for each configured repo and plays a mix of looping sound layers through `ffplay`, one process per layer.

## Requirements

- [Node.js](https://nodejs.org/) 26 or newer
- [FFmpeg](https://ffmpeg.org/), for `ffplay` on your `PATH`
- A GitHub token that can read Actions on the repos you watch

## Install

```sh
brew install node ffmpeg           # macOS
sudo apt install ffmpeg            # Debian/Ubuntu (Node.js 26: https://nodejs.org/en/download)

git clone https://github.com/VladCuciureanu/Wren.git
cd Wren
npm install   # also builds dist/ via the prepare script
npm link      # puts `wren` on your PATH
```

Without `npm link`, run `npm start` (or `npm start -- init`) from the repo.

## Usage

```sh
wren init                       # write a starter config (repos commented out)
$EDITOR ~/.config/wren/config.toml
wren
```

```
wren [options]
wren init [-c <path>]

  -c, --config <path>   Config file (default: $XDG_CONFIG_HOME/wren/config.toml or ~/.config/wren/config.toml)
      --volume <0-100>  Starting volume (default: general.volume)
  -m, --mute            Start muted
  -v, --version         Print version
  -h, --help            Print help
```

`wren init` writes to the `--config` path if given, otherwise the default path, and exits 1 if a file is already there. Wren exits 1 if the config is invalid, a `--config` file is missing (a missing default config just means no repos), the config lists no repos, or `ffplay` is missing. An unknown option or command, an option missing its value, or a `--volume` that isn't a whole number from 0 to 100 exits 2.

While running: `q` or Ctrl+C quits, `m` toggles mute, `+` (or `=`) and `-` change the volume in steps of 5 and unmute. Without a terminal on stdin, Wren plays until it receives SIGINT or SIGTERM.

## Config

The config is TOML at `$XDG_CONFIG_HOME/wren/config.toml`, falling back to `~/.config/wren/config.toml`.

```toml
[general]
poll_interval = 45   # seconds, minimum 10
volume = 80          # 0-100
theme = "forest"     # a directory under assets/; "forest" is the only one

[[repos]]
owner = "your-org"
name = "your-repo"
provider = "github"  # optional; "github" is the only provider
token = "ghp_..."    # optional; defaults to the GITHUB_TOKEN env var

[[repos]]
owner = "your-org"
name = "another-repo"
```

| Environment variable | Purpose |
|----------------------|---------|
| `GITHUB_TOKEN` | Token for repos without their own `token`. If it is unset, those repos are polled unauthenticated (60 requests an hour) and Wren shows a warning |
| `XDG_CONFIG_HOME` | Base directory for the config file |

## How it sounds

For each repo, Wren reads the latest 50 workflow runs on the default branch and keeps the newest run of each workflow. The first row below that matches decides the repo's state. A workflow whose name contains "deploy" counts as a deploy.

| State | When | Layers |
|-------|------|--------|
| Deploy failed | a deploy failed | heavy thunder, rain, wind |
| Failing | any other run failed | wind, thunder, rain |
| Error | a run ended with another conclusion, e.g. timed out | heavy thunder and rain |
| Deploying | a deploy is running | low hum, some birdsong |
| Pending | a run is queued, or a non-deploy run is in progress | wind, a little birdsong and hum |
| Deploy succeeded | the newest successful workflow is a deploy | chime, birdsong |
| Passing | the newest successful workflow is not a deploy | birdsong, light wind |
| Unknown | no runs, only cancelled or skipped runs, or the API call failed | faint static |

With several repos, the layer volumes are averaged, so one failing repo darkens the mood without drowning out the passing ones. When the GitHub rate limit runs low, repos keep their last known state until it resets.

## Development

```sh
npm test            # node --test (test/**/*.test.ts)
npm run typecheck   # tsc
npm run lint        # biome lint
npm run format      # biome check --write (format, sort imports, safe fixes)
npm run check       # biome check, typecheck and tests, as CI runs them
npm run build       # compile src/ to dist/ (the `wren` bin)
npm run dev         # run src/main.ts, restarting on changes
```

`scripts/generate-assets.sh` regenerates the forest theme with `ffmpeg`; run it from the repo root.

## License

MIT. See [LICENSE](LICENSE).
