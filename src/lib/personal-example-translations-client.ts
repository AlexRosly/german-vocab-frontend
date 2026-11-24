export type PersonalExampleTranslation = { wordId: string; exampleId: string; language: string; german: string; commonText: string | null; text: string | null; revision: string | null; sourceGerman: string | null; stale: boolean };
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
export const normalizeExampleTranslation = (text: string) => text.normalize("NFC").replace(/\r\n?/g, "\n").trim();
export class PersonalExampleTranslationError extends Error {
  readonly status: number;
  constructor(status: number) { super(status === 409 ? "Личный перевод изменился. Загрузите актуальную версию." : status === 503 || status === 404 ? "Личные переводы примеров пока недоступны" : "Не удалось загрузить или сохранить личный перевод примера"); this.status = status; }
}
export class PersonalExampleTranslationsClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }
  private path(wordId: string, exampleId: string, language: string) {
    if (![wordId, exampleId].every(id => /^[A-Za-z0-9_-]{1,191}$/.test(id)) || !/^[a-z]{2}$/.test(language)) throw new PersonalExampleTranslationError(400);
    return `/words/${encodeURIComponent(wordId)}/examples/${encodeURIComponent(exampleId)}/personal-translations/${language}`;
  }
  private async read(response: Response, wordId: string, exampleId: string, language: string): Promise<PersonalExampleTranslation> {
    if (!response.ok) throw new PersonalExampleTranslationError(response.status);
    const row = await response.json().catch(() => null) as PersonalExampleTranslation | null;
    const text = (value: unknown) => typeof value === "string" && !!value.trim() && [...value].length <= 1000;
    if (!row || row.wordId !== wordId || row.exampleId !== exampleId || row.language !== language || !text(row.german) || (row.commonText !== null && !text(row.commonText)) || typeof row.stale !== "boolean" ||
      (row.text === null ? row.revision !== null || row.sourceGerman !== null || row.stale : !text(row.text) || !text(row.sourceGerman) || typeof row.revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(row.revision) || row.stale !== (row.sourceGerman !== row.german))) throw new PersonalExampleTranslationError(502);
    return row;
  }
  get(wordId: string, exampleId: string, language: string, signal?: AbortSignal) {
    return this.request(this.path(wordId, exampleId, language), { signal, cache: "no-store" }).then(r => this.read(r, wordId, exampleId, language));
  }
  async save(wordId: string, exampleId: string, language: string, text: string, revision: string | null, sourceGerman: string, signal?: AbortSignal) {
    const path = this.path(wordId, exampleId, language);
    if (typeof text !== "string" || typeof sourceGerman !== "string" || !sourceGerman.trim() || [...sourceGerman].length > 1000 || (revision !== null && (typeof revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(revision)))) throw new PersonalExampleTranslationError(400);
    const normalized = normalizeExampleTranslation(text); if ([...normalized].length > 1000) throw new PersonalExampleTranslationError(400);
    const result = await this.read(await this.request(path, { method: "PUT", cache: "no-store", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: normalized, revision, sourceGerman }) }), wordId, exampleId, language);
    if (result.text !== (normalized || null) || result.german !== sourceGerman || result.stale) throw new PersonalExampleTranslationError(502);
    return result;
  }
}
