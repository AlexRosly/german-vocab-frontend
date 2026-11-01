"use client";
import { emptyExample, type ExampleDraft } from "@/lib/card-draft";
import { TranslationDraftFields } from "./translation-draft-fields";

export function InitialExamples({ drafts, onChange, language, disabled }: {
  drafts: ExampleDraft[]; onChange: (drafts: ExampleDraft[]) => void; language: string; disabled: boolean;
}) {
  function update(index: number, patch: Partial<ExampleDraft>) { onChange(drafts.map((draft, i) => i === index ? { ...draft, ...patch } : draft)); }
  return <fieldset className="initial-examples" disabled={disabled}><legend>Примеры употребления</legend>
    <p className="hint">Добавьте немецкие предложения сразу вместе со словом. Переводы необязательны.</p>
    {drafts.map((draft, index) => <fieldset className="initial-example" key={index}><legend>Пример {index + 1}</legend>
      <label>Предложение на немецком<textarea rows={3} maxLength={1000} value={draft.german}
        onChange={(event) => update(index, { german: event.target.value })} placeholder="Например: Ich esse einen Apfel." /></label>
      <TranslationDraftFields language={draft.language} values={draft.translations} disabled={disabled}
        onLanguage={(value) => update(index, { language: value })}
        onText={(code, text) => update(index, { translations: { ...draft.translations, [code]: text } })} />
      <button type="button" className="small-button secondary-button" onClick={() => onChange(drafts.filter((_, i) => i !== index))}>Убрать пример {index + 1}</button>
    </fieldset>)}
    <button type="button" className="small-button secondary-button" disabled={drafts.length >= 20} onClick={() => onChange([...drafts, emptyExample(language)])}>+ Добавить пример</button>
  </fieldset>;
}
