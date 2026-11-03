export type PersonalTranslation = { wordId: string; language: string; text: string | null; revision: string | null };
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
export const normalizePersonalTranslation = (text: string) => text.normalize("NFC").replace(/\r\n?/g, "\n").trim();
export class PersonalTranslationError extends Error {
  readonly status: number;
  constructor(status: number) { super(status === 409 ? "Личный перевод изменился. Загрузите актуальную версию." : "Не удалось загрузить или сохранить личный перевод"); this.status = status; }
}
export class PersonalTranslationsClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }
  private path(wordId: string, language: string) { if (!/^[A-Za-z0-9_-]{1,191}$/.test(wordId) || !/^[a-z]{2}$/.test(language)) throw new PersonalTranslationError(400); return `/words/${encodeURIComponent(wordId)}/personal-translations/${encodeURIComponent(language)}`; }
  private async read(response: Response, wordId: string, language: string): Promise<PersonalTranslation> {
    if (!response.ok) throw new PersonalTranslationError(response.status);
    const value: unknown = await response.json().catch(() => null);
    if (!value || typeof value !== "object") throw new PersonalTranslationError(502);
    const note = value as PersonalTranslation;
    if (note.wordId !== wordId || note.language !== language || (note.text === null ? note.revision !== null : typeof note.text !== "string" ||
      !note.text.trim() || [...note.text].length > 1000 || typeof note.revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(note.revision))) throw new PersonalTranslationError(502);
    return { wordId, language, text: note.text, revision: note.revision };
  }
  async get(wordId: string, language: string, signal?: AbortSignal) { return this.read(await this.request(this.path(wordId, language), { signal, cache: "no-store" }), wordId, language); }
  async save(wordId: string, language: string, text: string, revision: string | null, signal?: AbortSignal) {
    const path = this.path(wordId, language);
    if (typeof text !== "string") throw new PersonalTranslationError(400);
    const normalized = normalizePersonalTranslation(text);
    if ([...normalized].length > 1000 || (revision !== null && (typeof revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(revision)))) throw new PersonalTranslationError(400);
    const note = await this.read(await this.request(path, { method: "PUT", signal, cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: normalized, revision }) }), wordId, language);
    if (note.text !== (normalized || null)) throw new PersonalTranslationError(502);
    return note;
  }
}
