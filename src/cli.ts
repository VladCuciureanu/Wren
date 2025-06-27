import { parseArgs } from "@std/cli/parse-args";

export interface CliArgs {
  config?: string;
  volume: number;
  mute: boolean;
  help: boolean;
  version: boolean;
  init: boolean;
}

export function parseCli(args: string[]): CliArgs {
  const parsed = parseArgs(args, {
    string: ["config"],
    boolean: ["help", "version", "mute", "init"],
    default: {
      mute: false,
      help: false,
      version: false,
      init: false,
    },
    alias: {
      c: "config",
      v: "version",
      h: "help",
      m: "mute",
    },
  });

  const volume = parsed.volume !== undefined ? Number(parsed.volume) : 80;

  return {
    config: parsed.config,
    volume,
    mute: parsed.mute as boolean,
    help: parsed.help as boolean,
    version: parsed.version as boolean,
    init: parsed._ && parsed._[0] === "init" ? true : parsed.init as boolean,
  };
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
  --volume <0-100>      Set volume (default: 80)
  -m, --mute            Start muted
  -v, --version         Print version
  -h, --help            Print this help

KEYBINDINGS (while running):
  q       Quit
  m       Toggle mute
  +/-     Volume up/down
`;
