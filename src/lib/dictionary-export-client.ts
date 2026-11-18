export type DictionaryFileKind = "dictionary" | "template" | "example";
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
const MAX_BYTES = 25 * 1024 * 1024;
const failure = () => new Error("Не удалось подготовить CSV-файл");
export class DictionaryExportClient {
  private readonly fetcher: Fetcher;
  private readonly currentAccount: () => string | null;
  constructor(fetcher: Fetcher, currentAccount: () => string | null) { this.fetcher = fetcher; this.currentAccount = currentAccount; }
  async config(signal?: AbortSignal): Promise<boolean> {
    const response = await this.fetcher("/dictionary-export/config", { signal, cache: "no-store" });
    if (response.status === 404) return false;
    if (!response.ok) throw Object.assign(failure(), { status: response.status });
    const data = await response.json(); return data?.enabled === true && data.version === 1;
  }
  async file(kind: DictionaryFileKind, userId: string, signal?: AbortSignal): Promise<{ blob: Blob; filename: string; wordCount: number | null }> {
    const current = () => { if (!userId || this.currentAccount() !== userId) throw new Error("Сессия изменилась. Повторите вход."); if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); };
    if (!["dictionary", "template", "example"].includes(kind)) throw failure(); current();
    const path = kind === "dictionary" ? "/dictionary-export/csv" : "/dictionary-export/template?variant=" + (kind === "example" ? "example" : "blank");
    const response = await this.fetcher(path, { signal, cache: "no-store" });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(new Error(response.status === 413 ? "Словарь слишком большой для одного CSV-файла" : response.status === 429 ? "Слишком много запросов. Подождите и попробуйте снова." : failure().message), { status: response.status });
    }
    const version = response.headers.get("x-wortkarten-export-version"), count = response.headers.get("x-wortkarten-word-count");
    if (!/^text\/csv(?:;|$)/i.test(response.headers.get("content-type") ?? "") || (version !== null && version !== "1") ||
        Number(response.headers.get("content-length") ?? 0) > MAX_BYTES || (count !== null && (!/^\d+$/.test(count) || Number(count) > 10000))) { await response.body?.cancel().catch(() => {}); throw failure(); }
    if (!response.body) throw failure(); const reader = response.body.getReader(), chunks: ArrayBuffer[] = []; let size = 0;
    try {
      for (;;) { const next = await reader.read(); current(); if (next.done) break; size += next.value.byteLength; if (size > MAX_BYTES) throw failure(); chunks.push(new Uint8Array(next.value).buffer); }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const blob = new Blob(chunks, { type: "text/csv;charset=utf-8" }), prefix = await blob.slice(0, 256).text(); current();
    if (!prefix.replace(/^\uFEFF/, "").startsWith(kind === "dictionary" ? '"format_version";"word_id";"german";"word_type";' : '"german";"word_type";')) throw failure();
    return { blob, wordCount: count === null ? null : Number(count), filename: kind === "dictionary" ? "wortkarten-dictionary-" + new Date().toISOString().slice(0, 10) + ".csv" : "wortkarten-" + kind + ".csv" };
  }
}
