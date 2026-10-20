import { parseArgs } from "node:util";

export interface CliArgs {
  config?: string;
  /** Undefined when `--volume` was not given; fall back to the config. */
  volume?: number;
  mute: boolean;
  help: boolean;
  version: boolean;
  init: boolean;
}

export function parseCli(args: string[]): CliArgs {
  // strict: false mirrors @std/cli's lenient handling of unknown flags.
  const { values, positionals } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      volume: { type: "string" },
      mute: { type: "boolean", short: "m", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
      init: { type: "boolean", default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  const volume = values.volume !== undefined ? Number(values.volume) : undefined;
  // A value-less `--config` yielded "" under @std/cli; node:util yields `true`.
  const config = values.config === true ? "" : (values.config as string | undefined);

  return {
    config,
    volume,
    mute: values.mute as boolean,
    help: values.help as boolean,
    version: values.version as boolean,
    init: positionals[0] === "init" ? true : (values.init as boolean),
  };
}

export interface InitialVolume {
  /** Master volume to restore when unmuted. */
  volume: number;
  muted: boolean;
  /** Volume the audio engine should start at. */
  engineVolume: number;
}

/** Resolve the startup volume: `--volume` overrides `general.volume`. */
export function resolveVolume(
  args: Pick<CliArgs, "volume" | "mute">,
  configVolume: number,
): InitialVolume {
  const volume = args.volume ?? configVolume;
  return { volume, muted: args.mute, engineVolume: args.mute ? 0 : volume };
}

export const VERSION = "0.1.0";

export const HELP_TEXT = `wren — ambient sound from your CI pipeline

USAGE:
  wren [OPTIONS]
  wren init

COMMANDS:
  init          Generate a default config file

OPTIONS:
  -c, --config <path>   Path to config.toml (default: ~/.config/wren/config.toml)
  --volume <0-100>      Set volume (default: general.volume from config, 80)
  -m, --mute            Start muted
  -v, --version         Print version
  -h, --help            Print this help

KEYBINDINGS (while running):
  q       Quit
  m       Toggle mute
  +/-     Volume up/down
`;
