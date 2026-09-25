"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { savePosition, loadPosition } from "@/lib/storage";
import type { Chapter, ReadingToken } from "@/lib/tokenize";
import {
  clamp,
  dwellUnits,
  instantaneousWpm,
  retargetRamp,
  skipWordCount,
  startRamp,
  type Ramp,
} from "@/lib/timing";

export type ReaderSession = {
  id: number;
  name: string;
  words: ReadingToken[];
  chapters: Chapter[];
};

const STALL_SECONDS = 0.25;

export function useRsvp(
  session: ReaderSession,
  targetWpm: number,
  skipSeconds: number,
) {
  const initialIndex = clamp(
    loadPosition(session.name),
    0,
    Math.max(0, session.words.length - 1),
  );
  const [index, setIndex] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [liveWpm, setLiveWpm] = useState<number | null>(null);

  const indexRef = useRef(initialIndex);
  const playingRef = useRef(false);
  const finishedRef = useRef(false);
  const targetRef = useRef(targetWpm);
  const skipRef = useRef(skipSeconds);
  const rampRef = useRef<Ramp | null>(null);
  const carryRef = useRef(0);
  const lastTickRef = useRef(0);
  const liveRef = useRef<number | null>(null);
  const loopRef = useRef<number | null>(null);
  const words = session.words;
  const fileName = session.name;

  useEffect(() => {
    if (playingRef.current && targetWpm !== targetRef.current) {
      const now = performance.now();
      rampRef.current = retargetRamp(
        now,
        instantaneousWpm(now, rampRef.current, targetRef.current),
        targetWpm,
      );
    }
    targetRef.current = targetWpm;
  }, [targetWpm]);

  useEffect(() => {
    skipRef.current = skipSeconds;
  }, [skipSeconds]);

  const persistIndex = useCallback(
    (nextIndex: number) => {
      savePosition(fileName, nextIndex);
    },
    [fileName],
  );

  const stopLoop = useCallback(() => {
    if (loopRef.current != null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    stopLoop();
    liveRef.current = null;
    setPlaying(false);
    setLiveWpm(null);
    persistIndex(indexRef.current);
  }, [persistIndex, stopLoop]);

  const play = useCallback(() => {
    if (words.length === 0 || playingRef.current) return;
    if (finishedRef.current) {
      indexRef.current = 0;
      carryRef.current = 0;
      finishedRef.current = false;
      setIndex(0);
      setFinished(false);
      persistIndex(0);
    }
    const now = performance.now();
    rampRef.current = startRamp(now, targetRef.current);
    carryRef.current = 0;
    lastTickRef.current = now;
    playingRef.current = true;
    const starting = Math.round(targetRef.current * 0.5);
    liveRef.current = starting;
    setLiveWpm(starting);
    setPlaying(true);

    const run = (frame: number) => {
      if (!playingRef.current) {
        loopRef.current = null;
        return;
      }

      const dt = (frame - lastTickRef.current) / 1000;
      lastTickRef.current = frame;
      const wpm = instantaneousWpm(frame, rampRef.current, targetRef.current);
      const shown = Math.round(wpm);
      if (shown !== liveRef.current) {
        liveRef.current = shown;
        setLiveWpm(shown);
      }

      const last = words.length - 1;
      if (last < 0) {
        playingRef.current = false;
        setPlaying(false);
        loopRef.current = null;
        return;
      }

      if (dt > 0 && dt <= STALL_SECONDS) {
        carryRef.current += (wpm / 60) * dt;
        let next = indexRef.current;
        let moved = false;
        while (
          next < last &&
          carryRef.current >= dwellUnits(words[next].pause)
        ) {
          carryRef.current -= dwellUnits(words[next].pause);
          next += 1;
          moved = true;
        }
        if (
          next >= last &&
          carryRef.current >= dwellUnits(words[last].pause)
        ) {
          carryRef.current = 0;
          indexRef.current = last;
          if (moved) setIndex(last);
          persistIndex(last);
          finishedRef.current = true;
          playingRef.current = false;
          liveRef.current = null;
          setFinished(true);
          setPlaying(false);
          setLiveWpm(null);
          loopRef.current = null;
          return;
        }
        if (moved && playingRef.current) {
          indexRef.current = next;
          setIndex(next);
          persistIndex(next);
        }
      }

      loopRef.current = requestAnimationFrame(run);
    };

    loopRef.current = requestAnimationFrame(run);
  }, [persistIndex, words]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const seek = useCallback(
    (nextIndex: number) => {
      if (words.length === 0) return;
      const next = clamp(Math.round(nextIndex), 0, words.length - 1);
      indexRef.current = next;
      carryRef.current = 0;
      finishedRef.current = false;
      setIndex(next);
      setFinished(false);
      persistIndex(next);
    },
    [persistIndex, words.length],
  );

  const skip = useCallback(
    (direction: -1 | 1) => {
      if (words.length === 0) return;
      const count = skipWordCount(skipRef.current, targetRef.current);
      seek(indexRef.current + direction * count);
    },
    [seek, words.length],
  );

  const restart = useCallback(() => {
    playingRef.current = false;
    stopLoop();
    rampRef.current = null;
    carryRef.current = 0;
    finishedRef.current = false;
    indexRef.current = 0;
    liveRef.current = null;
    setPlaying(false);
    setFinished(false);
    setLiveWpm(null);
    setIndex(0);
    persistIndex(0);
  }, [persistIndex, stopLoop]);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      if (loopRef.current != null) {
        cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
      }
      savePosition(fileName, indexRef.current);
    };
  }, [fileName]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        savePosition(fileName, indexRef.current);
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [fileName]);

  return {
    index,
    playing,
    finished,
    liveWpm,
    play,
    pause,
    toggle,
    skip,
    seek,
    restart,
  };
}
