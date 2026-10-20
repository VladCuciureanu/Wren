#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createUpdateHandler, currentNotice, type ViewState } from "./app.ts";
import { Crossfader } from "./audio/crossfade.ts";
import { checkFfplay, FfplayEngine } from "./audio/ffplay.ts";
import { HELP_TEXT, parseCli, resolveVolume, UsageError, VERSION } from "./cli.ts";
import { getConfigPath, loadConfig } from "./config.ts";
import { buildProviders, IngestionLoop } from "./ingestion.ts";
import { runInit } from "./init.ts";
import { keyAction } from "./keys.ts";
import { createProvider } from "./providers/mod.ts";
import { onceOnExit } from "./shutdown.ts";
import type { Mood } from "./state.ts";
import { drawTui } from "./tui.ts";

async function main() {
  const args = parseCli(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  if (args.version) {
    console.log(`wren ${VERSION}`);
    process.exit(0);
  }
  if (args.init) {
    await runInit(args.config);
    return;
  }

  const config = await loadConfig(args.config);

  if (config.repos.length === 0) {
    console.error("No repos configured. Run `wren init` to create a config file,");
    console.error(`then edit ${args.config ?? getConfigPath()} to add repos.`);
    process.exit(1);
  }

  // Each theme is a directory of layer files under assets/; catch a typo here
  // rather than as every ffplay layer failing.
  const assetsRoot = fileURLToPath(new URL("../assets/", import.meta.url));
  const themes = (await readdir(assetsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (!themes.includes(config.general.theme)) {
    throw new Error(`general.theme must be one of: ${themes.join(", ")}`);
  }

  // Check ffplay
  if (!(await checkFfplay())) {
    console.error("Error: ffplay not found on PATH.");
    console.error("");
    console.error("Install FFmpeg:");
    if (process.platform === "darwin") {
      console.error("  brew install ffmpeg");
    } else if (process.platform === "linux") {
      console.error("  sudo apt install ffmpeg   # Debian/Ubuntu");
      console.error("  sudo dnf install ffmpeg   # Fedora");
    } else {
      console.error("  https://ffmpeg.org/download.html");
    }
    process.exit(1);
  }

  // Build providers (group by provider+token to share instances)
  const providers = buildProviders(config.repos, process.env.GITHUB_TOKEN ?? "", createProvider);

  // Resolve assets dir
  const assetsDir = fileURLToPath(new URL(`../assets/${config.general.theme}`, import.meta.url));

  const initial = resolveVolume(args, config.general.volume);
  const view: ViewState = { statuses: [], volume: initial.volume, muted: initial.muted };

  const redraw = (mood: Mood) => {
    drawTui({ mood, ...view, notice: currentNotice(view, engine) });
  };

  // The notice is read from the engine on each redraw; this only makes a new
  // failure show up right away instead of on the next update.
  const engine: FfplayEngine = new FfplayEngine(assetsDir, initial.engineVolume, undefined, () => {
    if (crossfader.currentMood) redraw(crossfader.currentMood);
  });
  const crossfader = new Crossfader(engine);

  const onUpdate = createUpdateHandler(view, crossfader, redraw);

  const loop = new IngestionLoop(
    config.repos,
    providers,
    config.general.poll_interval * 1000,
    onUpdate,
    (e) => {
      // Keep polling: the next tick may well succeed.
      view.updateError = `Update failed: ${e.message}`;
    },
  );

  // Stop polling, kill every ffplay layer and restore the terminal. Runs once:
  // from the graceful paths below or, as a last resort, on any other exit
  // (e.g. an uncaught exception), so ffplay is never orphaned.
  const shutdown = onceOnExit(() => {
    loop.stop();
    crossfader.stop();
    restoreTerminal();
  });

  // Graceful shutdown
  const cleanup = () => {
    shutdown();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    hideCursor();

    // Start polling
    loop.start();

    // Keyboard input needs a terminal; without one (piped stdin) keep playing
    // until SIGINT/SIGTERM.
    if (!process.stdin.isTTY) return;

    process.stdin.setRawMode(true);
    input: for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
      for (const byte of chunk) {
        const action = keyAction(byte);

        if (action === "quit") {
          cleanup();
          break input;
        } else if (action === "mute") {
          view.muted = !view.muted;
          engine.setMasterVolume(view.muted ? 0 : view.volume);
          if (crossfader.currentMood) redraw(crossfader.currentMood);
        } else if (action === "volume_up") {
          view.volume = Math.min(100, view.volume + 5);
          view.muted = false;
          engine.setMasterVolume(view.volume);
          if (crossfader.currentMood) redraw(crossfader.currentMood);
        } else if (action === "volume_down") {
          view.volume = Math.max(0, view.volume - 5);
          engine.setMasterVolume(view.volume);
          if (crossfader.currentMood) redraw(crossfader.currentMood);
        }
      }
    }
  } catch (e) {
    // Don't leave the poller or ffplay processes running behind an error.
    shutdown();
    throw e;
  }
}

let cursorHidden = false;

function hideCursor(): void {
  process.stdout.write("\x1b[?25l");
  cursorHidden = true;
}

/** Undo raw mode and the hidden cursor, if they were applied. */
function restoreTerminal(): void {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  if (cursorHidden) {
    process.stdout.write("\x1b[?25h\n");
    cursorHidden = false;
  }
}

main().catch((e: unknown) => {
  restoreTerminal();
  if (e instanceof UsageError) {
    console.error(`wren: ${e.message} (see 'wren --help')`);
    process.exitCode = 2;
    return;
  }
  console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
