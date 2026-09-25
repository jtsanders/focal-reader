import { ExtractError } from "@/lib/extract-error";
import { extractEpubText } from "@/lib/extract-epub";
import { extractPdfText } from "@/lib/extract-pdf";
import { readDocument, type Chapter, type ReadingToken } from "@/lib/tokenize";

export type OpenedText = {
  name: string;
  words: ReadingToken[];
  chapters: Chapter[];
};

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function isEpub(file: File): boolean {
  return (
    file.type === "application/epub+zip" ||
    file.name.toLowerCase().endsWith(".epub")
  );
}

export async function openBookFile(file: File): Promise<OpenedText> {
  const buffer = await file.arrayBuffer();
  let text: string;
  let chapters: Chapter[] = [];
  if (isPdf(file)) {
    const extracted = await extractPdfText(buffer, file.name);
    text = extracted.text;
    chapters = extracted.chapters;
  } else if (isEpub(file)) {
    text = await extractEpubText(buffer, file.name);
  } else {
    throw new ExtractError(
      `Open a PDF or EPUB. “${file.name}” is a different kind of file.`,
    );
  }

  const document = readDocument(text);
  if (chapters.length === 0) chapters = document.chapters;
  const words = document.words;
  if (words.length === 0) {
    throw new ExtractError(
      `No extractable text in “${file.name}”. If this is a scanned document, it has no text layer to read.`,
    );
  }
  return { name: file.name, words, chapters };
}
