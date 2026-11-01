export type PersonalNote = { wordId: string; text: string | null; revision: string | null };
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
export const normalizeNote = (text: string) => text.replace(/\r\n?/g, "\n").trim();
export class PersonalNoteError extends Error {
  readonly status: number;
  constructor(status: number) { super(status === 409 ? "Личная заметка изменилась. Загрузите актуальную версию." : "Не удалось загрузить или сохранить личную заметку"); this.status = status; }
}
export class PersonalNotesClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }
  private path(wordId: string) { if (!/^[A-Za-z0-9_-]{1,191}$/.test(wordId)) throw new PersonalNoteError(400); return `/words/${encodeURIComponent(wordId)}/personal-note`; }
  private async read(response: Response, wordId: string): Promise<PersonalNote> {
    if (!response.ok) throw new PersonalNoteError(response.status);
    const value: unknown = await response.json().catch(() => null);
    if (!value || typeof value !== "object") throw new PersonalNoteError(502);
    const note = value as PersonalNote;
    if (note.wordId !== wordId || (note.text === null ? note.revision !== null : typeof note.text !== "string" ||
      !note.text.trim() || [...note.text].length > 2000 || typeof note.revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(note.revision))) throw new PersonalNoteError(502);
    return { wordId, text: note.text, revision: note.revision };
  }
  async get(wordId: string, signal?: AbortSignal) { return this.read(await this.request(this.path(wordId), { signal, cache: "no-store" }), wordId); }
  async save(wordId: string, text: string, revision: string | null, signal?: AbortSignal) {
    const path = this.path(wordId);
    if (typeof text !== "string") throw new PersonalNoteError(400);
    const normalized = normalizeNote(text);
    if ([...normalized].length > 2000 || (revision !== null && (typeof revision !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(revision)))) throw new PersonalNoteError(400);
    const note = await this.read(await this.request(path, { method: "PUT", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: normalized, revision }) }), wordId);
    if (note.text !== (normalized || null)) throw new PersonalNoteError(502);
    return note;
  }
}
