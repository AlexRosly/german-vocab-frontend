"use client";
import { useEffect, useRef, useState } from "react";
import { apiClient, apiFetch } from "@/lib/api";
import { DictionaryExportClient, type DictionaryFileKind } from "@/lib/dictionary-export-client";
import { useI18n } from "./ui-language-provider";
import styles from "./dictionary-export-panel.module.css";
const client = new DictionaryExportClient(apiFetch, () => apiClient.getSnapshot().user?.id ?? null);
export function DictionaryExportPanel({ userId }: { userId: string }) {
  const { t, errorText } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null), [error, setError] = useState<unknown>(null), [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<DictionaryFileKind | null>(null), [ready, setReady] = useState(false);
  const operation = useRef<AbortController | null>(null), urls = useRef(new Set<string>());
  useEffect(() => {
    const controller = new AbortController(); setEnabled(null); setError(null); setReady(false);
    void client.config(controller.signal).then(value => { if (!controller.signal.aborted) setEnabled(value); }).catch(failure => { if (!controller.signal.aborted) setError(failure); });
    const generated = urls.current;
    return () => { controller.abort(); operation.current?.abort(); for (const url of generated) URL.revokeObjectURL(url); generated.clear(); };
  }, [userId, attempt]);
  async function download(kind: DictionaryFileKind) {
    if (operation.current) return; const controller = new AbortController(); operation.current = controller; setBusy(kind); setError(null); setReady(false);
    const timer = window.setTimeout(() => { setError(new Error("Не удалось подготовить CSV-файл")); controller.abort(); }, 60_000);
    try {
      const file = await client.file(kind, userId, controller.signal);
      if (controller.signal.aborted || apiClient.getSnapshot().user?.id !== userId) return;
      const url = URL.createObjectURL(file.blob); urls.current.add(url);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 1000); setReady(true);
    } catch (failure) { if (!controller.signal.aborted) setError(failure); }
    finally { window.clearTimeout(timer); if (operation.current === controller) { operation.current = null; setBusy(null); } }
  }
  if (enabled === false) return null;
  return <section className={styles.panel} aria-labelledby="dictionary-export-heading">
    <h3 id="dictionary-export-heading">{t("Мои данные: CSV")}</h3>
    <p>{t("Скачайте весь личный словарь, включая архив, переводы, примеры, формы глаголов и личные материалы.")}</p>
    <p className={styles.hint}>{t("Шаблон и пример используют тот же формат колонок. Переводы необязательны; для глагола заполните Präteritum, Partizip II и haben/sein.")}</p>
    {enabled === null ? error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(v => v + 1)}>{t("Повторить")}</button></p> : <p role="status">{t("Проверяем доступность экспорта…")}</p> : <>
      <div className={styles.actions}>
        <button type="button" disabled={busy !== null} onClick={() => void download("dictionary")}>{t("Экспортировать словарь в CSV")}</button>
        <button type="button" disabled={busy !== null} className="secondary-button" onClick={() => void download("template")}>{t("Скачать пустой шаблон")}</button>
        <button type="button" disabled={busy !== null} className="secondary-button" onClick={() => void download("example")}>{t("Скачать пример заполнения")}</button>
      </div>
      {busy && <p role="status">{t("Готовим CSV-файл…")} <button type="button" className="secondary-button" onClick={() => operation.current?.abort()}>{t("Отменить загрузку")}</button></p>}
      {error !== null && <p role="alert">{errorText(error)}</p>}{ready && <p role="status">{t("CSV-файл подготовлен. Проверьте загрузки браузера.")}</p>}
      <details><summary>{t("Как заполнить шаблон")}</summary><ul className={styles.help}>
        <li>{t("Одна строка — одна карточка. german — немецкое слово; word_type — noun, verb или other.")}</li>
        <li>{t("Для существительного укажите article: der, die или das; для глагола — none и формы прошедшего времени.")}</li>
        <li>{t("В экспортированном файле сохраните word_id: он поможет узнать существующую карточку при повторной загрузке.")}</li>
        <li>{t("CSV для Excel: UTF-8, разделитель — точка с запятой. Если колонки не разделились, откройте через импорт текста/CSV.")}</li>
        <li>{t("Дополнительные примеры, формы и книги сохранены в колонках с окончанием _json. Оставьте их без изменений для дальнейшего переноса.")}</li>
      </ul></details>
      <p className={styles.hint}>{t("Загрузка CSV/Excel в приложение появится следующим этапом. История тренировок и общие связи в этот CSV не входят.")}</p>
    </>}
  </section>;
}
