"use client";
import { DictionaryImportSave } from "./dictionary-import-save";
import { useEffect, useRef, useState } from "react";
import { apiClient, apiFetch } from "@/lib/api";
import { DictionaryImportClient, IMPORT_STATUSES, type ImportPreview, type ImportStatus } from "@/lib/dictionary-import-client";
import { useI18n } from "./ui-language-provider";
import styles from "./dictionary-import-panel.module.css";
const client = new DictionaryImportClient(apiFetch, () => apiClient.getSnapshot().user?.id ?? null);
const labels: Record<ImportStatus, string> = { new: "Новые", existing: "Найдены в каталоге", duplicate: "Повторы в файле", choice: "Нужно уточнить", error: "Ошибки" };
const reasons: Record<string, string> = { invalid_fields: "Проверьте поля", no_match: "Совпадений не найдено", known_id: "Карточка найдена по ID", id_unavailable_or_mismatch: "ID недоступен или не соответствует слову", same_word_and_meaning: "Совпадают слово и перевод", check_meaning: "Проверьте значение слова", repeated_in_file: "Повтор другой записи файла", different_meanings_in_file: "В файле разные переводы этого слова" };
const fields: Record<string, string> = {
  format_version: "Версия файла не поддерживается", article_conflict: "Артикль в слове не совпадает с колонкой article", cell_too_long: "Слишком длинное значение",
  german: "Проверьте немецкое слово", word_id: "Проверьте ID карточки", word_type: "Проверьте тип слова, артикль и число", article: "Проверьте тип слова, артикль и число", grammaticalNumber: "Проверьте тип слова, артикль и число",
  verb_forms: "Для глагола нужны Präteritum, Partizip II и haben/sein", verb_forms_required: "Для глагола нужны Präteritum, Partizip II и haben/sein", verbForms: "Для глагола нужны Präteritum, Partizip II и haben/sein",
  example_german: "Добавьте немецкое предложение для перевода примера", examples: "Проверьте примеры и их переводы", translations: "Проверьте переводы слова",
  personal_materials: "Проверьте личную заметку и переводы", personal_books_json: "Проверьте список личных книг", source_books_json: "Проверьте книги-источники и номера уроков",
  pluralForm: "Проверьте множественное число", level: "Уровень должен быть A1, A2, B1, B2, C1 или C2", sourceBook: "Проверьте название книги", lessonNumber: "Номер урока должен быть от 1 до 10000", notes: "Общая заметка слишком длинная",
  invalid_materials: "Проверьте примеры, формы глагола, true/false и JSON-колонки",
};
export function DictionaryImportPanel({ userId }: { userId: string }) {
  const { t, errorText } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null), [failure, setFailure] = useState<unknown>(null), [attempt, setAttempt] = useState(0);
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<ImportPreview | null>(null), [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<ImportStatus | "all">("all"), [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [xlsx, setXlsx] = useState(false);
  const operation = useRef<AbortController | null>(null), input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setEnabled(null); setFailure(null); setFile(null); setPreview(null); setPage(0); if (input.current) input.current.value = "";
    void client.config(controller.signal).then(value => { if (!controller.signal.aborted) { setEnabled(value); setXlsx(client.supportsXlsx); } }).catch(error => { if (!controller.signal.aborted) setFailure(error); });
    return () => { controller.abort(); operation.current?.abort(); };
  }, [userId, attempt]);
  async function check() {
    if (!file || operation.current) return; const controller = new AbortController(); operation.current = controller; setBusy(true); setFailure(null); setPreview(null);
    const timer = window.setTimeout(() => { setFailure(new Error("Не удалось проверить CSV-файл")); controller.abort(); }, 90000);
    try { const result = await client.preview(file, userId, controller.signal); if (!controller.signal.aborted && apiClient.getSnapshot().user?.id === userId) { setPreview(result); setFilter("all"); setPage(0); } }
    catch (error) { if (!controller.signal.aborted && apiClient.getSnapshot().user?.id === userId) setFailure(error); }
    finally { window.clearTimeout(timer); if (operation.current === controller) { operation.current = null; setBusy(false); } }
  }
  if (enabled === false) return null;
  const rows = preview?.rows.filter(r => filter === "all" || r.status === filter) ?? [], pages = Math.max(1, Math.ceil(rows.length / 25));
  return <section className={styles.panel} aria-labelledby="dictionary-import-heading" aria-busy={busy}>
    <h4 id="dictionary-import-heading">{t("Проверить файл перед импортом")}</h4>
    <p>{xlsx ? t("Загрузите CSV или Excel (.xlsx) по нашему шаблону. Проверка ничего не сохраняет и не меняет карточки.") : t("Загрузите CSV по нашему шаблону. Проверка ничего не сохраняет и не меняет карточки.")}</p>
    <p className={styles.hint}>{xlsx ? t("До 25 МБ и 10000 записей. После проверки выберите действия и подтвердите сохранение.") : t("До 25 МБ и 10000 записей. После проверки выберите действия и подтвердите сохранение. Excel — следующий этап.")}</p>
    {enabled === null ? failure ? <p role="alert">{errorText(failure)} <button type="button" onClick={() => setAttempt(a => a + 1)}>{t("Повторить")}</button></p> : <p role="status">{t("Проверяем доступность импорта…")}</p> : <>
      <label htmlFor="dictionary-import-file">{xlsx ? t("Файл CSV или Excel (.xlsx)") : t("Файл CSV")}</label>
      <input ref={input} id="dictionary-import-file" type="file" accept={xlsx ? ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"} disabled={busy || saving} onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setFailure(null); setPage(0); }} />
      {xlsx && <p className={styles.hint}>{t("Откройте CSV-шаблон в Excel и сохраните как .xlsx. Названия колонок в первой строке сохраните; оставьте один заполненный лист без формул и объединённых ячеек.")}</p>}
      <div className={styles.actions}><button type="button" disabled={!file || busy || saving} onClick={() => void check()}>{t("Проверить совпадения")}</button>{busy && <button type="button" className="secondary-button" onClick={() => operation.current?.abort()}>{t("Отменить")}</button>}</div>
      {busy && <p role="status">{t("Проверяем файл и каталог…")}</p>}{failure !== null && <p role="alert">{errorText(failure)}</p>}
      {preview && <>
        <p role="status">{t("Проверка завершена. Записей: {count}. Ничего не сохранено.", { count: preview.total })}</p>
        <ul className={styles.counts}>{IMPORT_STATUSES.map(s => <li key={s}>{t(labels[s])}: <strong>{preview.counts[s]}</strong></li>)}</ul>
        <p className={styles.hint}>{t("Найденные карточки не будут перезаписаны. Неоднозначные значения требуют выбора перед сохранением.")}</p>
        <label htmlFor="dictionary-import-filter">{t("Результат проверки")}</label><select id="dictionary-import-filter" value={filter} onChange={e => { setFilter(e.target.value as ImportStatus | "all"); setPage(0); }}><option value="all">{t("Все")}</option>{IMPORT_STATUSES.map(s => <option key={s} value={s}>{t(labels[s])} ({preview.counts[s]})</option>)}</select>
        <ol className={styles.rows} start={page * 25 + 1}>{rows.slice(page * 25, (page + 1) * 25).map(row => <li key={row.row}>
          <div className={styles.rowHeading}><strong>{row.article !== "none" ? row.article + " " : ""}{row.german || t("Без слова")}</strong><span>{t(labels[row.status])}</span></div>
          <p>{t("Запись {number}", { number: row.row })} · {t(reasons[row.reason] ?? "Нужно уточнить")}</p>
          {row.fields.length > 0 && <ul>{[...new Set(row.fields.map(f => fields[f] ?? "Проверьте значение в шаблоне"))].map(message => <li key={message}>{t(message)}</li>)}</ul>}
          {row.duplicateOf !== null && <p>{t("Совпадает с записью {number}", { number: row.duplicateOf })}</p>}
          {row.relatedRows.length > 0 && <p>{t("Связанные записи файла")}: {row.relatedRows.join(", ")}</p>}
          {row.sourceBook && <p>{row.sourceBook}{row.lessonNumber ? " · " + t("Урок {number}", { number: row.lessonNumber }) : ""}</p>}
          <p>{t("Примеры: {count}. Варианты форм: {forms}.", { count: row.exampleCount, forms: row.verbFormCount })}</p>
          {row.candidates.length > 0 && <details><summary>{t("Найденные карточки")}</summary><ul>{row.candidates.map(c => <li key={c.id}><strong>{c.article !== "none" ? c.article + " " : ""}{c.german}</strong> · {t(c.inDictionary ? "Уже в вашем словаре" : "Доступна в каталоге")}{c.translations.map(tr => <p key={tr.language}>{tr.language.toUpperCase()}: {tr.text}</p>)}</li>)}</ul></details>}
          {row.moreCandidates && <p>{t("Показаны первые пять совпадений. Требуется уточнение.")}</p>}
        </li>)}</ol>
        {!rows.length && <p>{t("В этой группе записей нет")}</p>}
        <nav className={styles.actions} aria-label={t("Страницы проверки файла")}><button type="button" className="secondary-button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t("Предыдущая страница")}</button><span>{t("Страница {page} из {pages}", { page: page + 1, pages })}</span><button type="button" className="secondary-button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>{t("Следующая страница")}</button></nav>
      </>}
      <DictionaryImportSave userId={userId} file={file} preview={preview} onBusy={setSaving} />
    </>}
  </section>;
}
