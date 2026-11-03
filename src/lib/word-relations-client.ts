type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
export type RelatedCard = {
  id: string; german: string; article: "der" | "die" | "das" | "none";
  selectedTranslation: { language: string; text: string | null };
  notes?: string | null; pluralForm?: string | null;
};
export type RelatedExample = { id: string; german: string; selectedTranslation: { language: string; text: string | null } };
function validTranslation(value: unknown): boolean {
  const row = value as RelatedCard["selectedTranslation"] | undefined;
  return !!row && typeof row.language === "string" && (row.text === null || typeof row.text === "string");
}
function card(value: unknown): value is RelatedCard {
  const row = value as RelatedCard | undefined;
  return !!row && typeof row.id === "string" && !!row.id && typeof row.german === "string" && ["der", "die", "das", "none"].includes(row.article) && validTranslation(row.selectedTranslation) && (row.notes == null || typeof row.notes === "string") && (row.pluralForm == null || typeof row.pluralForm === "string");
}
export class WordRelationsClient {
  private readonly fetcher: Fetcher;
  constructor(fetcher: Fetcher) { this.fetcher = fetcher; }
  private async read(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.fetcher(path, { signal, cache: "no-store" });
    if (!response.ok) throw Object.assign(new Error("Не удалось загрузить связанные слова"), { status: response.status });
    return response.json();
  }
  async list(id: string, signal?: AbortSignal): Promise<RelatedCard[]> {
    const data = await this.read(`/words/${encodeURIComponent(id)}/relations`, signal);
    if (!Array.isArray(data) || !data.every(card) || data.some(row => row.id === id) || new Set(data.map(row => row.id)).size !== data.length) throw new Error("Не удалось загрузить связанные слова");
    return data;
  }
  async set(id: string, relatedId: string, linked: boolean): Promise<void> {
    const valid = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/.test(value);
    if (!valid(id) || !valid(relatedId) || id === relatedId) throw Object.assign(new Error("Не удалось сохранить связь слов"), { status: 400 });
    const response = await this.fetcher(`/words/${encodeURIComponent(id)}/relations/${encodeURIComponent(relatedId)}`, { method: linked ? "PUT" : "DELETE", cache: "no-store" });
    if (!response.ok) throw Object.assign(new Error("Не удалось сохранить связь слов"), { status: response.status });
    const data = await response.json().catch(() => null);
    if (!data || (linked ? data.linked !== true : data.deleted !== true)) throw Object.assign(new Error("Не удалось подтвердить изменение связи. Обновите список связей."), { status: 502 });
  }
  async detail(id: string, signal?: AbortSignal): Promise<{ word: RelatedCard; examples: RelatedExample[] }> {
    const [word, examples] = await Promise.all([this.read(`/words/${encodeURIComponent(id)}`, signal), this.read(`/words/${encodeURIComponent(id)}/examples`, signal)]);
    if (!card(word) || word.id !== id || !Array.isArray(examples) || !examples.every(row => row && typeof row.id === "string" && typeof row.german === "string" && validTranslation(row.selectedTranslation))) throw new Error("Не удалось загрузить связанные слова");
    return { word, examples };
  }
}
