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

/** Timer functions the engine schedules retries with; injectable for tests. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RetryOptions {
  /** Delay before the first retry of a failed layer. */
  baseMs: number;
  /** Upper bound for the doubling delay. */
  maxMs: number;
  /** How long a process must keep playing before its layer counts as healthy again. */
  stableMs: number;
}

export interface EngineOptions {
  timers?: Timers;
  retry?: Partial<RetryOptions>;
}

const DEFAULT_RETRY: RetryOptions = { baseMs: 1_000, maxMs: 60_000, stableMs: 5_000 };

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

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
  /** Consecutive failures per layer; drives the retry backoff. */
  #attempts = new Map<keyof Mood, number>();
  /** Pending retry and stability timers per layer. */
  #retryTimers = new Map<keyof Mood, unknown>();
  #stableTimers = new Map<keyof Mood, unknown>();
  #timers: Timers;
  #retry: RetryOptions;

  constructor(
    assetsDir: string,
    masterVolume = 80,
    spawnFn: SpawnFn = spawn,
    onError: AudioErrorHandler = defaultErrorHandler,
    options: EngineOptions = {},
  ) {
    this.#assetsDir = assetsDir;
    this.#masterVolume = masterVolume;
    this.#spawn = spawnFn;
    this.#onError = onError;
    this.#timers = options.timers ?? realTimers;
    this.#retry = { ...DEFAULT_RETRY, ...options.retry };
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
    // A spawn (from an update or a retry) supersedes any pending retry.
    this.#cancelTimer(this.#retryTimers, key);
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
    // A layer is healthy again only once its process has kept playing for a
    // while; one that starts and dies right away (e.g. a corrupt file) stays
    // failing and keeps backing off instead of retrying every second.
    proc.on("spawn", () => {
      if (!current()) return;
      this.#cancelTimer(this.#stableTimers, key);
      this.#stableTimers.set(
        key,
        this.#timers.setTimeout(() => {
          this.#stableTimers.delete(key);
          if (!current()) return;
          this.#failures.delete(key);
          this.#attempts.delete(key);
        }, this.#retry.stableMs),
      );
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
    this.#cancelTimer(this.#stableTimers, key);
    this.#scheduleRetry(key);
    if (!wasHealthy) return;
    try {
      this.#onError(error);
    } catch {
      // A failing reporter must not take the audio engine down with it.
    }
  }

  /** Respawn a failed layer after a doubling delay, if it should still be playing. */
  #scheduleRetry(key: keyof Mood): void {
    const attempt = this.#attempts.get(key) ?? 0;
    this.#attempts.set(key, attempt + 1);
    const delay = Math.min(this.#retry.maxMs, this.#retry.baseMs * 2 ** attempt);
    this.#cancelTimer(this.#retryTimers, key);
    this.#retryTimers.set(
      key,
      this.#timers.setTimeout(() => {
        this.#retryTimers.delete(key);
        const vol = this.#currentMood?.[key] ?? 0;
        if (vol > 0 && !this.#processes.has(key)) this.#spawnLayer(key, vol);
      }, delay),
    );
  }

  #cancelTimer(timers: Map<keyof Mood, unknown>, key: keyof Mood): void {
    const handle = timers.get(key);
    if (handle === undefined) return;
    this.#timers.clearTimeout(handle);
    timers.delete(key);
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
    // A layer that is meant to be silent can't be failing, and needs no retry.
    this.#failures.delete(key);
    this.#attempts.delete(key);
    this.#cancelTimer(this.#retryTimers, key);
    this.#cancelTimer(this.#stableTimers, key);
  }
}
