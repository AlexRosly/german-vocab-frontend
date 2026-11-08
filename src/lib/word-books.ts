export type BookWord = { sourceBook?: string | null; personalBooks?: readonly string[] };
export const normalizeBook = (title: string) => title.normalize("NFC").trim().replace(/\s+/gu, " ");
const bookKey = (title: string) => normalizeBook(title).toLocaleLowerCase("de");
export function bookOptions(words: readonly BookWord[]) {
  const titles = new Map<string, string>();
  for (const word of words) for (const title of [word.sourceBook, ...(word.personalBooks ?? [])]) {
    if (title?.trim() && !titles.has(bookKey(title))) titles.set(bookKey(title), normalizeBook(title));
  }
  return [...titles].map(([key, title]) => ({ key: "book:" + key, title })).sort((a, b) => a.title.localeCompare(b.title, "de"));
}
export function bookFilterOptions(words: readonly BookWord[], selected: string) {
  const options = bookOptions(words);
  return selected.startsWith("book:") && !options.some(book => book.key === selected)
    ? [...options, { key: selected, title: selected.slice(5) }] : options;
}
export function matchesBook(word: BookWord, filter: string) {
  if (!filter) return true;
  const options = bookOptions([word]);
  return filter === "none" ? options.length === 0 : options.some(book => book.key === filter);
}
export type PersonalBooks = { wordId: string; titles: string[]; revision: string | null };
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
export class BooksError extends Error {
  readonly status: number;
  constructor(status: number) { super(status === 409 ? "Книги изменились. Загрузите актуальную версию." : "Не удалось загрузить или сохранить книги"); this.status = status; }
}
export function normalizeTitles(titles: readonly string[]) {
  if (!Array.isArray(titles) || titles.length > 20 || titles.some(title => typeof title !== "string")) throw new BooksError(400);
  const normalized = titles.map(normalizeBook);
  if (normalized.some(title => !title || [...title].length > 120 || /\p{Cc}/u.test(title)) || new Set(normalized.map(bookKey)).size !== normalized.length) throw new BooksError(400);
  return normalized;
}
export class PersonalBooksClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }
  private path(wordId: string) { if (!/^[A-Za-z0-9_-]{1,191}$/.test(wordId)) throw new BooksError(400); return `/words/${encodeURIComponent(wordId)}/personal-books`; }
  private async read(response: Response, wordId: string): Promise<PersonalBooks> {
    if (!response.ok) throw new BooksError(response.status);
    const value = await response.json().catch(() => null);
    if (!value || value.wordId !== wordId || !Array.isArray(value.titles)) throw new BooksError(502);
    let titles: string[]; try { titles = normalizeTitles(value.titles); } catch { throw new BooksError(502); }
    if (titles.length === 0 ? value.revision !== null : typeof value.revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value.revision)) throw new BooksError(502);
    return { wordId, titles, revision: value.revision };
  }
  async get(wordId: string, signal?: AbortSignal) { return this.read(await this.request(this.path(wordId), { signal, cache: "no-store" }), wordId); }
  async save(wordId: string, titles: readonly string[], revision: string | null, signal?: AbortSignal) {
    const path = this.path(wordId), normalized = normalizeTitles(titles);
    if (revision !== null && (typeof revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(revision))) throw new BooksError(400);
    const result = await this.read(await this.request(path, { method: "PUT", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titles: normalized, revision }) }), wordId);
    if (JSON.stringify(result.titles) !== JSON.stringify(normalized)) throw new BooksError(502);
    return result;
  }
}
