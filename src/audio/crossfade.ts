import type { Mood } from "../state.ts";
import type { AudioEngine } from "./ffplay.ts";

const MOOD_KEYS: (keyof Mood)[] = ["birdsong", "wind", "thunder", "rain", "hum", "chime", "static_"];

export interface CrossfadeOptions {
  durationMs: number;
  steps: number;
}

const DEFAULTS: CrossfadeOptions = {
  durationMs: 3000,
  steps: 15,
};

export class Crossfader {
  #engine: AudioEngine;
  #options: CrossfadeOptions;
  #currentMood: Mood | null = null;
  #transitioning = false;

  constructor(engine: AudioEngine, options?: Partial<CrossfadeOptions>) {
    this.#engine = engine;
    this.#options = { ...DEFAULTS, ...options };
  }

  get currentMood(): Mood | null {
    return this.#currentMood;
  }

  get transitioning(): boolean {
    return this.#transitioning;
  }

  async transitionTo(target: Mood): Promise<void> {
    if (!this.#currentMood) {
      this.#currentMood = target;
      this.#engine.start(target);
      return;
    }

    if (moodsEqual(this.#currentMood, target)) return;

    this.#transitioning = true;
    const from = { ...this.#currentMood };
    const stepDelay = this.#options.durationMs / this.#options.steps;

    for (let i = 1; i <= this.#options.steps; i++) {
      const t = i / this.#options.steps;
      const intermediate = interpolateMood(from, target, t);
      this.#engine.update(intermediate);
      if (i < this.#options.steps) {
        await sleep(stepDelay);
      }
    }

    this.#currentMood = target;
    this.#transitioning = false;
  }

  stop(): void {
    this.#engine.stop();
    this.#currentMood = null;
  }
}

export function interpolateMood(a: Mood, b: Mood, t: number): Mood {
  const result = {} as Mood;
  for (const key of MOOD_KEYS) {
    result[key] = Math.round((a[key] + (b[key] - a[key]) * t) * 100) / 100;
  }
  return result;
}

function moodsEqual(a: Mood, b: Mood): boolean {
  return MOOD_KEYS.every((k) => a[k] === b[k]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
