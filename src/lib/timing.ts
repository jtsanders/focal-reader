export const WPM_MIN = 80;
export const WPM_MAX = 1000;
export const WPM_DEFAULT = 300;
export const SKIP_MIN = 1;
export const SKIP_MAX = 60;
export const SKIP_DEFAULT = 10;
export const RAMP_MS = 3000;

export type Ramp = {
  startedAt: number;
  from: number;
  to: number;
  durationMs: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Cubic ease-out: fast at the start, settling at the end. */
export function easeOutCubic(progress: number): number {
  const t = clamp(progress, 0, 1);
  return 1 - (1 - t) ** 3;
}

export function instantaneousWpm(
  now: number,
  ramp: Ramp | null,
  targetWpm: number,
): number {
  if (!ramp) return targetWpm;
  const progress = (now - ramp.startedAt) / ramp.durationMs;
  if (progress <= 0) return ramp.from;
  if (progress >= 1) return ramp.to;
  return ramp.from + (ramp.to - ramp.from) * easeOutCubic(progress);
}

export function startRamp(now: number, targetWpm: number): Ramp {
  return {
    startedAt: now,
    from: targetWpm * 0.5,
    to: targetWpm,
    durationMs: RAMP_MS,
  };
}

export function retargetRamp(now: number, fromWpm: number, targetWpm: number): Ramp {
  return {
    startedAt: now,
    from: fromWpm,
    to: targetWpm,
    durationMs: RAMP_MS,
  };
}

/** Words to move for a skip. Uses the set WPM, not the ramp speed. */
export function skipWordCount(seconds: number, targetWpm: number): number {
  return Math.max(1, Math.round((seconds * targetWpm) / 60));
}

export function formatRemaining(wordsLeft: number, wpm: number): string {
  if (wordsLeft <= 0 || wpm <= 0) return "0 sec left";
  const totalSeconds = Math.round((wordsLeft / wpm) * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} hr ${minutes} min left`;
  if (minutes > 0 && seconds > 0) return `${minutes} min ${seconds} sec left`;
  if (minutes > 0) return `${minutes} min left`;
  return `${seconds} sec left`;
}
