"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { normalizeBook } from "@/lib/word-books";
import { useI18n } from "./ui-language-provider";
import styles from "./word-books.module.css";
export function SourceBookEditor({ wordId, sourceBook, disabled, onSaved, onBusyChange }: {
  wordId: string; sourceBook?: string | null; disabled: boolean; onSaved: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const { t, errorText } = useI18n(); const [open, setOpen] = useState(false), [draft, setDraft] = useState(sourceBook ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const controller = useRef<AbortController | null>(null), saving = useRef(false);
  useEffect(() => () => { controller.current?.abort(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (disabled || saving.current) return;
    const abort = new AbortController(); controller.current = abort; saving.current = true; setBusy(true); onBusyChange(true); setError(null);
    try {
      const response = await apiFetch(`/words/${encodeURIComponent(wordId)}`, { method: "PATCH", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceBook: normalizeBook(draft) || null }) });
      if (!response.ok) { const data = await response.json().catch(() => null); throw { status: response.status, message: data?.message }; }
      await response.json(); if (!abort.signal.aborted) { setOpen(false); onSaved(); }
    } catch (failure) { if (!abort.signal.aborted) setError(failure); }
    finally { saving.current = false; onBusyChange(false); if (!abort.signal.aborted) setBusy(false); }
  }
  return <div className={styles.panel}>
    <button type="button" disabled={disabled || busy} onClick={() => { setOpen(value => !value); setDraft(sourceBook ?? ""); setError(null); }}>{t(open ? "Отмена" : "Изменить книгу-источник")}</button>
    {open && <form className={styles.editor} onSubmit={event => void save(event)}><label>{t("Книга-источник")}<input maxLength={120} value={draft} disabled={disabled || busy} onChange={event => setDraft(event.target.value)} /></label>
      <p className="hint">{t("Книга-источник видна всем. Пустое поле убирает источник.")}</p><button type="submit" disabled={disabled || busy}>{t(busy ? "Сохраняем…" : "Сохранить книгу-источник")}</button></form>}
    {!!error && <p role="alert">{errorText(error)}</p>}
  </div>;
}
