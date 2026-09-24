"use client";

import { useSyncExternalStore } from "react";

import { loadSkipSeconds, loadWpm, saveSkipSeconds, saveWpm } from "@/lib/storage";
import {
  SKIP_DEFAULT,
  SKIP_MAX,
  SKIP_MIN,
  WPM_DEFAULT,
  WPM_MAX,
  WPM_MIN,
  clamp,
} from "@/lib/timing";

export type ReaderSettings = {
  wpm: number;
  skipSeconds: number;
};

const serverSettings: ReaderSettings = {
  wpm: WPM_DEFAULT,
  skipSeconds: SKIP_DEFAULT,
};

let current: ReaderSettings = serverSettings;
let hydrated = false;
const listeners = new Set<() => void>();

function ensureHydrated(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const loaded = {
    wpm: loadWpm(),
    skipSeconds: loadSkipSeconds(),
  };
  current =
    loaded.wpm === serverSettings.wpm &&
    loaded.skipSeconds === serverSettings.skipSeconds
      ? serverSettings
      : loaded;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ReaderSettings {
  ensureHydrated();
  return current;
}

function getServerSnapshot(): ReaderSettings {
  return serverSettings;
}

export function useReaderSettings(): ReaderSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function updateWpm(wpm: number): void {
  ensureHydrated();
  const next = clamp(Math.round(wpm), WPM_MIN, WPM_MAX);
  if (next === current.wpm) return;
  current = { ...current, wpm: next };
  saveWpm(next);
  emit();
}

export function updateSkipSeconds(seconds: number): void {
  ensureHydrated();
  const next = clamp(Math.round(seconds), SKIP_MIN, SKIP_MAX);
  if (next === current.skipSeconds) return;
  current = { ...current, skipSeconds: next };
  saveSkipSeconds(next);
  emit();
}
