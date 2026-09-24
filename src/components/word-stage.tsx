"use client";

import { useLayoutEffect, useRef } from "react";

import { splitPivot } from "@/lib/pivot";

type WordStageProps = {
  token: string;
};

export function WordStage({ token }: WordStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const { before, pivot, after } = splitPivot(token);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const word = wordRef.current;
    if (!stage || !word) return;

    const fit = () => {
      const sample = word.querySelector("[data-part]");
      if (!(sample instanceof HTMLElement)) return;
      const computed = getComputedStyle(sample);
      const probe = document.createElement("span");
      probe.textContent = `${before}${pivot}${after}`;
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.whiteSpace = "nowrap";
      probe.style.fontFamily = computed.fontFamily;
      probe.style.fontSize = computed.fontSize;
      probe.style.fontWeight = computed.fontWeight;
      probe.style.fontStyle = computed.fontStyle;
      probe.style.letterSpacing = computed.letterSpacing;
      probe.style.fontVariantLigatures = "none";
      probe.style.fontFeatureSettings = '"liga" 0, "clig" 0';
      stage.appendChild(probe);
      const needed = probe.getBoundingClientRect().width;
      probe.remove();
      const available = stage.clientWidth * 0.92;
      const scale = needed > available && needed > 0 ? available / needed : 1;
      word.style.transform = scale < 1 ? `scale(${scale})` : "none";
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    const fonts = document.fonts;
    fonts?.ready.then(fit).catch(() => undefined);
    return () => observer.disconnect();
  }, [after, before, pivot, token]);

  return (
    <div
      ref={stageRef}
      className="relative w-full select-none text-[clamp(2.75rem,9vw,6.5rem)] leading-none"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2">
        <span className="absolute bottom-full left-1/2 mb-[0.18em] h-[0.16em] w-px -translate-x-1/2 bg-[#1a1a1a]/30" />
        <span className="absolute top-full left-1/2 mt-[0.18em] h-[0.16em] w-px -translate-x-1/2 bg-[#1a1a1a]/30" />
      </div>
      <div
        ref={wordRef}
        data-token={token}
        className="grid w-full items-baseline font-reading"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          transformOrigin: "center center",
          fontVariantLigatures: "none",
          fontFeatureSettings: '"liga" 0, "clig" 0',
          fontWeight: 600,
        }}
      >
        <span
          data-part
          className="overflow-visible text-right whitespace-nowrap text-[#1a1a1a]"
        >
          {before}
        </span>
        <span
          data-part
          data-pivot={pivot}
          className="overflow-visible text-center whitespace-nowrap text-[#d21f1f]"
        >
          {pivot}
        </span>
        <span
          data-part
          className="overflow-visible text-left whitespace-nowrap text-[#1a1a1a]"
        >
          {after}
        </span>
      </div>
    </div>
  );
}
