"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { BooksError, PersonalBooksClient, normalizeTitles, type PersonalBooks as Books } from "@/lib/word-books";
import { useI18n } from "./ui-language-provider";
import styles from "./word-books.module.css";
const client = new PersonalBooksClient(apiFetch);
export function PersonalBooks({ wordId, userId, suggestions, disabled, onSaved }: {
  wordId: string; userId: string; suggestions: string[]; disabled: boolean; onSaved: (titles: string[]) => void;
}) {
  const { t } = useI18n(); const [open, setOpen] = useState(false), [visited, setVisited] = useState(false);
  return <section className={styles.panel} aria-label={t("Мои книги")}>
    <button type="button" className="small-button secondary-button" disabled={disabled} aria-expanded={open} aria-controls={`books-${wordId}`} onClick={() => { setVisited(true); setOpen(value => !value); }}>{t(open ? "Скрыть мои книги" : "Мои книги")}</button>
    {visited && <div id={`books-${wordId}`} hidden={!open}><BooksEditor key={`${userId}-${wordId}`} wordId={wordId} suggestions={suggestions} disabled={disabled} onSaved={onSaved} /></div>}
  </section>;
}
function BooksEditor({ wordId, suggestions, disabled, onSaved }: { wordId: string; suggestions: string[]; disabled: boolean; onSaved: (titles: string[]) => void }) {
  const { t, errorText } = useI18n();
  const [books, setBooks] = useState<Books | null>(null), [draft, setDraft] = useState<string[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<unknown>(null), [conflict, setConflict] = useState(false), [saved, setSaved] = useState(false);
  const saving = useRef(false), action = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(null); setSaved(false);
    void client.get(wordId, abort.signal).then(value => { if (!abort.signal.aborted) { setBooks(value); setDraft(value.titles); setConflict(false); } })
      .catch(failure => { if (!abort.signal.aborted) setError(failure); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); action.current?.abort(); };
  }, [wordId, attempt]);
  let valid = true; try { normalizeTitles(draft); } catch { valid = false; }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!books || saving.current || conflict || disabled) return;
    const abort = new AbortController(); action.current = abort; saving.current = true; setBusy(true); setError(null); setSaved(false);
    try { const value = await client.save(wordId, draft, books.revision, abort.signal); if (!abort.signal.aborted) { setBooks(value); setDraft(value.titles); setSaved(true); onSaved(value.titles); } }
    catch (failure) { if (!abort.signal.aborted) { setError(failure); setConflict(failure instanceof BooksError && failure.status === 409); } }
    finally { saving.current = false; if (!abort.signal.aborted) setBusy(false); }
  }
  return <div className={styles.editor}>
    <p className="hint">{t("Эти книги видны только вам. Книга-источник общей карточки не изменится.")}</p>
    {loading ? <p role="status">{t("Загружаем книги…")}</p> : books && <form onSubmit={event => void save(event)}>
      <fieldset disabled={disabled || busy || conflict} className={styles.fields}>
        {draft.map((title, index) => <div className={styles.row} key={index}><label>{t("Книга {0}", { 0: index + 1 })}<input list={`book-options-${wordId}`} maxLength={120} value={title} onChange={event => { setDraft(values => values.map((old, i) => i === index ? event.target.value : old)); setSaved(false); }} /></label>
          <button type="button" className="small-button secondary-button" aria-label={t("Убрать книгу {0}", { 0: index + 1 })} onClick={() => { setDraft(values => values.filter((_, i) => i !== index)); setSaved(false); }}>{t("Убрать")}</button></div>)}
        <datalist id={`book-options-${wordId}`}>{suggestions.map(title => <option key={title} value={title} />)}</datalist>
        <button type="button" className="small-button secondary-button" disabled={draft.length >= 20} onClick={() => { setDraft(values => [...values, ""]); setSaved(false); }}>{t("Добавить книгу")}</button>
      </fieldset>
      <p className="hint">{t("До 20 книг, название до 120 символов. Выберите название или введите своё.")}</p>
      <button type="submit" disabled={disabled || busy || conflict || !valid}>{t(busy ? "Сохраняем…" : "Сохранить мои книги")}</button>
    </form>}
    {!!error && <p role="alert">{errorText(error)}</p>}
    {saved && <p role="status">{t("Мои книги сохранены.")}</p>}
    {((!books && !!error) || conflict) && <><p className="hint">{t("Загрузка сохранённой версии заменит черновик книг.")}</p><button type="button" disabled={busy || disabled} onClick={() => setAttempt(value => value + 1)}>{t("Загрузить сохранённые книги")}</button></>}
  </div>;
}
