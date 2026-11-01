"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { normalizeTranslation, TranslationError, WordTranslationsClient, type SavedTranslation, type TranslationLanguage } from "@/lib/word-translations-client";
import styles from "./word-translations-editor.module.css";

const client = new WordTranslationsClient(apiFetch);
const message = (error: unknown) => error instanceof Error ? error.message : "Не удалось выполнить запрос. Повторите попытку.";

export function WordTranslationsEditor({ word, initialLanguage, onClose, onSaved }: {
  word: { id: string; german: string }; initialLanguage: string; onClose: () => void; onSaved: (translation: SavedTranslation) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const savingRef = useRef(false);
  const [languages, setLanguages] = useState<TranslationLanguage[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [language, setLanguage] = useState(initialLanguage);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState("");
  const dirty = loaded && text !== (original ?? "");
  const normalized = normalizeTranslation(text);
  const length = [...normalized].length;
  const supported = languages.some((item) => item.code === language);

  useEffect(() => {
    const element = dialog.current;
    active.current = true;
    element?.showModal();
    return () => { active.current = false; element?.close(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError("");
    void client.languages(controller.signal).then((data) => { if (!controller.signal.aborted) setLanguages(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setCatalogError(message(failure)); });
    return () => controller.abort();
  }, [catalogAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setText(""); setOriginal(null); setError(""); setNotice(""); setBlocked(false);
    void client.get(word.id, language, controller.signal).then((data) => {
      if (!controller.signal.aborted) { setOriginal(data.text); setText(data.text ?? ""); setLoaded(true); }
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(message(failure)); });
    return () => controller.abort();
  }, [word.id, language, attempt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !supported || !dirty || blocked || savingRef.current || !length || length > 1000) return;
    savingRef.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const saved = await client.save(word.id, language, text);
      if (!active.current) return;
      setOriginal(saved.text); setText(saved.text);
      // The write is already confirmed; a presentation reload must not turn it into a failed save.
      try {
        await onSaved(saved);
        if (active.current) setNotice("Перевод сохранён. Карточка обновлена.");
      } catch {
        if (active.current) setNotice("Перевод сохранён. Не удалось обновить карточку на странице — обновите её после закрытия окна.");
      }
    } catch (failure) {
      if (!active.current) return;
      setError(message(failure));
      if (failure instanceof TranslationError && (failure.status === 403 || failure.status === 404)) setBlocked(true);
    } finally { savingRef.current = false; if (active.current) setSaving(false); }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="translations-heading" onCancel={(event) => {
    event.preventDefault(); if (!savingRef.current) onClose();
  }}>
    <div className={styles.header}><div><p className="eyebrow">ПЕРЕВОДЫ КАРТОЧКИ</p><h2 id="translations-heading">{word.german}</h2></div>
      <button type="button" className={styles.close} disabled={saving} onClick={onClose}>{dirty ? "Закрыть без сохранения" : "Закрыть"}</button>
    </div>
    <p className={styles.hint}>Перевод входит в общую карточку. Изменение отклонённой карточки снова отправит её на проверку.</p>
    <form onSubmit={(event) => void save(event)} aria-busy={saving}>
      <label htmlFor="word-translation-language">Язык перевода карточки</label>
      <select id="word-translation-language" value={language} disabled={saving || dirty || !languages.length} onChange={(event) => setLanguage(event.target.value)}>
        {!supported && <option value={language}>{language}</option>}
        {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
      {catalogError && <p className={styles.error} role="alert">{catalogError} <button type="button" disabled={saving} onClick={() => setCatalogAttempt((value) => value + 1)}>Повторить загрузку языков</button></p>}
      {dirty && <p className={styles.hint}>Сохраните перевод или отмените изменения перед выбором другого языка.</p>}
      {!loaded && !error && <p role="status">Загружаем перевод…</p>}
      {loaded && original === null && <p className={styles.hint}>Перевода на этом языке пока нет.</p>}
      <label htmlFor="word-translation-text">Текст перевода</label>
      <textarea id="word-translation-text" rows={5} value={text} maxLength={2000} disabled={!loaded || saving || blocked}
        onChange={(event) => { setText(event.target.value); setNotice(""); }} aria-describedby="word-translation-limit" />
      <p id="word-translation-limit" className={length > 1000 ? styles.error : styles.hint}>{length} / 1000 символов</p>
      {language === "ru" && <p className={styles.hint}>Русский перевод обновится и в основной форме слова.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {blocked && <p className={styles.error}>Доступ к редактированию изменился. Закройте окно и обновите карточку.</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={!loaded || !supported || !dirty || saving || blocked || !length || length > 1000}>{saving ? "Сохраняем…" : "Сохранить перевод"}</button>
        {dirty && <button type="button" disabled={saving} onClick={() => { setText(original ?? ""); setError(""); }}>Отменить изменения</button>}
        {!dirty && <button type="button" disabled={saving || blocked} onClick={() => setAttempt((value) => value + 1)}>Перечитать перевод</button>}
        {dirty && error && !blocked && <button type="button" disabled={saving} onClick={() => setAttempt((value) => value + 1)}>Перечитать, отменив изменения</button>}
      </div>
      <p className={styles.hint}>Это язык редактируемого перевода. Язык показа ваших учебных карточек остаётся прежним.</p>
    </form>
  </dialog>;
}
