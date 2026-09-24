import { ExtractError } from "@/lib/extract-error";
import { extractEpubText } from "@/lib/extract-epub";
import { extractPdfText } from "@/lib/extract-pdf";
import { tokenize } from "@/lib/tokenize";

export type OpenedText = {
  name: string;
  words: string[];
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
  if (isPdf(file)) {
    text = await extractPdfText(buffer, file.name);
  } else if (isEpub(file)) {
    text = await extractEpubText(buffer, file.name);
  } else {
    throw new ExtractError(
      `Open a PDF or EPUB. “${file.name}” is a different kind of file.`,
    );
  }

  const words = tokenize(text);
  if (words.length === 0) {
    throw new ExtractError(
      `No extractable text in “${file.name}”. If this is a scanned document, it has no text layer to read.`,
    );
  }
  return { name: file.name, words };
}
