import type { RepoStatus } from "./ingestion.ts";
import type { KeyAction } from "./keys.ts";
import { calculateMood, type Mood } from "./state.ts";

/** What the TUI shows, besides the mood. */
export interface ViewState {
  statuses: RepoStatus[];
  volume: number;
  muted: boolean;
  /** Set when the last status update threw; cleared by the next one. */
  updateError?: string;
  /** A standing warning, shown while there is no failure to report. */
  warning?: string;
}

/**
 * The warning to show when some repo relies on GITHUB_TOKEN but it is unset:
 * those repos are polled unauthenticated, under a much lower rate limit.
 */
export function missingTokenWarning(
  repos: readonly { token?: string }[],
  envToken: string | undefined,
): string | undefined {
  if (envToken || repos.every((repo) => repo.token !== undefined)) return undefined;
  return "GITHUB_TOKEN is not set; polling GitHub unauthenticated (60 requests/hour)";
}

/** Anything that knows whether audio is currently failing (the ffplay engine). */
export interface AudioHealth {
  readonly audioError: Error | undefined;
}

/**
 * The problem to surface, worked out on every redraw rather than latched: an
 * update failure first, otherwise a current audio failure, otherwise the
 * standing warning. An audio notice therefore stays up for as long as ffplay
 * keeps failing and goes away by itself once every layer plays again.
 */
export function currentNotice(view: ViewState, audio: AudioHealth): string | undefined {
  if (view.updateError) return view.updateError;
  const audioError = audio.audioError;
  return audioError ? `Audio error: ${audioError.message}` : view.warning;
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

/** Apply a mute or volume key to the view. Changing the volume also unmutes. */
export function applyVolumeKey(view: ViewState, action: Exclude<KeyAction, "quit">): void {
  if (action === "mute") {
    view.muted = !view.muted;
    return;
  }
  const step = action === "volume_up" ? 5 : -5;
  view.volume = Math.max(0, Math.min(100, view.volume + step));
  view.muted = false;
}
