import type { RelatedCard } from "./word-relations-client";
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
const idPattern = /^[A-Za-z0-9._-]{1,191}$/;
function valid(value: unknown): value is RelatedCard {
  const card = value as RelatedCard | undefined;
  return !!card && typeof card.id === "string" && idPattern.test(card.id) && typeof card.german === "string" &&
    ["der", "das", "die", "none"].includes(card.article) && !!card.selectedTranslation &&
    typeof card.selectedTranslation.language === "string" && (card.selectedTranslation.text === null || typeof card.selectedTranslation.text === "string");
}
export class DraftRelationsClient {
  private readonly fetcher: Fetcher;
  constructor(fetcher: Fetcher) { this.fetcher = fetcher; }
  async search(query: string, own: readonly RelatedCard[], signal?: AbortSignal): Promise<RelatedCard[]> {
    const text = query.normalize("NFC").trim().slice(0, 200);
    if (!text) return [];
    const response = await this.fetcher(`/words?q=${encodeURIComponent(text)}`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить связанные слова");
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(valid)) throw new Error("Не удалось загрузить связанные слова");
    const needle = text.toLocaleLowerCase("de");
    const local = own.filter(card => [card.german, card.selectedTranslation.text ?? ""].join(" ").normalize("NFC").toLocaleLowerCase("de").includes(needle));
    return [...new Map([...data, ...local].map(card => [card.id, card])).values()];
  }
}
