import type { PipelineState } from "./providers/mod.ts";
import type { RepoStatus } from "./ingestion.ts";

export interface Mood {
  birdsong: number;
  wind: number;
  thunder: number;
  rain: number;
  hum: number;
  chime: number;
  static_: number;
}

// Each layer volume 0.0–1.0 per pipeline state
const STATE_MOODS: Record<PipelineState, Mood> = {
  passing: { birdsong: 1.0, wind: 0.2, thunder: 0.0, rain: 0.0, hum: 0.0, chime: 0.0, static_: 0.0 },
  failing: { birdsong: 0.1, wind: 0.6, thunder: 0.5, rain: 0.3, hum: 0.0, chime: 0.0, static_: 0.0 },
  error: { birdsong: 0.0, wind: 0.4, thunder: 0.8, rain: 0.7, hum: 0.0, chime: 0.0, static_: 0.0 },
  deploying: { birdsong: 0.3, wind: 0.3, thunder: 0.0, rain: 0.0, hum: 0.8, chime: 0.0, static_: 0.0 },
  deploy_success: { birdsong: 0.8, wind: 0.2, thunder: 0.0, rain: 0.0, hum: 0.0, chime: 1.0, static_: 0.0 },
  deploy_failed: { birdsong: 0.0, wind: 0.5, thunder: 0.9, rain: 0.6, hum: 0.0, chime: 0.0, static_: 0.0 },
  pending: { birdsong: 0.2, wind: 0.4, thunder: 0.0, rain: 0.0, hum: 0.3, chime: 0.0, static_: 0.0 },
  unknown: { birdsong: 0.0, wind: 0.0, thunder: 0.0, rain: 0.0, hum: 0.0, chime: 0.0, static_: 0.5 },
};

const MOOD_KEYS: (keyof Mood)[] = ["birdsong", "wind", "thunder", "rain", "hum", "chime", "static_"];

export function emptyMood(): Mood {
  return { birdsong: 0, wind: 0, thunder: 0, rain: 0, hum: 0, chime: 0, static_: 0 };
}

export function calculateMood(statuses: RepoStatus[]): Mood {
  if (statuses.length === 0) {
    return STATE_MOODS.unknown;
  }

  const result = emptyMood();
  for (const status of statuses) {
    const m = STATE_MOODS[status.state];
    for (const key of MOOD_KEYS) {
      result[key] += m[key];
    }
  }

  // Average
  const n = statuses.length;
  for (const key of MOOD_KEYS) {
    result[key] = Math.round((result[key] / n) * 100) / 100;
  }

  return result;
}

export function moodLabel(mood: Mood): string {
  const dominant = MOOD_KEYS.reduce((a, b) => mood[a] >= mood[b] ? a : b);
  const labels: Record<keyof Mood, string> = {
    birdsong: "Clear skies",
    wind: "Breezy",
    thunder: "Stormy",
    rain: "Rainy",
    hum: "Humming",
    chime: "Celebration",
    static_: "Fog",
  };
  return labels[dominant];
}
