type Requester = (path: string, init?: RequestInit) => Promise<Response>;
export type AuditEvent = { id: string; wordId: string; wordGerman: string; entity: string; action: "INSERT" | "UPDATE" | "DELETE"; before: Record<string, unknown> | null; after: Record<string, unknown> | null; actor: "system" | "admin" | "user"; transactionId: string; createdAt: string };
export type AuditPage = { page: number; pageSize: 25; total: number; items: AuditEvent[] };
export const AUDIT_ENTITIES = ['words','word_translations','word_examples','word_example_translations','word_relations','word_source_books','word_verb_forms','word_collocations','word_collocation_translations','word_images'];
const object = (x: unknown) => x === null || !!x && typeof x === 'object' && !Array.isArray(x);
export class WordAuditClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }
  async config(signal?: AbortSignal) { const r = await this.request('/word-audit/config', { cache: 'no-store', signal }); if (r.status === 404 || r.status === 503) return false; if (!r.ok) throw Error('Не удалось загрузить журнал изменений'); const d = await r.json(); if (typeof d?.enabled !== 'boolean') throw Error('Не удалось загрузить журнал изменений'); return d.enabled as boolean; }
  async list(page: number, search: string, signal?: AbortSignal): Promise<AuditPage> {
    if (!Number.isInteger(page) || page < 1 || page > 10000 || search.length > 200) throw Error('Проверьте фильтр журнала');
    const q = new URLSearchParams({ page: String(page) }); if (search.trim()) q.set('search', search.normalize('NFC').trim());
    const r = await this.request('/word-audit?' + q, { cache: 'no-store', signal }); if (!r.ok) throw Error('Не удалось загрузить журнал изменений');
    const d = await r.json();
    if (d?.page !== page || d.pageSize !== 25 || !Number.isSafeInteger(d.total) || d.total < 0 || !Array.isArray(d.items) || d.items.length > 25 || d.items.some((e: AuditEvent) => !e || typeof e.id !== 'string' || typeof e.wordId !== 'string' || typeof e.wordGerman !== 'string' || !AUDIT_ENTITIES.includes(e.entity) || !['INSERT','UPDATE','DELETE'].includes(e.action) || !['system','admin','user'].includes(e.actor) || !object(e.before) || !object(e.after) || (!e.before && !e.after) || typeof e.transactionId !== 'string' || !Number.isFinite(Date.parse(e.createdAt)))) throw Error('Некорректный ответ журнала изменений');
    return d;
  }
}
