"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PersonalNoteError, PersonalNotesClient, type PersonalNote as Note } from "@/lib/personal-notes-client";
import { useI18n } from "./ui-language-provider";
import styles from "./personal-note.module.css";
const client = new PersonalNotesClient(apiFetch);
export function PersonalNote({ wordId, userId, disabled }: { wordId: string; userId: string; disabled: boolean }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  return <section className={styles.panel} aria-label={t("Личная заметка")}>
    <button type="button" disabled={disabled} aria-expanded={open} aria-controls={`personal-note-${wordId}`} onClick={() => { setVisited(true); setOpen((value) => !value); }}>{t(open ? "Скрыть личную заметку" : "Моя заметка")}</button>
    {visited && <div id={`personal-note-${wordId}`} hidden={!open}><NoteEditor key={`${userId}-${wordId}`} wordId={wordId} disabled={disabled} /></div>}
  </section>;
}
function NoteEditor({ wordId, disabled }: { wordId: string; disabled: boolean }) {
  const { t, errorText } = useI18n();
  const [note, setNote] = useState<Note | null>(null); const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [conflict, setConflict] = useState(false); const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0); const saving = useRef(false); const action = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setSaved(false);
    void client.get(wordId, controller.signal).then((value) => { if (!controller.signal.aborted) { setNote(value); setDraft(value.text ?? ""); setConflict(false); } })
      .catch(() => { if (!controller.signal.aborted) setError("Не удалось загрузить или сохранить личную заметку"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); action.current?.abort(); };
  }, [wordId, attempt]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!note || saving.current || conflict) return;
    const controller = new AbortController(); action.current = controller;
    saving.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      const value = await client.save(wordId, draft, note.revision, controller.signal);
      if (!controller.signal.aborted) { setNote(value); setDraft(value.text ?? ""); setSaved(true); }
    } catch (failure) {
      if (!controller.signal.aborted) { setConflict(failure instanceof PersonalNoteError && failure.status === 409); setError(failure instanceof Error ? failure.message : "Не удалось загрузить или сохранить личную заметку"); }
    } finally { saving.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className={styles.editor}>
    <p className={styles.hint}>{t("Видна только вам. Не попадает в общую карточку и модерацию.")}</p>
    {loading ? <p role="status">{t("Загружаем личную заметку…")}</p> : <>
      {note && <form onSubmit={(event) => void save(event)}>
        <label>{t("Текст личной заметки")}<textarea rows={4} disabled={disabled || busy} value={draft} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} /></label>
        <p className={styles.hint}>{t("До 2000 символов. Чтобы убрать заметку, очистите текст и сохраните.")}</p>
        <button type="submit" disabled={disabled || busy || conflict || [...draft.replace(/\r\n?/g, "\n").trim()].length > 2000}>{t(busy ? "Сохраняем…" : "Сохранить мою заметку")}</button>
      </form>}
      {error && <p role="alert">{errorText(error)}</p>}
      {saved && <p role="status">{t(note?.text ? "Личная заметка сохранена." : "Личная заметка удалена.")}</p>}
      {!note && error && <button type="button" onClick={() => setAttempt((value) => value + 1)}>{t("Повторить")}</button>}
      {conflict && <><p>{t("Скопируйте свой черновик перед загрузкой: сохранённая версия заменит текст в поле.")}</p><button type="button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>{t("Загрузить сохранённую заметку")}</button></>}
    </>}
  </div>;
}
