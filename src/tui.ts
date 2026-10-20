import process from "node:process";
import type { RepoStatus } from "./ingestion.ts";
import type { Mood } from "./state.ts";
import { moodLabel } from "./state.ts";

const STATE_ICONS: Record<string, string> = {
  passing: "ok",
  failing: "FAIL",
  error: "ERR",
  deploying: ">>>",
  deploy_success: "ok",
  deploy_failed: "FAIL",
  pending: "...",
  unknown: "???",
};

export interface TuiState {
  mood: Mood;
  statuses: RepoStatus[];
  volume: number;
  muted: boolean;
  /** A problem worth surfacing, e.g. audio playback failing. */
  notice?: string;
}

export function renderTui(state: TuiState): string {
  const lines: string[] = [];

  lines.push("  wren");
  lines.push("");

  const label = moodLabel(state.mood);
  lines.push(`  Mood: ${label}`);
  const volDisplay = state.muted ? "muted" : `${state.volume}%`;
  lines.push(`  Volume: ${volDisplay}`);
  lines.push("");

  if (state.statuses.length === 0) {
    lines.push("  No repos configured.");
  } else {
    lines.push("  Pipelines:");
    for (const s of state.statuses) {
      const icon = STATE_ICONS[s.state] ?? "???";
      const err = s.error ? ` (${s.error})` : "";
      lines.push(`    [${icon}] ${s.owner}/${s.name}${err}`);
    }
  }

  if (state.notice) {
    lines.push("");
    lines.push(`  ! ${state.notice}`);
  }

  lines.push("");
  lines.push("  q: quit  m: mute  +/-: volume");

  return lines.join("\n");
}

export function drawTui(state: TuiState): void {
  const output = renderTui(state);
  // Move cursor to top-left and clear screen
  process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write(output);
}
