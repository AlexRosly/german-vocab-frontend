import type { ModerationWord } from "./moderation-client";

export function relationCandidates(words: readonly ModerationWord[], wordId: string, linkedIds: ReadonlySet<string>, query: string) {
  if (!query.trim()) return [];
  const unique = [...new Map(words.map(word => [word.id, word])).values()];
  const terms = query.normalize("NFC").trim().toLocaleLowerCase("de").split(/\s+/u);
  return unique.filter(word => {
    if (word.id === wordId || linkedIds.has(word.id)) return false;
    const text = [word.article === "none" ? "" : word.article, word.german, ...word.translations.map(row => row.text)].join(" ").normalize("NFC").toLocaleLowerCase("de");
    return terms.every(term => text.includes(term));
  }).slice(0, 10);
}
