export type DictionaryEntry = { isFavorite: boolean; isArchived: boolean; isDifficult?: boolean; revision: string };
export type DictionaryView = "active" | "favorites" | "difficult" | "archive" | "all";
type EntryWord = { dictionaryEntry?: DictionaryEntry };
export function matchesDictionaryView(word: EntryWord, view: DictionaryView): boolean {
  const archived = word.dictionaryEntry?.isArchived === true;
  return view === "all" || (view === "archive" ? archived : !archived && (view === "favorites" ? word.dictionaryEntry?.isFavorite === true : view === "difficult" ? word.dictionaryEntry?.isDifficult === true : true));
}
export function activeTrainingWords<T extends EntryWord>(words: readonly T[]): T[] { return words.filter(word => word.dictionaryEntry?.isArchived !== true); }
export function supportsDifficultWords(words: readonly EntryWord[]): boolean { return words.some(word => typeof word.dictionaryEntry?.isDifficult === "boolean"); }
export function difficultTrainingWords<T extends EntryWord>(words: readonly T[]): T[] { return activeTrainingWords(words).filter(word => word.dictionaryEntry?.isDifficult === true); }
export class DictionaryEntryError extends Error {
  readonly status: number;
  constructor(status: number) { super(status === 409 ? "Настройки слова изменились. Обновите словарь." : "Не удалось изменить настройки слова. Обновите словарь."); this.status = status; }
}
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
export class DictionaryEntryClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }
  async save(wordId: string, entry: DictionaryEntry, patch: { isFavorite?: boolean; isArchived?: boolean; isDifficult?: boolean }): Promise<DictionaryEntry> {
    if (typeof wordId !== "string" || !/^[A-Za-z0-9_-]{1,191}$/.test(wordId) || !entry || typeof entry.revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(entry.revision) ||
      !patch || !Object.keys(patch).length || Object.entries(patch).some(([key,value]) => !["isFavorite","isArchived","isDifficult"].includes(key) || typeof value !== "boolean")) throw new DictionaryEntryError(400);
    if ((entry.isDifficult !== undefined && typeof entry.isDifficult !== "boolean") || (Object.hasOwn(patch, "isDifficult") && typeof entry.isDifficult !== "boolean")) throw new DictionaryEntryError(400);
    const response = await this.request(`/words/${encodeURIComponent(wordId)}/dictionary-settings`, { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, revision: entry.revision }) });
    if (!response.ok) throw new DictionaryEntryError(response.status);
    const result = await response.json().catch(() => null);
    if (!result || result.wordId !== wordId || typeof result.isFavorite !== "boolean" || typeof result.isArchived !== "boolean" || typeof result.revision !== "string" || result.revision === entry.revision || !/^[A-Za-z0-9_-]{1,64}$/.test(result.revision) ||
      Object.entries(patch).some(([key,value]) => result[key] !== value) ||
      (result.isDifficult !== undefined && typeof result.isDifficult !== "boolean") ||
      (typeof entry.isDifficult === "boolean" && (typeof result.isDifficult !== "boolean" || (patch.isDifficult === undefined && result.isDifficult !== entry.isDifficult)))) throw new DictionaryEntryError(502);
    return { isFavorite: result.isFavorite, isArchived: result.isArchived, revision: result.revision, ...(typeof result.isDifficult === "boolean" ? { isDifficult: result.isDifficult } : {}) };
  }
}
