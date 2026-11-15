"use client";
import { useI18n } from "./ui-language-provider";
import { emptyVerbForm, pastForm, perfekt, type VerbForm } from "@/lib/verb-forms";
import styles from "./verb-forms.module.css";

export function VerbFormsEditor({ forms, onChange, disabled }: { forms: VerbForm[]; onChange: (forms: VerbForm[]) => void; disabled: boolean }) {
  const { t } = useI18n();
  function update(index: number, patch: Partial<VerbForm>) { onChange(forms.map((form, i) => i === index ? { ...form, ...patch } : form)); }
  return <fieldset className={styles.editor} disabled={disabled}>
    <legend>{t("Формы глагола")}</legend>
    <p className="hint">{t("Укажите формы для er/sie/es. Для разных значений можно добавить отдельный вариант.")}</p>
    {forms.map((form, index) => <fieldset className={styles.variant} key={index}>
      <legend>{t("Вариант {0}", { 0: index + 1 })}</legend>
      <div className={styles.grid}>
        <label>Präteritum<input required maxLength={200} value={form.praeteritum} onChange={e => update(index, { praeteritum: e.target.value })} placeholder="ging" /></label>
        <label>Partizip II<input required maxLength={200} value={form.participle2} onChange={e => update(index, { participle2: e.target.value })} placeholder="gegangen" /></label>
        <label>{t("Вспомогательный глагол")}<select value={form.auxiliary} onChange={e => update(index, { auxiliary: e.target.value as VerbForm["auxiliary"] })}><option value="HABEN">haben</option><option value="SEIN">sein</option></select></label>
      </div>
      <label className={styles.check}><input type="checkbox" checked={form.reflexive ?? false} onChange={e => update(index, { reflexive: e.target.checked })} />{t("Возвратный вариант (sich)")}</label>
      <label>{t("Значение или употребление (необязательно)")}<input maxLength={300} value={form.usage ?? ""} onChange={e => update(index, { usage: e.target.value })} /></label>
      {form.participle2.trim() && <p>Perfekt: {perfekt(form)}</p>}
      {forms.length > 1 && <button type="button" className="secondary" onClick={() => onChange(forms.filter((_, i) => i !== index))}>{t("Убрать вариант {0}", { 0: index + 1 })}</button>}
    </fieldset>)}
    {forms.length < 4 && <button type="button" className="secondary" onClick={() => onChange([...forms, emptyVerbForm()])}>{t("Добавить вариант форм")}</button>}
  </fieldset>;
}

export function VerbForms({ forms }: { forms?: VerbForm[] }) {
  const { t } = useI18n();
  if (!forms?.length) return null;
  return <details className={styles.display}><summary>{t("Формы глагола")}</summary>
    <p className="hint">{t("Формы для er/sie/es")}</p>
    {forms.map((form, index) => <div className={styles.variant} key={index}>
      {form.usage && <p>{form.usage}</p>}
      <dl className={styles.forms}>
        <div><dt>Präteritum</dt><dd>{pastForm(form)}</dd></div>
        <div><dt>Partizip II</dt><dd>{form.participle2}</dd></div>
        <div><dt>Perfekt</dt><dd>{perfekt(form)}</dd></div>
      </dl>
    </div>)}
  </details>;
}
