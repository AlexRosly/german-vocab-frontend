"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { PersonalExampleTranslationsClient, normalizeExampleTranslation, type PersonalExampleTranslation } from "@/lib/personal-example-translations-client";
import { useI18n } from "./ui-language-provider";
import styles from "./word-translations-editor.module.css";
import layout from "./personal-translations-editor.module.css";
const client = new PersonalExampleTranslationsClient(apiFetch);
type Selected = { language: string; text: string | null; source?: "personal" };
type Example = { id: string; german: string; translations: { language: string; text: string }[]; selectedTranslation: Selected; personalTranslationStale?: boolean };

export function ExamplePersonalTranslation({ wordId, example, language, enabled, disabled, onSaved }: {
  wordId: string; example: Example; language: string; enabled: boolean; disabled: boolean; onSaved: (value: Selected, german: string) => void;
}) {
  const { t } = useI18n(), [open, setOpen] = useState(false);
  return <>
    <p dir="auto">{example.selectedTranslation.text ?? t("Перевод отсутствует")}</p>
    {example.selectedTranslation.source === "personal" && <p className={styles.hint}>{t("Мой перевод примера")}</p>}
    {example.personalTranslationStale && <p className={styles.hint}>{t("Немецкое предложение изменилось. Обновите личный перевод примера.")}</p>}
    {enabled && <button type="button" className="small-button secondary-button" disabled={disabled} onClick={() => setOpen(true)}>{t("Мой перевод примера")}</button>}
    {open && <ExampleTranslationEditor wordId={wordId} example={example} language={language} onClose={() => setOpen(false)} onSaved={onSaved} />}
  </>;
}

function ExampleTranslationEditor({ wordId, example, language, onClose, onSaved }: { wordId: string; example: Example; language: string; onClose: () => void; onSaved: (value: Selected, german: string) => void }) {
  const { t, errorText } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(true), writing = useRef(false);
  const [value, setValue] = useState<PersonalExampleTranslation | null>(null), [text, setText] = useState("");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0), [error, setError] = useState<unknown>(null), [notice, setNotice] = useState("");
  const dirty = value !== null && (text !== (value.text ?? "") || value.stale), length = [...normalizeExampleTranslation(text)].length;
  const common = value ? value.commonText : example.translations.find(row => row.language === language)?.text ?? null;
  useEffect(() => {
    active.current = true; const el = dialog.current, overflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden"; el?.showModal();
    return () => { active.current = false; el?.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void client.get(wordId, example.id, language, controller.signal).then(result => {
      if (!controller.signal.aborted) { setValue(result); setText(result.text ?? ""); setBlocked(false); }
    }).catch(failure => { if (!controller.signal.aborted) { setError(failure); setBlocked(true); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [wordId, example.id, language, attempt]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!value || loading || blocked || writing.current || !dirty || length > 1000) return;
    writing.current = true; setSaving(true); setError(null); setNotice("");
    try {
      const result = await client.save(wordId, example.id, language, text, value.revision, value.german);
      if (!active.current) return;
      setValue(result); setText(result.text ?? ""); setNotice(result.text ? "Личный перевод сохранён." : "Личный перевод удалён. Используется общий перевод выбранного языка, если он есть.");
      onSaved({ language, text: result.text ?? result.commonText, ...(result.text === null ? {} : { source: "personal" as const }) }, result.german);
    } catch (failure) { if (active.current) { setError(failure); setBlocked(true); } }
    finally { writing.current = false; if (active.current) setSaving(false); }
  }
  return <dialog ref={dialog} className={`${styles.dialog} ${layout.dialog}`} aria-labelledby="personal-example-heading" onCancel={event => { event.preventDefault(); if (!writing.current) onClose(); }}>
    <div className={`${styles.header} ${layout.header}`}><h2 id="personal-example-heading">{t("Мой перевод примера")}</h2><button type="button" disabled={saving} onClick={onClose}>{dirty ? t("Закрыть без сохранения") : t("Закрыть")}</button></div>
    <div className={layout.body}>
      <p>{value?.german ?? example.german}</p><p className={styles.hint}>{t("Виден только вам. Используется в вашем словаре и тренировках. Общая карточка не изменится.")}</p>
      <p>{t("Язык перевода")}: <strong>{language.toUpperCase()}</strong></p><p className={styles.hint}>{t("Общий перевод")}: <span dir="auto">{common ?? t("Перевод отсутствует")}</span></p>
      {value?.stale && <p className={styles.notice}>{t("Немецкое предложение изменилось. Обновите личный перевод примера.")}<br />{value.sourceGerman}</p>}
      {loading ? <p role="status">{t("Загружаем перевод…")}</p> : <form onSubmit={event => void save(event)} aria-busy={saving}>
        {value && <><label htmlFor="personal-example-text">{t("Текст личного перевода")}</label><textarea id="personal-example-text" dir="auto" rows={4} value={text} disabled={saving} onChange={event => { setText(event.target.value); setNotice(""); }} />
          <p className={length > 1000 ? styles.error : styles.hint}>{length} {t("/ 1000 символов")}</p>
          <p className={styles.hint}>{t("Чтобы убрать личный перевод, очистите текст и сохраните. Снова появится общий перевод того же языка, если он есть.")}</p>
          <button type="submit" className={styles.primary} disabled={saving || blocked || !dirty || length > 1000}>{saving ? t("Сохраняем…") : t("Сохранить мой перевод")}</button></>}
        {Boolean(error) && <div role="alert" className={styles.error}>{errorText(error)}<p>{t("Перед следующим сохранением перечитайте личный перевод. Черновик можно скопировать из поля.")}</p></div>}
        {notice && <p role="status" className={styles.notice}>{t(notice)}</p>}
        <div className={styles.actions}><button type="button" disabled={saving} onClick={() => { setNotice(""); setAttempt(n => n + 1); }}>{dirty ? t("Перечитать, отменив изменения") : t("Перечитать перевод")}</button></div>
      </form>}
    </div>
  </dialog>;
}
