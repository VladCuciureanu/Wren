import { type ChildProcess, type SpawnOptions, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { MOOD_KEYS, type Mood } from "../state.ts";

const LAYER_FILES: Record<keyof Mood, string> = {
  birdsong: "birdsong.ogg",
  wind: "wind.ogg",
  thunder: "thunder.ogg",
  rain: "rain.ogg",
  hum: "hum.ogg",
  chime: "chime.ogg",
  static_: "static.ogg",
};

export interface AudioEngine {
  start(mood: Mood): void;
  update(mood: Mood): void;
  setMasterVolume(vol: number): void;
  stop(): void;
}

/** Subset of `child_process.spawn` the engine uses; injectable for tests. */
export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

/** Receives the first ffplay failure an engine sees (later ones are not repeated). */
export type AudioErrorHandler = (error: Error) => void;

const defaultErrorHandler: AudioErrorHandler = (e) => {
  console.error(`Audio error: ${e.message}`);
};

export async function checkFfplay(command = "ffplay"): Promise<boolean> {
  try {
    await promisify(execFile)(command, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export class FfplayEngine implements AudioEngine {
  #processes = new Map<keyof Mood, { proc: ChildProcess; volume: number }>();
  #assetsDir: string;
  #masterVolume: number;
  #currentMood: Mood | null = null;
  #spawn: SpawnFn;
  #onError: AudioErrorHandler;
  #errorReported = false;

  constructor(
    assetsDir: string,
    masterVolume = 80,
    spawnFn: SpawnFn = spawn,
    onError: AudioErrorHandler = defaultErrorHandler,
  ) {
    this.#assetsDir = assetsDir;
    this.#masterVolume = masterVolume;
    this.#spawn = spawnFn;
    this.#onError = onError;
  }

  start(mood: Mood): void {
    this.#currentMood = mood;
    for (const key of MOOD_KEYS) {
      const vol = mood[key];
      if (vol > 0) {
        this.#spawnLayer(key, vol);
      }
    }
  }

  update(mood: Mood): void {
    this.#currentMood = mood;
    for (const key of MOOD_KEYS) {
      const vol = mood[key];
      const existing = this.#processes.get(key);

      if (vol <= 0) {
        this.#killLayer(key);
      } else if (!existing) {
        this.#spawnLayer(key, vol);
      } else if (existing.volume !== this.#effectiveVolume(vol)) {
        // ffplay can't change volume at runtime, so only layers whose volume
        // changed are restarted; the rest keep looping undisturbed.
        this.#killLayer(key);
        this.#spawnLayer(key, vol);
      }
    }
  }

  setMasterVolume(vol: number): void {
    this.#masterVolume = Math.max(0, Math.min(100, vol));
    if (this.#currentMood) {
      this.update(this.#currentMood);
    }
  }

  stop(): void {
    for (const key of MOOD_KEYS) {
      this.#killLayer(key);
    }
  }

  #spawnLayer(key: keyof Mood, layerVolume: number): void {
    const file = `${this.#assetsDir}/${LAYER_FILES[key]}`;
    const effectiveVol = this.#effectiveVolume(layerVolume);

    let proc: ChildProcess;
    try {
      proc = this.#spawn(
        "ffplay",
        ["-nodisp", "-loop", "0", "-volume", String(effectiveVol), "-loglevel", "quiet", file],
        { stdio: ["inherit", "ignore", "ignore"] },
      );
    } catch (e) {
      this.#reportError(e);
      return;
    }
    // Without a listener, a failed spawn (e.g. ENOENT) is an uncaught
    // exception that kills Node and orphans the other layers.
    proc.on("error", (e) => {
      // Only drop the layer if this process still backs it; a restarted
      // layer has already replaced it.
      if (this.#processes.get(key)?.proc === proc) this.#processes.delete(key);
      this.#reportError(e);
    });
    this.#processes.set(key, { proc, volume: effectiveVol });
  }

  #reportError(e: unknown): void {
    if (this.#errorReported) return;
    this.#errorReported = true;
    try {
      this.#onError(e instanceof Error ? e : new Error(String(e)));
    } catch {
      // A failing reporter must not take the audio engine down with it.
    }
  }

  #effectiveVolume(layerVolume: number): number {
    return Math.round(layerVolume * this.#masterVolume);
  }

  #killLayer(key: keyof Mood): void {
    const layer = this.#processes.get(key);
    if (layer) {
      try {
        layer.proc.kill("SIGTERM");
      } catch {
        // already exited
      }
      this.#processes.delete(key);
    }
  }
}
