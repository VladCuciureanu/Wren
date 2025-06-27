import type { Mood } from "../state.ts";

const MOOD_KEYS: (keyof Mood)[] = ["birdsong", "wind", "thunder", "rain", "hum", "chime", "static_"];

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

export async function checkFfplay(): Promise<boolean> {
  try {
    const cmd = new Deno.Command("ffplay", { args: ["-version"], stdout: "null", stderr: "null" });
    const { success } = await cmd.output();
    return success;
  } catch {
    return false;
  }
}

export class FfplayEngine implements AudioEngine {
  #processes = new Map<keyof Mood, Deno.ChildProcess>();
  #assetsDir: string;
  #masterVolume: number;
  #currentMood: Mood | null = null;

  constructor(assetsDir: string, masterVolume = 80) {
    this.#assetsDir = assetsDir;
    this.#masterVolume = masterVolume;
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
      const existing = this.#processes.has(key);

      if (vol <= 0 && existing) {
        this.#killLayer(key);
      } else if (vol > 0 && !existing) {
        this.#spawnLayer(key, vol);
      } else if (vol > 0 && existing) {
        // ffplay doesn't support runtime volume changes — respawn
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
    const effectiveVol = Math.round(layerVolume * this.#masterVolume);

    const cmd = new Deno.Command("ffplay", {
      args: ["-nodisp", "-loop", "0", "-volume", String(effectiveVol), "-loglevel", "quiet", file],
      stdout: "null",
      stderr: "null",
    });

    const child = cmd.spawn();
    this.#processes.set(key, child);
  }

  #killLayer(key: keyof Mood): void {
    const proc = this.#processes.get(key);
    if (proc) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // already exited
      }
      this.#processes.delete(key);
    }
  }
}
