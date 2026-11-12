export type BookSource = { sourceBook: string; lessonNumbers: readonly number[] };
export type BookWord = { sourceBook?: string | null; lessonNumber?: number | null; bookSources?: readonly BookSource[]; personalBooks?: readonly string[] };
export const normalizeBook = (title: string) => title.normalize("NFC").trim().replace(/\s+/gu, " ");
const bookKey = (title: string) => normalizeBook(title).toLocaleLowerCase("de");
export function bookOptions(words: readonly BookWord[]) {
  const titles = new Map<string, string>();
  for (const word of words) for (const title of [word.sourceBook, ...(word.bookSources ?? []).map(source => source.sourceBook), ...(word.personalBooks ?? [])]) {
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
export function sharedBookSources(word: BookWord): BookSource[] {
  const rows = new Map<string, { sourceBook: string; lessonNumbers: Set<number> }>();
  for (const source of [...(word.bookSources ?? []), ...(word.sourceBook ? [{ sourceBook: word.sourceBook, lessonNumbers: word.lessonNumber == null ? [] : [word.lessonNumber] }] : [])]) {
    const title = normalizeBook(source.sourceBook), key = bookKey(title);
    if (!title) continue;
    const row = rows.get(key) ?? { sourceBook: title, lessonNumbers: new Set<number>() };
    for (const number of source.lessonNumbers) if (Number.isInteger(number) && number > 0 && number <= 10000) row.lessonNumbers.add(number);
    rows.set(key, row);
  }
  return [...rows.values()].map(row => ({ sourceBook: row.sourceBook, lessonNumbers: [...row.lessonNumbers].sort((a,b) => a-b) })).sort((a,b) => a.sourceBook.localeCompare(b.sourceBook, "de"));
}
export function lessonsForBook(word: BookWord, filter: string): number[] {
  if (!matchesBook(word, filter)) return [];
  const rows = sharedBookSources(word).filter(row => !filter || filter === "none" || "book:" + bookKey(row.sourceBook) === filter);
  const values = rows.flatMap(row => row.lessonNumbers);
  if ((!filter || filter === "none") && !word.sourceBook && word.lessonNumber != null) values.push(word.lessonNumber);
  return [...new Set(values)].sort((a,b) => a-b);
}
export function matchesLesson(word: BookWord, book: string, lesson: string): boolean {
  if (!matchesBook(word, book)) return false;
  if (!lesson || lesson === "all") return true;
  const numbers = lessonsForBook(word, book);
  return lesson === "none" ? numbers.length === 0 : numbers.includes(Number(lesson));
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

export type LibraryWord = BookWord & { lessonNumber: number | null };
export function filterLibraryWords<T extends LibraryWord>(words: readonly T[], book: string, lesson: string): T[] {
  return words.filter(word => matchesLesson(word, book, lesson));
}
export function libraryLessons(words: readonly LibraryWord[], book: string, selected: string): number[] {
  const lessons = new Set(words.flatMap(word => lessonsForBook(word, book)));
  if (/^[1-9][0-9]*$/.test(selected)) lessons.add(Number(selected));
  return [...lessons].sort((a, b) => a - b);
}
