"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { WordTranslationsClient, type TranslationLanguage } from "@/lib/word-translations-client";

const client = new WordTranslationsClient(apiFetch);
export function TranslationDraftFields({ language, values, onLanguage, onText, disabled, label = "Перевод (необязательно)" }: {
  language: string; values: Record<string, string>; onLanguage: (language: string) => void;
  onText: (language: string, text: string) => void; disabled?: boolean; label?: string;
}) {
  const [languages, setLanguages] = useState<TranslationLanguage[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void client.languages(controller.signal).then((data) => { if (!controller.signal.aborted) { setLanguages(data); setError(""); } })
      .catch(() => { if (!controller.signal.aborted) setError("Не удалось загрузить языки перевода"); });
    return () => controller.abort();
  }, [attempt]);
  return <div className="translation-draft">
    <label>Язык перевода<select value={language} disabled={disabled || !languages.length} onChange={(event) => onLanguage(event.target.value)}>
      {!languages.some((item) => item.code === language) && <option value={language}>{language}</option>}
      {languages.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
    </select></label>
    <label>{label}<textarea rows={2} maxLength={1000} value={values[language] ?? ""} disabled={disabled}
      onChange={(event) => onText(language, event.target.value)} placeholder="Можно оставить пустым" /></label>
    <p className="hint">Можно заполнить несколько языков. При переключении текст останется в форме.</p>
    {error && <p role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button></p>}
  </div>;
}
