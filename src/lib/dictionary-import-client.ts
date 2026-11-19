export const IMPORT_STATUSES = ["new", "existing", "duplicate", "choice", "error"] as const;
export type ImportStatus = typeof IMPORT_STATUSES[number];
export type ImportCandidate = { id: string; german: string; article: string; inDictionary: boolean; translations: { language: string; text: string }[] };
export type ImportPreviewRow = { row: number; german: string; article: string; status: ImportStatus; reason: string; fields: string[]; duplicateOf: number | null; relatedRows: number[]; candidates: ImportCandidate[]; moreCandidates: boolean; exampleCount: number; verbFormCount: number; sourceBook: string; lessonNumber: string };
export type ImportPreview = { version: 1; readOnly: true; total: number; counts: Record<ImportStatus, number>; rows: ImportPreviewRow[] };
const MAX_BYTES = 25 * 1024 * 1024;
const failure = () => new Error("Не удалось проверить CSV-файл");
const messages: Record<string, string> = {
  "dictionary_import_supported_files": "Выберите файл CSV или Excel (.xlsx).",
  "dictionary_import_invalid_xlsx": "Не удалось прочитать Excel. Сохраните файл в формате .xlsx по нашему шаблону.",
  "dictionary_import_xlsx_limits": "Книга Excel слишком сложная или большая. Разделите её и удалите лишнюю разметку.",
  "dictionary_import_xlsx_busy": "Сейчас проверяются другие книги Excel. Попробуйте немного позже.",
  "dictionary_import_xlsx_formulas": "В Excel найдены формулы. Замените их значениями перед импортом.",
  "dictionary_import_xlsx_merged": "В Excel есть объединённые ячейки. Отмените объединение перед импортом.",
  "dictionary_import_xlsx_cell_type": "В Excel есть ошибки или даты. Используйте текст, числа и true/false.",
  "dictionary_import_xlsx_one_sheet": "Оставьте в Excel один заполненный видимый лист. Скрытые данные тоже учитываются.",

  dictionary_import_invalid_csv: "Неверный CSV. Используйте наш шаблон: UTF-8 и точка с запятой.",
  dictionary_import_empty: "Файл не содержит слов.", dictionary_import_csv_only: "Выберите файл CSV. Excel подключим следующим этапом.",
  dictionary_import_too_large: "Файл слишком большой. Максимум 25 МБ и 10000 записей.", dictionary_import_too_many_rows: "Файл слишком большой. Максимум 25 МБ и 10000 записей.",
  dictionary_import_too_many_candidates: "Слишком много совпадений. Разделите файл на части.",
};
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
export class DictionaryImportClient {
  supportsXlsx = false;
  private readonly fetcher: Fetcher; private readonly currentAccount: () => string | null;
  constructor(fetcher: Fetcher, currentAccount: () => string | null) { this.fetcher = fetcher; this.currentAccount = currentAccount; }
  async config(signal?: AbortSignal): Promise<boolean> {
    this.supportsXlsx = false;
    const response = await this.fetcher("/dictionary-import/config", { signal, cache: "no-store" }); if (response.status === 404) return false;
    if (!response.ok) throw failure(); const data = await response.json(); this.supportsXlsx = data?.enabled === true && data.version === 1 && data.readOnly === true && Array.isArray(data.formats) && data.formats.includes("xlsx"); return data?.enabled === true && data.version === 1 && data.readOnly === true && data.formats?.includes("csv");
  }
  async preview(file: File, userId: string, signal?: AbortSignal): Promise<ImportPreview> {
    const current = () => { if (!userId || this.currentAccount() !== userId) throw new Error("Сессия изменилась. Повторите вход."); if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); }; current();
    if (!/\.csv$/i.test(file.name) && !(this.supportsXlsx && /\.xlsx$/i.test(file.name))) throw new Error(this.supportsXlsx ? messages.dictionary_import_supported_files : messages.dictionary_import_csv_only);
    if (!file.size) throw new Error(messages.dictionary_import_empty);
    if (file.size > MAX_BYTES) throw new Error(messages.dictionary_import_too_large);
    const form = new FormData(); form.append("file", file);
    const response = await this.fetcher("/dictionary-import/preview", { method: "POST", body: form, cache: "no-store", signal }); current();
    if (!response.ok) {
      let code = ""; try { const data = await response.json(); if (typeof data.message === "string") code = data.message; } catch { /* Keep a safe generic error. */ } current();
      throw Object.assign(new Error(messages[code] ?? (response.status === 413 ? messages.dictionary_import_too_large : response.status === 429 ? "Слишком много запросов. Подождите и попробуйте снова." : failure().message)), { status: response.status });
    }
    if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") || Number(response.headers.get("content-length") ?? 0) > MAX_BYTES || !response.body) { await response.body?.cancel().catch(() => {}); throw failure(); }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); current(); if (part.done) break; size += part.value.byteLength; if (size > MAX_BYTES) throw failure(); chunks.push(part.value); } }
    catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let data: ImportPreview; try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw failure(); } current();
    if (!data || data.version !== 1 || data.readOnly !== true || !Number.isInteger(data.total) || data.total < 1 || data.total > 10000 || !Array.isArray(data.rows) || data.rows.length !== data.total || !data.counts) throw failure();
    const counts = { new: 0, existing: 0, duplicate: 0, choice: 0, error: 0 };
    for (const [i, row] of data.rows.entries()) {
      if (row.row !== i + 1 || typeof row.german !== "string" || row.german.length > 200 || typeof row.article !== "string" || !IMPORT_STATUSES.includes(row.status) || typeof row.reason !== "string" || !Array.isArray(row.fields) || row.fields.some(f => typeof f !== "string") || !Array.isArray(row.relatedRows) || row.relatedRows.some(r => !Number.isInteger(r) || r < 1 || r > data.total) || (row.duplicateOf !== null && (!Number.isInteger(row.duplicateOf) || row.duplicateOf < 1 || row.duplicateOf >= row.row)) || typeof row.moreCandidates !== "boolean" || typeof row.sourceBook !== "string" || typeof row.lessonNumber !== "string" || !Number.isInteger(row.exampleCount) || !Number.isInteger(row.verbFormCount) || !Array.isArray(row.candidates) || row.candidates.length > 5) throw failure();
      for (const c of row.candidates) if (!c || typeof c.id !== "string" || typeof c.german !== "string" || typeof c.article !== "string" || typeof c.inDictionary !== "boolean" || !Array.isArray(c.translations) || c.translations.length > 3 || c.translations.some(t => typeof t.language !== "string" || typeof t.text !== "string")) throw failure();
      counts[row.status]++;
    }
    if (IMPORT_STATUSES.some(s => counts[s] !== data.counts[s])) throw failure(); return data;
  }
}
