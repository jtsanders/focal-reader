export type Pause = "none" | "sentence" | "paragraph" | "chapter";

export type ReadingToken = {
  text: string;
  pause: Pause;
};

export type Chapter = {
  title: string;
  index: number;
  depth: number;
};

const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "fig",
  "al",
  "approx",
  "dept",
  "est",
  "vol",
  "no",
  "eg",
  "ie",
  "cf",
]);

function endsSentence(token: string): boolean {
  const trimmed = token.replace(/['"”’)\]]+$/u, "");
  if (!trimmed) return false;
  if (/[!?…]$/u.test(trimmed) || trimmed.endsWith("...")) return true;
  if (!trimmed.endsWith(".")) return false;
  const bare = trimmed.slice(0, -1);
  if (/^[A-Za-z]$/.test(bare)) return false;
  if (ABBREVIATIONS.has(bare.toLowerCase().replace(/\./g, ""))) return false;
  if (/\./.test(bare) && bare.length <= 6) return false;
  return true;
}

function wordsIn(block: string): string[] {
  return block
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, "")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function tokenizePlain(text: string): ReadingToken[] {
  const cleaned = text.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, "");
  const chapters = cleaned.split("\f");
  const tokens: ReadingToken[] = [];

  chapters.forEach((chapter, chapterIndex) => {
    const paragraphs = chapter.split(/\n\s*\n/).filter((block) => block.trim().length > 0);
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const words = wordsIn(paragraph);
      words.forEach((word, wordIndex) => {
        const endOfParagraph = wordIndex === words.length - 1;
        const endOfChapter =
          endOfParagraph &&
          paragraphIndex === paragraphs.length - 1 &&
          chapterIndex < chapters.length - 1;
        let pause: Pause = "none";
        if (endOfChapter) pause = "chapter";
        else if (endOfParagraph) pause = "paragraph";
        else if (endsSentence(word)) pause = "sentence";
        tokens.push({ text: word, pause });
      });
    });
  });

  return tokens;
}

export function readDocument(text: string): {
  words: ReadingToken[];
  chapters: Chapter[];
} {
  const pieces = text.split("\u0001");
  const words: ReadingToken[] = [];
  const chapters: Chapter[] = [];
  let pendingTitle: string | null = null;
  let pendingDepth = 0;

  for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
    const piece = pieces[pieceIndex] ?? "";
    if (pieceIndex % 2 === 1) {
      const splitAt = piece.indexOf("\u0002");
      let depth = 0;
      let title = piece;
      if (splitAt > 0 && /^\d+$/.test(piece.slice(0, splitAt))) {
        depth = Number(piece.slice(0, splitAt));
        title = piece.slice(splitAt + 1);
      }
      pendingTitle = title.replace(/\s+/g, " ").trim();
      pendingDepth = depth;
      continue;
    }
    if (pendingTitle) {
      const last = chapters[chapters.length - 1];
      if (!last || last.index !== words.length || last.title !== pendingTitle) {
        chapters.push({
          title: pendingTitle,
          index: words.length,
          depth: pendingDepth,
        });
      }
      pendingTitle = null;
      pendingDepth = 0;
    }
    words.push(...tokenizePlain(piece));
  }

  return { words, chapters };
}

export function tokenize(text: string): ReadingToken[] {
  return readDocument(text).words;
}
