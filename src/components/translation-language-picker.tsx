"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import styles from "./library-panel.module.css";

type Language = { code: string; label: string };

export function TranslationLanguagePicker({ language, disabled, pending, onChange }: {
  language: string; disabled: boolean; pending: boolean; onChange: (language: string) => Promise<void>;
}) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void (async () => {
      try {
        const response = await apiFetch("/languages", { signal: controller.signal });
        if (!response.ok) throw new Error("Не удалось загрузить языки перевода");
        const data = await response.json();
        if (!Array.isArray(data.translationLanguages) || !data.translationLanguages.length ||
          !data.translationLanguages.every((item: Language) => item && typeof item.code === "string" && typeof item.label === "string")) {
          throw new Error("Не удалось загрузить языки перевода");
        }
        if (!controller.signal.aborted) setLanguages(data.translationLanguages);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Не удалось загрузить языки перевода");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [attempt]);

  return <section className={styles.preferences} aria-label="Настройки перевода" aria-busy={pending}>
    <label htmlFor="translation-language">Язык перевода</label>
    <select id="translation-language" value={language} disabled={disabled || pending || loading || !languages.length}
      onChange={(event) => {
        setError("");
        void onChange(event.target.value).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Не удалось сохранить язык перевода"));
      }}>
      {!languages.some((item) => item.code === language) && <option value={language}>{language}</option>}
      {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
    </select>
    <span className={styles.hint}>{pending ? "Сохраняем язык и обновляем карточки…" : disabled ? "Завершите тренировку или текущее действие перед сменой языка." : "Если перевода нет, карточка покажет «Перевод отсутствует»."}</span>
    {error && <p role="alert" className={styles.error}>{error} {!languages.length && <button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button>}</p>}
  </section>;
}
