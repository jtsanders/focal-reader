export function tokenize(text: string): string[] {
  const cleaned = text.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, "");
  return cleaned.split(/\s+/).filter((token) => token.length > 0);
}
