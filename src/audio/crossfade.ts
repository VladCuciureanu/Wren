import { MOOD_KEYS, type Mood } from "../state.ts";
import type { AudioEngine } from "./ffplay.ts";

/**
 * Moves the audio engine between moods.
 *
 * ffplay can't change a layer's volume while it plays, so stepping through
 * intermediate volumes would restart every looping layer on each step (an
 * audible stutter). Instead each mood change is applied as a single update
 * at the target volumes. Updates are synchronous, so transitions can never
 * overlap and the most recent call always wins.
 */
export class Crossfader {
  #engine: AudioEngine;
  #currentMood: Mood | null = null;

  constructor(engine: AudioEngine) {
    this.#engine = engine;
  }

  get currentMood(): Mood | null {
    return this.#currentMood;
  }

  transitionTo(target: Mood): void {
    if (!this.#currentMood) {
      this.#currentMood = { ...target };
      this.#engine.start(target);
      return;
    }

    if (moodsEqual(this.#currentMood, target)) return;

    this.#currentMood = { ...target };
    this.#engine.update(target);
  }

  stop(): void {
    this.#engine.stop();
    this.#currentMood = null;
  }
}

function moodsEqual(a: Mood, b: Mood): boolean {
  return MOOD_KEYS.every((k) => a[k] === b[k]);
}
