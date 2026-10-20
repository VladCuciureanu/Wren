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

/**
 * Receives the failure that takes the engine from healthy to failing. Further
 * failures in the same episode are not repeated; once every layer recovers, the
 * next failure is reported again.
 */
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
  /** Layers whose last ffplay process failed, with the failure. */
  #failures = new Map<keyof Mood, Error>();

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

  /** A current ffplay failure, or undefined while every layer is healthy. */
  get audioError(): Error | undefined {
    return this.#failures.values().next().value;
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
      this.#fail(key, e);
      return;
    }
    // Events from a process that no longer backs its layer (killed or
    // replaced) are ignored.
    const current = () => this.#processes.get(key)?.proc === proc;
    proc.on("spawn", () => {
      if (current()) this.#failures.delete(key);
    });
    // Without a listener, a failed spawn (e.g. ENOENT) is an uncaught
    // exception that kills Node and orphans the other layers.
    proc.on("error", (e) => {
      if (!current()) return;
      this.#processes.delete(key);
      this.#fail(key, e);
    });
    // Layers loop forever, so any exit we didn't cause (bad file, crash) is a failure.
    proc.on("exit", (code, signal) => {
      if (!current()) return;
      this.#processes.delete(key);
      this.#fail(key, new Error(`ffplay stopped playing ${LAYER_FILES[key]} (${signal ?? `exit code ${code}`})`));
    });
    this.#processes.set(key, { proc, volume: effectiveVol });
  }

  #fail(key: keyof Mood, e: unknown): void {
    const error = e instanceof Error ? e : new Error(String(e));
    const wasHealthy = this.#failures.size === 0;
    this.#failures.set(key, error);
    if (!wasHealthy) return;
    try {
      this.#onError(error);
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
    // A layer that is meant to be silent can't be failing.
    this.#failures.delete(key);
  }
}
