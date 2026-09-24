import {
  SKIP_DEFAULT,
  SKIP_MAX,
  SKIP_MIN,
  WPM_DEFAULT,
  WPM_MAX,
  WPM_MIN,
  clamp,
} from "@/lib/timing";

const WPM_KEY = "focal:wpm";
const SKIP_KEY = "focal:skip-seconds";

function positionKey(fileName: string): string {
  return `focal:pos:${fileName}`;
}

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode or a full store should not stop reading.
  }
}

export function loadWpm(): number {
  const stored = readNumber(WPM_KEY);
  if (stored == null) return WPM_DEFAULT;
  return clamp(Math.round(stored), WPM_MIN, WPM_MAX);
}

export function saveWpm(wpm: number): void {
  writeNumber(WPM_KEY, clamp(Math.round(wpm), WPM_MIN, WPM_MAX));
}

export function loadSkipSeconds(): number {
  const stored = readNumber(SKIP_KEY);
  if (stored == null) return SKIP_DEFAULT;
  return clamp(Math.round(stored), SKIP_MIN, SKIP_MAX);
}

export function saveSkipSeconds(seconds: number): void {
  writeNumber(SKIP_KEY, clamp(Math.round(seconds), SKIP_MIN, SKIP_MAX));
}

export function loadPosition(fileName: string): number {
  const stored = readNumber(positionKey(fileName));
  if (stored == null || stored < 0) return 0;
  return Math.round(stored);
}

export function savePosition(fileName: string, index: number): void {
  writeNumber(positionKey(fileName), Math.max(0, Math.round(index)));
}
