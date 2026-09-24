import type { TextItem } from "pdfjs-dist/types/src/display/api";

import { ExtractError } from "@/lib/extract-error";

type Glyph = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function clusterLines(glyphs: Glyph[]): Glyph[][] {
  const sorted = [...glyphs].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Glyph[][] = [];
  for (const glyph of sorted) {
    const last = lines[lines.length - 1];
    const tolerance = Math.max(
      2,
      Math.min(last?.[0]?.h ?? glyph.h, glyph.h) * 0.45,
    );
    if (last && Math.abs(last[0].y - glyph.y) <= tolerance) {
      last.push(glyph);
    } else {
      lines.push([glyph]);
    }
  }
  return lines;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function findGutter(lines: Glyph[][]): number | null {
  const gaps: number[] = [];
  for (const line of lines) {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const gap = sorted[i].x - (previous.x + previous.w);
      if (gap > 28) gaps.push(previous.x + previous.w + gap / 2);
    }
  }
  if (gaps.length < 3) return null;
  const center = median(gaps);
  const clustered = gaps.filter((gap) => Math.abs(gap - center) <= 20);
  if (clustered.length < Math.max(3, lines.length * 0.25)) return null;
  return median(clustered);
}

function linesToText(lines: Glyph[][]): string {
  const rendered: string[] = [];
  for (const line of lines) {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    let text = "";
    let cursor = Number.NEGATIVE_INFINITY;
    for (const glyph of sorted) {
      const gap = glyph.x - cursor;
      const needsSpace =
        text.length > 0 &&
        !/\s$/.test(text) &&
        !/^\s/.test(glyph.str) &&
        gap > Math.max(1.5, glyph.h * 0.18);
      if (needsSpace) text += " ";
      text += glyph.str;
      cursor = glyph.x + Math.max(glyph.w, 0);
    }
    const trimmed = text.replace(/[ \t]+/g, " ").trim();
    if (!trimmed) continue;
    const previous = rendered[rendered.length - 1];
    if (previous && /[A-Za-z]-$/.test(previous) && /^[a-z]/.test(trimmed)) {
      rendered[rendered.length - 1] = previous.slice(0, -1) + trimmed;
    } else {
      rendered.push(trimmed);
    }
  }
  return rendered.join(" ");
}

function glyphsToText(glyphs: Glyph[]): string {
  if (glyphs.length === 0) return "";
  const provisional = clusterLines(glyphs);
  const gutter = findGutter(provisional);
  const columns = gutter
    ? [
        glyphs.filter((glyph) => glyph.x + glyph.w / 2 < gutter),
        glyphs.filter((glyph) => glyph.x + glyph.w / 2 >= gutter),
      ].filter((column) => column.length > 0)
    : [glyphs];
  return columns
    .map((column) => linesToText(clusterLines(column)))
    .filter(Boolean)
    .join(" ");
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String(error.name);
  }
  return "";
}

export async function extractPdfText(
  data: ArrayBuffer,
  fileName: string,
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/standard_fonts/",
    verbosity: 0,
  });

  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const glyphs: Glyph[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const textItem = item as TextItem;
        if (!textItem.str) continue;
        const [x, y] = viewport.convertToViewportPoint(
          textItem.transform[4],
          textItem.transform[5],
        );
        const height = Math.abs(textItem.height) || Math.abs(textItem.transform[3]) || 12;
        glyphs.push({
          str: textItem.str,
          x,
          y,
          w: textItem.width,
          h: height,
        });
      }
      const pageText = glyphsToText(glyphs);
      if (pageText) pages.push(pageText);
    }
    await doc.cleanup();
    return pages.join("\n");
  } catch (error) {
    const name = errorName(error);
    if (name === "PasswordException") {
      throw new ExtractError(
        `“${fileName}” is password-protected, so its text cannot be read here.`,
      );
    }
    if (name === "InvalidPDFException") {
      throw new ExtractError(
        `“${fileName}” is not a readable PDF. It may be damaged or not a PDF at all.`,
      );
    }
    if (error instanceof ExtractError) throw error;
    console.error(error);
    throw new ExtractError(
      `Could not read “${fileName}”. The file may be damaged or protected.`,
    );
  }
}
