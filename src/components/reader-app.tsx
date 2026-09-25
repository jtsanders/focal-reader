"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Pause, Play } from "lucide-react";

import { WordStage } from "@/components/word-stage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useRsvp, type ReaderSession } from "@/hooks/use-rsvp";
import { ExtractError } from "@/lib/extract-error";
import { openBookFile } from "@/lib/open-file";
import { splitPivot } from "@/lib/pivot";
import { SAMPLE_NAME, SAMPLE_TEXT } from "@/lib/sample";
import {
  updateSkipSeconds,
  updateWordSize,
  updateWpm,
  useReaderSettings,
} from "@/lib/settings";
import { tokenize } from "@/lib/tokenize";
import {
  SKIP_MAX,
  SKIP_MIN,
  WORD_SIZE_MAX,
  WORD_SIZE_MIN,
  WPM_MAX,
  WPM_MIN,
  clamp,
  dwellUnits,
  formatRemaining,
} from "@/lib/timing";

type Phase =
  | { kind: "empty" }
  | { kind: "loading"; name: string }
  | { kind: "error"; message: string }
  | { kind: "ready" };

function sliderValue(value: number | readonly number[]): number {
  if (typeof value === "number") return value;
  return value[0] ?? 0;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function isSlider(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("[data-slot='slider']"))
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
  className,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (next: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : String(value);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(Math.round(parsed), min, max);
    onCommit(next);
    setDraft(String(next));
  };

  return (
    <Input
      id={id}
      aria-label={label}
      inputMode="numeric"
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      value={shown}
      className={className}
      onFocus={() => {
        setDraft(String(value));
        setFocused(true);
      }}
      onBlur={(event) => {
        setFocused(false);
        commit(event.currentTarget.value);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

export function ReaderApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "empty" });
  const [session, setSession] = useState<ReaderSession | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const sessionCount = useRef(0);
  const dragDepth = useRef(0);
  const restartRef = useRef<(() => void) | null>(null);
  const settings = useReaderSettings();

  const openSample = useCallback(() => {
    requestRef.current += 1;
    const words = tokenize(SAMPLE_TEXT);
    sessionCount.current += 1;
    setSession({
      id: sessionCount.current,
      name: SAMPLE_NAME,
      words,
      chapters: [],
    });
    setPhase({ kind: "ready" });
  }, []);

  const openFile = useCallback(async (file: File) => {
    const id = ++requestRef.current;
    setPhase({ kind: "loading", name: file.name });
    try {
      const opened = await openBookFile(file);
      if (id !== requestRef.current) return;
      sessionCount.current += 1;
      setSession({
        id: sessionCount.current,
        name: opened.name,
        words: opened.words,
        chapters: opened.chapters,
      });
      setPhase({ kind: "ready" });
    } catch (error) {
      if (id !== requestRef.current) return;
      const message =
        error instanceof ExtractError
          ? error.message
          : `Could not read “${file.name}”.`;
      setSession(null);
      setPhase({ kind: "error", message });
    }
  }, []);

  const ready = phase.kind === "ready" && session != null;
  const title =
    ready && session
      ? session.name
      : phase.kind === "loading"
        ? phase.name
        : "No book open";

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden bg-[#e8d5b8] text-[#1a1a1a]"
      data-reader-state={phase.kind}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragOver(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file) void openFile(file);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.epub,application/pdf,application/epub+zip"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void openFile(file);
        }}
      />

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-medium tracking-[0.22em] text-[#1a1a1a]/55 uppercase">
            Focal
          </p>
          <h1 className="truncate text-base font-medium sm:text-lg">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ready ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-3"
              onClick={() => restartRef.current?.()}
            >
              Start over
            </Button>
          ) : null}
          <SettingsDialog />
          <Button
            type="button"
            variant="outline"
            className="h-11 bg-[#e8d5b8] px-3"
            onClick={openSample}
          >
            Read sample
          </Button>
          <Button
            type="button"
            className="h-11 px-4"
            onClick={() => fileRef.current?.click()}
          >
            Open
          </Button>
        </div>
      </header>

      {ready && session ? (
        <ActiveSession
          key={session.id}
          session={session}
          targetWpm={settings.wpm}
          skipSeconds={settings.skipSeconds}
          wordSize={settings.wordSize}
          restartRef={restartRef}
        />
      ) : (
        <IdleStage
          phase={phase}
          targetWpm={settings.wpm}
          skipSeconds={settings.skipSeconds}
          onOpen={() => fileRef.current?.click()}
          onSample={openSample}
        />
      )}

      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#e8d5b8]/90 p-6">
          <p className="rounded-2xl border border-dashed border-[#1a1a1a]/40 px-8 py-6 text-center font-reading text-2xl">
            Drop a PDF or EPUB to open it
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ActiveSession({
  session,
  targetWpm,
  skipSeconds,
  wordSize,
  restartRef,
}: {
  session: ReaderSession;
  targetWpm: number;
  skipSeconds: number;
  wordSize: number;
  restartRef: RefObject<(() => void) | null>;
}) {
  const engine = useRsvp(session, targetWpm, skipSeconds);
  const { toggle, skip, restart } = engine;
  const current = session.words[engine.index];
  const token = current?.text ?? "";
  const pivot = token ? splitPivot(token).pivot : "";
  const wordsLeft = engine.finished
    ? 0
    : session.words
        .slice(engine.index)
        .reduce((sum, word) => sum + dwellUnits(word.pause), 0);

  useEffect(() => {
    restartRef.current = restart;
    return () => {
      restartRef.current = null;
    };
  }, [restart, restartRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEntry(event.target)) return;
      if (document.querySelector("[data-slot='dialog-content'][data-open]")) return;
      if (event.code === "Space") {
        if (event.repeat) return;
        event.preventDefault();
        toggle();
        return;
      }
      if (isSlider(event.target)) return;
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        skip(-1);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        skip(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip, toggle]);

  const chapterValue = session.chapters.reduce(
    (chosen, chapter, position) =>
      chapter.index <= engine.index ? position : chosen,
    0,
  );

  const pace =
    engine.playing && engine.liveWpm != null
      ? Math.abs(engine.liveWpm - targetWpm) > 1
        ? `Pace ${engine.liveWpm} of ${targetWpm}`
        : `${targetWpm} wpm`
      : engine.finished
        ? "End of the text"
        : "Paused";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-playing={engine.playing ? "true" : "false"}
      data-index={engine.index}
      data-pace={engine.playing ? (engine.liveWpm ?? "") : ""}
      data-word={token}
      data-pivot={pivot}
      data-pause={current?.pause ?? "none"}
      data-chapters={session.chapters.length}
    >
      {session.chapters.length > 0 ? (
        <div className="flex shrink-0 items-center gap-3 px-4 pt-1 sm:px-8">
          <label htmlFor="chapters" className="shrink-0 text-sm text-[#1a1a1a]/70">
            Chapter
          </label>
          <select
            id="chapters"
            aria-label="Chapters"
            className="h-11 min-w-0 flex-1 truncate rounded-lg border border-[#1a1a1a]/20 bg-[#e8d5b8] px-3 text-base"
            value={String(chapterValue)}
            onChange={(event) => {
              const chapter = session.chapters[Number(event.target.value)];
              if (chapter) engine.seek(chapter.index);
            }}
          >
            {session.chapters.map((chapter, position) => (
              <option key={`${position}-${chapter.title}`} value={position}>
                {`${"\u00a0\u00a0".repeat(chapter.depth)}${chapter.title}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 sm:px-8">
        {token ? (
          <div className="flex w-full max-w-5xl flex-col items-center">
            <WordStage token={token} size={wordSize} />
            <p className="mt-8 h-6 text-center text-sm tabular-nums text-[#1a1a1a]/60">
              {pace}
            </p>
            <p className="sr-only">{engine.playing ? "" : token}</p>
          </div>
        ) : null}
      </main>
      <Controls
        disabled={false}
        playing={engine.playing}
        index={engine.index}
        total={session.words.length}
        wordsLeft={wordsLeft}
        targetWpm={targetWpm}
        skipSeconds={skipSeconds}
        onToggle={engine.toggle}
        onSkip={engine.skip}
        onSeek={engine.seek}
      />
    </div>
  );
}

function IdleStage({
  phase,
  targetWpm,
  skipSeconds,
  onOpen,
  onSample,
}: {
  phase: Phase;
  targetWpm: number;
  skipSeconds: number;
  onOpen: () => void;
  onSample: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 sm:px-8">
        {phase.kind === "empty" ? (
          <EmptyState onOpen={onOpen} onSample={onSample} />
        ) : null}
        {phase.kind === "loading" ? (
          <div className="max-w-md text-center">
            <p className="font-reading text-3xl font-semibold sm:text-4xl">
              Reading the file
            </p>
            <p className="mt-3 text-[#1a1a1a]/75">
              Extracting text from {phase.name}. It stays in this browser. A
              long book can take a moment.
            </p>
          </div>
        ) : null}
        {phase.kind === "error" ? (
          <div className="max-w-md text-center">
            <h2 className="font-reading text-3xl font-semibold sm:text-4xl">
              This file could not be read
            </h2>
            <p className="mt-3 text-[#1a1a1a]/75">{phase.message}</p>
            <Button type="button" className="mt-6 h-11 px-4" onClick={onOpen}>
              Try another file
            </Button>
          </div>
        ) : null}
      </main>
      <Controls
        disabled
        playing={false}
        index={0}
        total={0}
        wordsLeft={0}
        targetWpm={targetWpm}
        skipSeconds={skipSeconds}
        onToggle={() => undefined}
        onSkip={() => undefined}
        onSeek={() => undefined}
      />
    </div>
  );
}

function Controls({
  disabled,
  playing,
  index,
  total,
  wordsLeft,
  targetWpm,
  skipSeconds,
  onToggle,
  onSkip,
  onSeek,
}: {
  disabled: boolean;
  playing: boolean;
  index: number;
  total: number;
  wordsLeft: number;
  targetWpm: number;
  skipSeconds: number;
  onToggle: () => void;
  onSkip: (direction: -1 | 1) => void;
  onSeek: (index: number) => void;
}) {
  return (
    <footer className="shrink-0 border-t border-[#1a1a1a]/10 bg-[#e0cbaa] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="tabular-nums">
            {total > 0 ? `${index + 1} of ${total}` : "0 of 0"}
          </span>
          <span className="text-[#1a1a1a]/70">
            {total > 0 ? formatRemaining(wordsLeft, targetWpm) : "—"}
          </span>
        </div>
        {total > 1 ? (
          <Slider
            aria-label="Reading position"
            min={0}
            max={total - 1}
            step={1}
            value={[index]}
            disabled={disabled}
            onValueChange={(value) => onSeek(sliderValue(value))}
          />
        ) : (
          <div className="my-2.5 h-1.5 rounded-full bg-[#1a1a1a]/15" />
        )}

        <div className="flex flex-col items-center gap-3 pt-1">
          <Button
            type="button"
            className="h-16 min-w-36 flex-col gap-0.5 rounded-2xl px-6 text-base"
            disabled={disabled}
            aria-label={playing ? "Pause" : "Play"}
            onClick={onToggle}
          >
            {playing ? (
              <Pause className="size-6 fill-current" />
            ) : (
              <Play className="size-6 fill-current" />
            )}
            {playing ? "Pause" : "Play"}
          </Button>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 bg-[#e0cbaa] px-3"
              disabled={disabled}
              aria-label={`Rewind ${skipSeconds} seconds`}
              onClick={() => onSkip(-1)}
            >
              Back
            </Button>
            <div className="flex items-center gap-1.5">
              <NumberField
                id="skip-seconds"
                label="Skip distance in seconds"
                value={skipSeconds}
                min={SKIP_MIN}
                max={SKIP_MAX}
                onCommit={updateSkipSeconds}
                className="h-12 w-14 bg-[#e8d5b8] text-center"
              />
              <span className="text-sm text-[#1a1a1a]/70">sec</span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-12 bg-[#e0cbaa] px-3"
              disabled={disabled}
              aria-label={`Skip forward ${skipSeconds} seconds`}
              onClick={() => onSkip(1)}
            >
              Ahead
            </Button>
          </div>
        </div>

        <p className="pb-1 text-center text-xs text-[#1a1a1a]/55">
          Space plays and pauses. Left and right arrows skip. Sentences,
          paragraphs, and chapters hold a little longer.
        </p>
      </div>
    </footer>
  );
}

function SettingsDialog() {
  const settings = useReaderSettings();

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-11 bg-[#e8d5b8] px-3"
          />
        }
      >
        Settings
      </DialogTrigger>
      <DialogContent className="top-auto bottom-4 max-h-[min(32rem,calc(100dvh-2rem))] translate-y-0 overflow-y-auto sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Word size and reading speed. Both are remembered in this browser.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="word-size">Word size</Label>
              <div className="flex items-center gap-1.5">
                <NumberField
                  id="word-size"
                  label="Word size percent"
                  value={settings.wordSize}
                  min={WORD_SIZE_MIN}
                  max={WORD_SIZE_MAX}
                  onCommit={updateWordSize}
                  className="h-11 w-[4.5rem] bg-[#e8d5b8] text-center"
                />
                <span className="text-sm text-[#1a1a1a]/70">%</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-6 font-reading text-sm text-[#1a1a1a]/55">A</span>
              <Slider
                aria-label="Word size"
                min={WORD_SIZE_MIN}
                max={WORD_SIZE_MAX}
                step={1}
                value={[settings.wordSize]}
                onValueChange={(value) => updateWordSize(sliderValue(value))}
                className="flex-1"
              />
              <span className="w-8 text-right font-reading text-2xl leading-none text-[#1a1a1a]/55">
                A
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="wpm">Words per minute</Label>
              <NumberField
                id="wpm"
                label="Words per minute"
                value={settings.wpm}
                min={WPM_MIN}
                max={WPM_MAX}
                onCommit={updateWpm}
                className="h-11 w-[4.5rem] bg-[#e8d5b8] text-center"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-8 text-xs tabular-nums text-[#1a1a1a]/55">
                {WPM_MIN}
              </span>
              <Slider
                aria-label="Words per minute"
                min={WPM_MIN}
                max={WPM_MAX}
                step={1}
                value={[settings.wpm]}
                onValueChange={(value) => updateWpm(sliderValue(value))}
                className="flex-1"
              />
              <span className="w-10 text-right text-xs tabular-nums text-[#1a1a1a]/55">
                {WPM_MAX}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({
  onOpen,
  onSample,
}: {
  onOpen: () => void;
  onSample: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
      <h2 className="font-reading text-4xl leading-tight font-semibold sm:text-5xl">
        Read one word at a time.
      </h2>
      <p className="mt-4 text-base leading-7 text-[#1a1a1a]/75 sm:text-lg">
        Open a PDF or EPUB. Each word lands on a fixed red letter, so your
        eyes stay still while the text comes to them.
      </p>
      <div className="mt-6 w-full rounded-2xl border border-dashed border-[#1a1a1a]/30 px-5 py-8">
        <p className="text-[#1a1a1a]/80">
          Drop a PDF or EPUB here, or choose a file. Nothing is uploaded.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" className="h-11 px-4" onClick={onOpen}>
            Open a PDF or EPUB
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 bg-[#e8d5b8] px-4"
            onClick={onSample}
          >
            Read the sample
          </Button>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#1a1a1a]/60">
        The sample is a short original passage, labeled Sample, so you can try
        the reader before you bring your own book.
      </p>
    </div>
  );
}
