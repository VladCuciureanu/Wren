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

  const config = await loadConfig(args.config);

  if (config.repos.length === 0) {
    console.error("No repos configured. Run `wren init` to create a config file,");
    console.error(`then edit ${args.config ?? "~/.config/wren/config.toml"} to add repos.`);
    process.exit(1);
  }

  // Build providers (group by provider+token to share instances)
  const providers = buildProviders(config.repos, process.env.GITHUB_TOKEN ?? "", createProvider);

  // Resolve assets dir
  const assetsDir = fileURLToPath(new URL(`../assets/${config.general.theme}`, import.meta.url));

  const initial = resolveVolume(args, config.general.volume);
  const engine = new FfplayEngine(assetsDir, initial.engineVolume);
  const crossfader = new Crossfader(engine);

  let currentStatuses: RepoStatus[] = [];
  let volume = initial.volume;
  let muted = initial.muted;

  const redraw = (mood: Mood) => {
    drawTui({ mood, statuses: currentStatuses, volume, muted });
  };

  const onUpdate = async (statuses: RepoStatus[]) => {
    currentStatuses = statuses;
    const mood = calculateMood(statuses);
    await crossfader.transitionTo(mood);
    redraw(mood);
  };

  const loop = new IngestionLoop(
    config.repos,
    providers,
    config.general.poll_interval * 1000,
    (statuses) => { onUpdate(statuses); },
  );

  // Graceful shutdown
  const cleanup = () => {
    loop.stop();
    crossfader.stop();
    // Restore terminal
    process.stdout.write("\x1b[?25h\n");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Hide cursor
  process.stdout.write("\x1b[?25l");

  // Start polling
  loop.start();

  // Keyboard input
  process.stdin.setRawMode(true);
  input: for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    for (const byte of chunk) {
      const ch = String.fromCharCode(byte);

      if (ch === "q") {
        cleanup();
        break input;
      } else if (ch === "m") {
        muted = !muted;
        engine.setMasterVolume(muted ? 0 : volume);
        if (crossfader.currentMood) redraw(crossfader.currentMood);
      } else if (ch === "+" || ch === "=") {
        volume = Math.min(100, volume + 5);
        muted = false;
        engine.setMasterVolume(volume);
        if (crossfader.currentMood) redraw(crossfader.currentMood);
      } else if (ch === "-") {
        volume = Math.max(0, volume - 5);
        engine.setMasterVolume(volume);
        if (crossfader.currentMood) redraw(crossfader.currentMood);
      }
    }
  }
}

main();
