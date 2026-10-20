import type { RepoStatus } from "./ingestion.ts";
import { calculateMood, type Mood } from "./state.ts";

/** What the TUI shows, besides the mood. */
export interface ViewState {
  statuses: RepoStatus[];
  volume: number;
  muted: boolean;
  /** A problem worth surfacing, e.g. "Audio error: …" or "Update failed: …". */
  notice?: string;
}

/**
 * Build the ingestion callback: record the statuses, move the audio to the
 * matching mood and redraw. Each update starts by clearing the notice, so a
 * problem stays on screen only until an update succeeds; one raised during
 * this update (an audio error, or a throw reported by the loop) is kept.
 */
export function createUpdateHandler(
  view: ViewState,
  crossfader: { transitionTo(mood: Mood): void },
  redraw: (mood: Mood) => void,
): (statuses: RepoStatus[]) => void {
  return (statuses) => {
    view.notice = undefined;
    view.statuses = statuses;
    const mood = calculateMood(statuses);
    crossfader.transitionTo(mood);
    redraw(mood);
  };
}
