import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";

import { ExtractError } from "@/lib/extract-error";
import { readDocument, type Chapter } from "@/lib/tokenize";

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

type RenderedLine = {
  text: string;
  y: number;
  h: number;
};

function isChapterHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return false;
  if (/^chapter\s+([0-9]+|[ivxlcdm]+)\b/i.test(trimmed)) return true;
  if (/^(book|part)\s+([0-9]+|[ivxlcdm]+)\b/i.test(trimmed)) return true;
  return /^(prologue|epilogue|foreword|preface|introduction|afterword)$/i.test(
    trimmed,
  );
}

function linesToText(lines: Glyph[][]): { text: string; headings: Chapter[] } {
  const rendered: RenderedLine[] = [];
  for (const line of lines) {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    let text = "";
    let cursor = Number.NEGATIVE_INFINITY;
    let height = 12;
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
      height = Math.max(height, glyph.h);
    }
    const trimmed = text.replace(/[ \t]+/g, " ").trim();
    if (!trimmed) continue;
    const previous = rendered[rendered.length - 1];
    if (previous && /[A-Za-z]-$/.test(previous.text) && /^[a-z]/.test(trimmed)) {
      previous.text = previous.text.slice(0, -1) + trimmed;
    } else {
      rendered.push({ text: trimmed, y: sorted[0]?.y ?? 0, h: height });
    }
  }
  if (rendered.length === 0) return { text: "", headings: [] };

  const gaps: number[] = [];
  for (let index = 1; index < rendered.length; index += 1) {
    const gap = rendered[index].y - rendered[index - 1].y;
    if (gap > 0) gaps.push(gap);
  }
  const typical = gaps.length > 0 ? median(gaps) : rendered[0].h * 1.4;

  let out = "";
  const headings: Chapter[] = [];
  for (let index = 0; index < rendered.length; index += 1) {
    const line = rendered[index];
    if (index > 0) {
      const previous = rendered[index - 1];
      const gap = line.y - previous.y;
      const paragraph = gap > typical * 1.65 && gap > previous.h * 1.45;
      if (isChapterHeading(line.text)) out += "\f";
      else if (paragraph) out += "\n\n";
      else out += " ";
    }
    if (isChapterHeading(line.text)) {
      headings.push({
        title: line.text.trim(),
        index: readDocument(out).words.length,
        depth: 0,
      });
    }
    out += line.text;
  }
  return { text: out, headings };
}

function glyphsToText(glyphs: Glyph[]): { text: string; headings: Chapter[] } {
  if (glyphs.length === 0) return { text: "", headings: [] };
  const provisional = clusterLines(glyphs);
  const gutter = findGutter(provisional);
  const columns = gutter
    ? [
        glyphs.filter((glyph) => glyph.x + glyph.w / 2 < gutter),
        glyphs.filter((glyph) => glyph.x + glyph.w / 2 >= gutter),
      ].filter((column) => column.length > 0)
    : [glyphs];
  let text = "";
  const headings: Chapter[] = [];
  for (const column of columns) {
    const part = linesToText(clusterLines(column));
    if (!part.text) continue;
    const base = readDocument(text).words.length;
    if (text) text += " ";
    headings.push(
      ...part.headings.map((heading) => ({
        ...heading,
        index: base + heading.index,
      })),
    );
    text += part.text;
  }
  return { text, headings };
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String(error.name);
  }
  return "";
}

type OutlineNode = {
  title?: string;
  dest?: unknown;
  items?: OutlineNode[];
};

async function destinationPage(
  doc: PDFDocumentProxy,
  dest: unknown,
): Promise<number | null> {
  try {
    let explicit = dest;
    if (typeof explicit === "string") explicit = await doc.getDestination(explicit);
    if (!Array.isArray(explicit) || explicit[0] == null) return null;
    return await doc.getPageIndex(explicit[0]);
  } catch {
    return null;
  }
}

async function outlineChapters(
  doc: PDFDocumentProxy,
  pageWordStart: number[],
): Promise<Chapter[]> {
  let outline: OutlineNode[] | null = null;
  try {
    outline = await doc.getOutline();
  } catch {
    return [];
  }
  if (!outline) return [];
  const chapters: Chapter[] = [];
  const walk = async (items: OutlineNode[], depth: number) => {
    for (const item of items) {
      const title = item.title?.replace(/\s+/g, " ").trim();
      const pageIndex = await destinationPage(doc, item.dest);
      if (title && pageIndex != null && pageWordStart[pageIndex] != null) {
        const index = pageWordStart[pageIndex];
        const last = chapters[chapters.length - 1];
        if (!last || last.index !== index || last.title !== title) {
          chapters.push({ title, index, depth });
        }
      }
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return chapters;
}

export async function extractPdfText(
  data: ArrayBuffer,
  fileName: string,
): Promise<{ text: string; chapters: Chapter[] }> {
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
    const pageWordStart: number[] = [];
    const headingChapters: Chapter[] = [];
    let wordCount = 0;
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
      pageWordStart.push(wordCount);
      const pageText = glyphsToText(glyphs);
      if (!pageText.text) continue;
      headingChapters.push(
        ...pageText.headings.map((heading) => ({
          ...heading,
          index: wordCount + heading.index,
        })),
      );
      pages.push(pageText.text);
      wordCount += readDocument(pageText.text).words.length;
    }
    const outline = await outlineChapters(doc, pageWordStart);
    await doc.cleanup();
    return {
      text: pages.join("\n\n"),
      chapters: outline.length > 0 ? outline : headingChapters,
    };
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
