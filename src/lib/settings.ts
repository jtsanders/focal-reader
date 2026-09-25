"use client";

import { useSyncExternalStore } from "react";

import {
  loadSkipSeconds,
  loadWordSize,
  loadWpm,
  saveSkipSeconds,
  saveWordSize,
  saveWpm,
} from "@/lib/storage";
import {
  SKIP_DEFAULT,
  SKIP_MAX,
  SKIP_MIN,
  WORD_SIZE_DEFAULT,
  WORD_SIZE_MAX,
  WORD_SIZE_MIN,
  WPM_DEFAULT,
  WPM_MAX,
  WPM_MIN,
  clamp,
} from "@/lib/timing";

export type ReaderSettings = {
  wpm: number;
  skipSeconds: number;
  wordSize: number;
};

const serverSettings: ReaderSettings = {
  wpm: WPM_DEFAULT,
  skipSeconds: SKIP_DEFAULT,
  wordSize: WORD_SIZE_DEFAULT,
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
    wordSize: loadWordSize(),
  };
  current =
    loaded.wpm === serverSettings.wpm &&
    loaded.skipSeconds === serverSettings.skipSeconds &&
    loaded.wordSize === serverSettings.wordSize
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

export function updateWordSize(size: number): void {
  ensureHydrated();
  const next = clamp(Math.round(size), WORD_SIZE_MIN, WORD_SIZE_MAX);
  if (next === current.wordSize) return;
  current = { ...current, wordSize: next };
  saveWordSize(next);
  emit();
}
