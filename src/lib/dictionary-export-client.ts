export type DictionaryFileKind = "dictionary" | "template" | "example" | "history-sessions" | "history-answers";
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
const MAX_BYTES = 25 * 1024 * 1024;
const failure = () => new Error("Не удалось подготовить CSV-файл");
export class DictionaryExportClient {
  supportsHistory = false;
  private readonly fetcher: Fetcher;
  private readonly currentAccount: () => string | null;
  constructor(fetcher: Fetcher, currentAccount: () => string | null) { this.fetcher = fetcher; this.currentAccount = currentAccount; }
  async config(signal?: AbortSignal): Promise<boolean> {
    this.supportsHistory = false;
    const response = await this.fetcher("/dictionary-export/config", { signal, cache: "no-store" });
    if (response.status === 404) return false;
    if (!response.ok) throw Object.assign(failure(), { status: response.status });
    const data = await response.json(); this.supportsHistory = data?.enabled === true && data.version === 1 && data.history === true; return data?.enabled === true && data.version === 1;
  }
  async file(kind: DictionaryFileKind, userId: string, signal?: AbortSignal, period: { from?: string; to?: string } = {}): Promise<{ blob: Blob; filename: string; wordCount: number | null; historyRowCount: number | null }> {
    const current = () => { if (!userId || this.currentAccount() !== userId) throw new Error("Сессия изменилась. Повторите вход."); if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); };
    if (!["dictionary", "template", "example", "history-sessions", "history-answers"].includes(kind)) throw failure(); current();
    const history = kind.startsWith("history-"), historyKind = kind === "history-answers" ? "answers" : "sessions";
    const query = new URLSearchParams({ kind: historyKind });
    if (history) {
      for (const key of ["from", "to"] as const) {
        const value = period[key]; if (value === undefined || value === "") continue;
        const date = new Date(value + "T00:00:00.000Z");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1970 || date.getUTCFullYear() > 9998) throw new Error("Проверьте период: начальная дата должна быть не позже конечной.");
        query.set(key, value);
      }
      if (period.from && period.to && period.from > period.to) throw new Error("Проверьте период: начальная дата должна быть не позже конечной.");
    }
    const path = history ? "/dictionary-export/history?" + query.toString() : kind === "dictionary" ? "/dictionary-export/csv" : "/dictionary-export/template?variant=" + (kind === "example" ? "example" : "blank");
    const response = await this.fetcher(path, { signal, cache: "no-store" });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(new Error(response.status === 413 ? (history ? "История слишком большая. Укажите меньший период." : "Словарь слишком большой для одного CSV-файла") : response.status === 429 ? "Слишком много запросов. Подождите и попробуйте снова." : failure().message), { status: response.status });
    }
    const version = response.headers.get("x-wortkarten-export-version"), count = response.headers.get("x-wortkarten-word-count");
    const historyCount = response.headers.get("x-wortkarten-history-row-count");
    if (history && (version !== "1" || response.headers.get("x-wortkarten-history-kind") !== historyKind || historyCount === null || !/^\d+$/.test(historyCount) || Number(historyCount) > 50000)) { await response.body?.cancel().catch(() => {}); throw failure(); }
    if (!/^text\/csv(?:;|$)/i.test(response.headers.get("content-type") ?? "") || (version !== null && version !== "1") ||
        Number(response.headers.get("content-length") ?? 0) > MAX_BYTES || (count !== null && (!/^\d+$/.test(count) || Number(count) > 10000))) { await response.body?.cancel().catch(() => {}); throw failure(); }
    if (!response.body) throw failure(); const reader = response.body.getReader(), chunks: ArrayBuffer[] = []; let size = 0;
    try {
      for (;;) { const next = await reader.read(); current(); if (next.done) break; size += next.value.byteLength; if (size > MAX_BYTES) throw failure(); chunks.push(new Uint8Array(next.value).buffer); }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const blob = new Blob(chunks, { type: "text/csv;charset=utf-8" }), prefix = await blob.slice(0, 256).text(); current();
    if (!prefix.replace(/^\uFEFF/, "").startsWith(history ? '"format_version";"session_id";"started_at_utc";"completed_at_utc";' : kind === "dictionary" ? '"format_version";"word_id";"german";"word_type";' : '"german";"word_type";')) throw failure();
    return { blob, historyRowCount: historyCount === null ? null : Number(historyCount), wordCount: count === null ? null : Number(count), filename: history ? "wortkarten-history-" + historyKind + "-" + new Date().toISOString().slice(0, 10) + ".csv" : kind === "dictionary" ? "wortkarten-dictionary-" + new Date().toISOString().slice(0, 10) + ".csv" : "wortkarten-" + kind + ".csv" };
  }
}
