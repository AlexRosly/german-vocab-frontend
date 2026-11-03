"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { PersonalTranslationsClient, normalizePersonalTranslation, type PersonalTranslation } from "@/lib/personal-translations-client";
import { useI18n } from "./ui-language-provider";
import styles from "./word-translations-editor.module.css";
import layout from "./personal-translations-editor.module.css";
const client = new PersonalTranslationsClient(apiFetch);

export function PersonalTranslationsEditor({ word, language, onClose, onSaved }: {
  word: { id: string; german: string; translations: { language: string; text: string }[] }; language: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { t, errorText } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(true), writing = useRef(false);
  const [value, setValue] = useState<PersonalTranslation | null>(null), [text, setText] = useState("");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0), [error, setError] = useState<unknown>(null), [notice, setNotice] = useState("");
  const dirty = value !== null && text !== (value.text ?? "");
  const length = [...normalizePersonalTranslation(text)].length;
  const common = word.translations.find(row => row.language === language)?.text;
  useEffect(() => {
    active.current = true;
    const el = dialog.current, overflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden"; el?.showModal();
    return () => { active.current = false; el?.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void client.get(word.id, language, controller.signal).then(result => {
      if (!controller.signal.aborted) { setValue(result); setText(result.text ?? ""); setBlocked(false); }
    }).catch(failure => { if (!controller.signal.aborted) { setError(failure); setBlocked(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [word.id, language, attempt]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!value || loading || blocked || writing.current || !dirty || length > 1000) return;
    writing.current = true; setSaving(true); setError(null); setNotice("");
    try {
      const result = await client.save(word.id, language, text, value.revision);
      if (!active.current) return;
      setValue(result); setText(result.text ?? "");
      setNotice(result.text ? "Личный перевод сохранён." : "Личный перевод удалён. Используется общий перевод выбранного языка, если он есть.");
      try { await onSaved(); } catch { if (active.current) setNotice("Личный перевод сохранён. Обновите страницу после закрытия окна."); }
    } catch (failure) { if (active.current) { setError(failure); setBlocked(true); } }
    finally { writing.current = false; if (active.current) setSaving(false); }
  }
  return <dialog ref={dialog} className={`${styles.dialog} ${layout.dialog}`} aria-labelledby="personal-translation-heading" onCancel={event => { event.preventDefault(); if (!writing.current) onClose(); }}>
    <div className={`${styles.header} ${layout.header}`}><div><p className="eyebrow">{t("Мой перевод")}</p><h2 id="personal-translation-heading">{word.german}</h2></div>
      <button type="button" disabled={saving} onClick={onClose}>{dirty ? t("Закрыть без сохранения") : t("Закрыть")}</button></div>
    <div className={layout.body}>
    <p className={styles.hint}>{t("Виден только вам. Используется в вашем словаре и тренировках. Общая карточка не изменится.")}</p>
    <p>{t("Язык перевода")}: <strong>{language.toUpperCase()}</strong></p>
    <p className={styles.hint}>{t("Общий перевод")}: <span dir="auto">{common ?? t("Перевод отсутствует")}</span></p>
    {loading ? <p role="status">{t("Загружаем перевод…")}</p> : <form onSubmit={event => void save(event)} aria-busy={saving}>
      {value && <><label htmlFor="personal-translation-text">{t("Текст личного перевода")}</label>
        <textarea id="personal-translation-text" dir="auto" rows={4} value={text} disabled={saving} aria-describedby="personal-translation-limit" onChange={event => { setText(event.target.value); setNotice(""); }} />
        <p id="personal-translation-limit" className={length > 1000 ? styles.error : styles.hint}>{length} {t("/ 1000 символов")}</p>
        <p className={styles.hint}>{t("Чтобы убрать личный перевод, очистите текст и сохраните. Снова появится общий перевод того же языка, если он есть.")}</p>
        <button type="submit" className={styles.primary} disabled={saving || blocked || !dirty || length > 1000}>{saving ? t("Сохраняем…") : t("Сохранить мой перевод")}</button>
        {dirty && !blocked && <button type="button" disabled={saving} onClick={() => { setText(value.text ?? ""); setNotice(""); }}>{t("Отменить изменения")}</button>}
      </>}
      {Boolean(error) && <div role="alert" className={styles.error}><p>{errorText(error)}</p><p>{t("Перед следующим сохранением перечитайте личный перевод. Черновик можно скопировать из поля.")}</p></div>}
      {notice && <p role="status" className={styles.notice}>{t(notice)}</p>}
      <div className={styles.actions}><button type="button" disabled={saving} onClick={() => { setNotice(""); setAttempt(current => current + 1); }}>{dirty ? t("Перечитать, отменив изменения") : t("Перечитать перевод")}</button></div>
    </form>}
    </div>
  </dialog>;
}
