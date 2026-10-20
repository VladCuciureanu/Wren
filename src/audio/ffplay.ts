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

  constructor(assetsDir: string, masterVolume = 80, spawnFn: SpawnFn = spawn) {
    this.#assetsDir = assetsDir;
    this.#masterVolume = masterVolume;
    this.#spawn = spawnFn;
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

    const proc = this.#spawn(
      "ffplay",
      ["-nodisp", "-loop", "0", "-volume", String(effectiveVol), "-loglevel", "quiet", file],
      { stdio: ["inherit", "ignore", "ignore"] },
    );
    this.#processes.set(key, { proc, volume: effectiveVol });
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
