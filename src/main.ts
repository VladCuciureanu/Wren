#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env --allow-run

import { parseCli, HELP_TEXT, VERSION } from "./cli.ts";
import { loadConfig } from "./config.ts";
import { createProvider } from "./providers/mod.ts";
import type { Provider } from "./providers/mod.ts";
import { IngestionLoop } from "./ingestion.ts";
import type { RepoStatus } from "./ingestion.ts";
import { calculateMood } from "./state.ts";
import type { Mood } from "./state.ts";
import { FfplayEngine, checkFfplay } from "./audio/ffplay.ts";
import { Crossfader } from "./audio/crossfade.ts";
import { drawTui } from "./tui.ts";
import { runInit } from "./init.ts";

async function main() {
  const args = parseCli(Deno.args);

  if (args.help) {
    console.log(HELP_TEXT);
    Deno.exit(0);
  }
  if (args.version) {
    console.log(`wren ${VERSION}`);
    Deno.exit(0);
  }
  if (args.init) {
    await runInit();
    Deno.exit(0);
  }

  // Check ffplay
  if (!await checkFfplay()) {
    console.error("Error: ffplay not found on PATH.");
    console.error("");
    console.error("Install FFmpeg:");
    if (Deno.build.os === "darwin") {
      console.error("  brew install ffmpeg");
    } else if (Deno.build.os === "linux") {
      console.error("  sudo apt install ffmpeg   # Debian/Ubuntu");
      console.error("  sudo dnf install ffmpeg   # Fedora");
    } else {
      console.error("  https://ffmpeg.org/download.html");
    }
    Deno.exit(1);
  }

  const config = await loadConfig(args.config);

  if (config.repos.length === 0) {
    console.error("No repos configured. Run `wren init` to create a config file,");
    console.error(`then edit ${args.config ?? "~/.config/wren/config.toml"} to add repos.`);
    Deno.exit(1);
  }

  // Build providers (group by provider+token to share instances)
  const providers = new Map<string, Provider>();
  for (const repo of config.repos) {
    const key = repo.provider;
    if (!providers.has(key)) {
      const token = repo.token ?? Deno.env.get("GITHUB_TOKEN") ?? "";
      providers.set(key, createProvider(repo.provider, token));
    }
  }

  // Resolve assets dir
  const assetsDir = new URL(`../assets/${config.general.theme}`, import.meta.url).pathname;

  const engine = new FfplayEngine(assetsDir, args.mute ? 0 : args.volume);
  const crossfader = new Crossfader(engine);

  let currentStatuses: RepoStatus[] = [];
  let volume = args.mute ? 0 : args.volume;
  let muted = args.mute;

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
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h\n"));
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", cleanup);
  Deno.addSignalListener("SIGTERM", cleanup);

  // Hide cursor
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));

  // Start polling
  loop.start();

  // Keyboard input
  Deno.stdin.setRaw(true);
  const buf = new Uint8Array(1);
  while (true) {
    const n = await Deno.stdin.read(buf);
    if (n === null) break;
    const ch = String.fromCharCode(buf[0]);

    if (ch === "q") {
      cleanup();
      break;
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

main();
