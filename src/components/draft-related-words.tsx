"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { DraftRelationsClient } from "@/lib/draft-relations-client";
import type { RelatedCard } from "@/lib/word-relations-client";
import { useI18n } from "./ui-language-provider";
import styles from "./dictionary-workspace.module.css";
const client = new DraftRelationsClient(apiFetch);

export function DraftRelatedWords({ own, language, selected, onChange, disabled }: {
  own: readonly RelatedCard[]; language: string; selected: RelatedCard[];
  onChange: (cards: RelatedCard[]) => void; disabled: boolean;
}) {
  const { t, errorText } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RelatedCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResults([]); setError(null); setLoading(Boolean(query.trim()));
    if (!query.trim()) return () => controller.abort();
    const timer = window.setTimeout(() => {
      void client.search(query, own, controller.signal).then(cards => {
        if (!controller.signal.aborted) setResults(cards);
      }).catch(failure => { if (!controller.signal.aborted) setError(failure); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, own, language, attempt]);
  const candidates = results.filter(card => !selected.some(item => item.id === card.id)).slice(0, 10);
  return <fieldset disabled={disabled} className={styles.relations}>
    <legend>{t("Связанные слова")}</legend>
    <p className={styles.hint}>{t("Выберите до 20 существующих карточек. Связи сохранятся вместе с новым словом и будут видны с учётом модерации.")}</p>
    {selected.length > 0 && <ul className={styles.relationList}>{selected.map(card => <li key={card.id}>
      <span><strong>{card.article !== "none" && `${card.article} `}{card.german}</strong></span>
      <button type="button" aria-label={t("Убрать связь с {0}", { 0: card.german })} onClick={() => onChange(selected.filter(item => item.id !== card.id))}>{t("Убрать связь")}</button>
    </li>)}</ul>}
    <label>{t("Найти слово для связи")}<input type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} /></label>
    {loading ? <p role="status">{t("Загружаем связанные слова…")}</p> : error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(value => value + 1)}>{t("Повторить")}</button></p>
      : !query.trim() ? <p className={styles.hint}>{t("Введите слово или перевод. Показаны первые 10 совпадений.")}</p>
      : !candidates.length ? <p>{t("Подходящих карточек нет или они уже связаны.")}</p>
      : <ul className={styles.relationList}>{candidates.map(card => <li key={card.id}><span><strong>{card.article !== "none" && `${card.article} `}{card.german}</strong><br />{card.selectedTranslation.text ?? t("Перевод отсутствует")}</span>
        <button type="button" disabled={selected.length >= 20} aria-label={t("Связать с {0}", { 0: card.german })} onClick={() => onChange([...selected, card])}>{t("Добавить связь")}</button>
      </li>)}</ul>}
  </fieldset>;
}
