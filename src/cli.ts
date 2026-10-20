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

/** A bad command line: reported as one line on stderr with exit code 2. */
export class UsageError extends Error {}

export function parseCli(args: string[]): CliArgs {
  let parsed: ReturnType<typeof parseOptions>;
  try {
    parsed = parseOptions(args);
  } catch (e) {
    // node:util appends advice to the first sentence; keep just the problem.
    const message = e instanceof Error ? e.message.split(/\.\s|\n/)[0] : String(e);
    throw new UsageError(message.charAt(0).toLowerCase() + message.slice(1));
  }
  const { values, positionals } = parsed;

  const [command, ...extra] = positionals;
  if (command !== undefined && command !== "init") {
    throw new UsageError(`unknown command '${command}'`);
  }
  if (extra.length > 0) {
    throw new UsageError(`unexpected argument '${extra[0]}'`);
  }
  if (values.config === "") {
    throw new UsageError("option '-c, --config <path>' needs a path");
  }

  const volume = values.volume === undefined ? undefined : Number(values.volume);
  if (volume !== undefined && (values.volume?.trim() === "" || !(volume >= 0 && volume <= 100))) {
    throw new UsageError(`--volume must be a number from 0 to 100, got '${values.volume}'`);
  }

  return {
    config: values.config,
    volume,
    mute: values.mute,
    help: values.help,
    version: values.version,
    init: command === "init",
  };
}

function parseOptions(args: string[]) {
  return parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      volume: { type: "string" },
      mute: { type: "boolean", short: "m", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    strict: true,
    allowPositionals: true,
  });
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
