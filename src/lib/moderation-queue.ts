import type { ModerationWord } from "./moderation-client";
export const MODERATION_PAGE_SIZE = 30;
const normalized = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("de");

export function moderationQueue(words: readonly ModerationWord[], query: string, lesson: string, requestedPage: number) {
  const terms = normalized(query).split(/\s+/u).filter(Boolean);
  const matches = words.filter(word => {
    if (lesson !== "all" && String(word.lessonNumber) !== lesson) return false;
    const text = normalized([word.article === "none" ? "" : word.article, word.german, word.pluralForm ?? "", word.notes ?? "", ...word.translations.map(row => row.text)].join(" "));
    return terms.every(term => text.includes(term));
  });
  const pages = Math.max(1, Math.ceil(matches.length / MODERATION_PAGE_SIZE));
  const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0, pages - 1));
  return { matches, page, pages, items: matches.slice(page * MODERATION_PAGE_SIZE, (page + 1) * MODERATION_PAGE_SIZE) };
}

export function adjacentModerationWord(words: readonly Pick<ModerationWord, "id">[], id: string, direction: -1 | 1): string | null {
  const index = words.findIndex(word => word.id === id);
  return index < 0 ? null : words[index + direction]?.id ?? null;
}
