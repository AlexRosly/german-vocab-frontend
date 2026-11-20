"use client";
import { difficultTrainingWords, type DictionaryEntry } from "@/lib/dictionary-entry-client";
import { useI18n } from "./ui-language-provider";

export function DifficultWordToggle({ german, entry, disabled, onToggle }: {
  german: string; entry?: DictionaryEntry; disabled: boolean; onToggle: () => void;
}) {
  const { t } = useI18n();
  if (typeof entry?.isDifficult !== "boolean") return null;
  return <button type="button" className="small-button secondary-button" disabled={disabled} aria-pressed={entry.isDifficult}
    aria-label={t(entry.isDifficult ? "Убрать {0} из трудных слов" : "Отметить {0} как трудное", { 0: german })}
    onClick={onToggle}>{t(entry.isDifficult ? "✓ Трудное" : "Отметить трудным")}</button>;
}

export function DifficultTrainingAction<T extends { dictionaryEntry?: DictionaryEntry }>({ words, enabled, disabled, onStart }: {
  words: readonly T[]; enabled: boolean; disabled: boolean; onStart: (words: T[]) => void;
}) {
  const { t, count } = useI18n();
  if (!enabled) return null;
  const difficult = difficultTrainingWords(words);
  return <div>
    <h4>{t("Трудные слова")}</h4>
    <p className="hint">{t("Личная отметка. Здесь слова по выбранным фильтрам и режиму.")}</p>
    <button type="button" disabled={disabled || !difficult.length} onClick={() => onStart(difficult)}>
      {t("Тренировать трудные ({count})", { count: count(difficult.length) })}
    </button>
  </div>;
}
