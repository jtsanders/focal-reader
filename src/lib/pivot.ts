export type PivotParts = {
  before: string;
  pivot: string;
  after: string;
};

const relevantPattern = /[\p{L}\p{N}]/u;
const markPattern = /\p{M}/u;

type Grapheme = {
  text: string;
  relevant: boolean;
};

function graphemes(token: string): Grapheme[] {
  const chars: Grapheme[] = [];
  for (const char of token) {
    if (markPattern.test(char) && chars.length > 0) {
      chars[chars.length - 1].text += char;
      continue;
    }
    chars.push({ text: char, relevant: relevantPattern.test(char) });
  }
  return chars;
}

/**
 * Pivot among letters and digits only. Punctuation stays attached to the
 * token but is not chosen unless the token has no letters or digits.
 * Index: Math.floor((relevantLength - 1) / 2).
 */
export function splitPivot(token: string): PivotParts {
  const chars = graphemes(token);
  if (chars.length === 0) {
    return { before: "", pivot: "", after: "" };
  }

  const relevantIndexes = chars.flatMap((char, index) =>
    char.relevant ? [index] : [],
  );
  const pool =
    relevantIndexes.length > 0
      ? relevantIndexes
      : chars.map((_, index) => index);
  const pivotIndex = pool[Math.floor((pool.length - 1) / 2)] ?? 0;

  return {
    before: chars
      .slice(0, pivotIndex)
      .map((char) => char.text)
      .join(""),
    pivot: chars[pivotIndex]?.text ?? "",
    after: chars
      .slice(pivotIndex + 1)
      .map((char) => char.text)
      .join(""),
  };
}
