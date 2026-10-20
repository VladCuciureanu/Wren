#!/usr/bin/env node

import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseCli, resolveVolume, HELP_TEXT, VERSION } from "./cli.ts";
import { loadConfig } from "./config.ts";
import { createProvider } from "./providers/mod.ts";
import { IngestionLoop, buildProviders } from "./ingestion.ts";
import type { RepoStatus } from "./ingestion.ts";
import { calculateMood } from "./state.ts";
import type { Mood } from "./state.ts";
import { FfplayEngine, checkFfplay } from "./audio/ffplay.ts";
import { Crossfader } from "./audio/crossfade.ts";
import { drawTui } from "./tui.ts";
import { runInit } from "./init.ts";
import { keyAction } from "./keys.ts";

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
    await runInit();
    process.exit(0);
  }

  const config = await loadConfig(args.config);

  if (config.repos.length === 0) {
    console.error("No repos configured. Run `wren init` to create a config file,");
    console.error(`then edit ${args.config ?? "~/.config/wren/config.toml"} to add repos.`);
    process.exit(1);
  }

  // Check ffplay
  if (!await checkFfplay()) {
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
  let currentStatuses: RepoStatus[] = [];
  let volume = initial.volume;
  let muted = initial.muted;
  let notice: string | undefined;

  const redraw = (mood: Mood) => {
    drawTui({ mood, statuses: currentStatuses, volume, muted, notice });
  };

  const engine = new FfplayEngine(assetsDir, initial.engineVolume, undefined, (e) => {
    notice = `Audio error: ${e.message}`;
    if (crossfader.currentMood) redraw(crossfader.currentMood);
  });
  const crossfader = new Crossfader(engine);

  const onUpdate = (statuses: RepoStatus[]) => {
    currentStatuses = statuses;
    const mood = calculateMood(statuses);
    crossfader.transitionTo(mood);
    redraw(mood);
  };

  const loop = new IngestionLoop(
    config.repos,
    providers,
    config.general.poll_interval * 1000,
    onUpdate,
  );

  // Graceful shutdown
  const cleanup = () => {
    loop.stop();
    crossfader.stop();
    restoreTerminal();
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
          muted = !muted;
          engine.setMasterVolume(muted ? 0 : volume);
          if (crossfader.currentMood) redraw(crossfader.currentMood);
        } else if (action === "volume_up") {
          volume = Math.min(100, volume + 5);
          muted = false;
          engine.setMasterVolume(volume);
          if (crossfader.currentMood) redraw(crossfader.currentMood);
        } else if (action === "volume_down") {
          volume = Math.max(0, volume - 5);
          engine.setMasterVolume(volume);
          if (crossfader.currentMood) redraw(crossfader.currentMood);
        }
      }
    }
  } catch (e) {
    // Don't leave the poller or ffplay processes running behind an error.
    loop.stop();
    crossfader.stop();
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
  console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
