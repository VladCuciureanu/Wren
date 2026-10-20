import type { RepoStatus } from "./ingestion.ts";
import { calculateMood, type Mood } from "./state.ts";

/** What the TUI shows, besides the mood. */
export interface ViewState {
  statuses: RepoStatus[];
  volume: number;
  muted: boolean;
  /** Set when the last status update threw; cleared by the next one. */
  updateError?: string;
}

/** Anything that knows whether audio is currently failing (the ffplay engine). */
export interface AudioHealth {
  readonly audioError: Error | undefined;
}

/**
 * The problem to surface, worked out on every redraw rather than latched: an
 * update failure first, otherwise a current audio failure. An audio notice
 * therefore stays up for as long as ffplay keeps failing and goes away by
 * itself once every layer plays again.
 */
export function currentNotice(view: ViewState, audio: AudioHealth): string | undefined {
  if (view.updateError) return view.updateError;
  const audioError = audio.audioError;
  return audioError ? `Audio error: ${audioError.message}` : undefined;
}

/**
 * Build the ingestion callback: record the statuses, move the audio to the
 * matching mood and redraw. A successful update clears the previous update
 * failure; a throw is reported by the loop, which sets it again.
 */
export function createUpdateHandler(
  view: ViewState,
  crossfader: { transitionTo(mood: Mood): void },
  redraw: (mood: Mood) => void,
): (statuses: RepoStatus[]) => void {
  return (statuses) => {
    view.updateError = undefined;
    view.statuses = statuses;
    const mood = calculateMood(statuses);
    crossfader.transitionTo(mood);
    redraw(mood);
  };
}
