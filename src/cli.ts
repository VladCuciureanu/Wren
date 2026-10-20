import { readFileSync } from "node:fs";
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
    throw new UsageError(describeParseError(e, args));
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

  const volume = values.volume === undefined ? undefined : parseVolume(values.volume);

  return {
    config: values.config,
    volume,
    mute: values.mute,
    help: values.help,
    version: values.version,
    init: command === "init",
  };
}

const OPTIONS = {
  config: { type: "string", short: "c" },
  volume: { type: "string" },
  mute: { type: "boolean", short: "m", default: false },
  help: { type: "boolean", short: "h", default: false },
  version: { type: "boolean", short: "v", default: false },
} as const;

function parseOptions(args: string[]) {
  return parseArgs({
    args,
    options: OPTIONS,
    strict: true,
    allowPositionals: true,
  });
}

/** Turn a node:util parseArgs error into a one-line usage message. */
function describeParseError(e: unknown, args: string[]): string {
  if (e instanceof Error && "code" in e && e.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
    // `--volume -5`: a string option whose value starts with a dash. A lax
    // parse accepts it, and its tokens say which option and value were meant.
    const { tokens } = parseArgs({ args, options: OPTIONS, strict: false, tokens: true });
    for (const token of tokens) {
      if (token.kind === "option" && !token.inlineValue && token.value?.startsWith("-")) {
        // `--volume --config x`: the value was most likely left out.
        if (token.value.startsWith("--")) {
          return `option '${token.rawName}' needs a value`;
        }
        return (
          `option '${token.rawName}' got '${token.value}', which looks like an option; ` +
          `write --${token.name}=${token.value}`
        );
      }
    }
  }
  // node:util appends advice to the first sentence; keep just the problem.
  const message = (e instanceof Error ? e.message : String(e))
    .split("\n")[0]
    .split(/\.\s/)[0]
    .trim()
    .replace(/\.+$/, "");
  return message.charAt(0).toLowerCase() + message.slice(1);
}

/** Parse `--volume`: a plain decimal integer from 0 to 100, nothing else. */
function parseVolume(value: string): number {
  const volume = Number(value);
  if (!/^\d+$/.test(value) || volume > 100) {
    throw new UsageError(`--volume must be a whole number from 0 to 100, got '${value}'`);
  }
  return volume;
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

/** The version in package.json, which sits one level above both src/ and dist/. */
export const VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

export const HELP_TEXT = `wren — ambient sound from your CI pipeline

USAGE:
  wren [OPTIONS]
  wren init [-c <path>]

COMMANDS:
  init          Generate a default config file (at --config, if given)

OPTIONS:
  -c, --config <path>   Path to config.toml (default: $XDG_CONFIG_HOME/wren/config.toml,
                        falling back to ~/.config/wren/config.toml)
  --volume <0-100>      Set volume (default: general.volume from config, 80)
  -m, --mute            Start muted
  -v, --version         Print version
  -h, --help            Print this help

KEYBINDINGS (while running):
  q       Quit
  m       Toggle mute
  +/-     Volume up/down (unmutes)
`;
