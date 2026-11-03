"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ModerationClient, type ModerationWord } from "@/lib/moderation-client";
import { WordRelationsClient, type RelatedCard } from "@/lib/word-relations-client";
import { relationCandidates } from "@/lib/relation-candidates";
import { publicationLabel } from "@/lib/word-view";
import { useI18n } from "./ui-language-provider";
import styles from "./moderation-panel.module.css";
const relations = new WordRelationsClient(apiFetch);
const moderation = new ModerationClient(apiFetch);

export function WordRelationsEditor({ wordId, language, disabled, onChanged, onBusyChange }: {
  wordId: string; language: string; disabled: boolean; onChanged: () => void; onBusyChange: (value: boolean) => void;
}) {
  const { t, errorText } = useI18n();
  const [catalog, setCatalog] = useState<ModerationWord[]>([]);
  const [linked, setLinked] = useState<RelatedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true), writing = useRef(false);
  const candidates = relationCandidates(catalog, wordId, new Set(linked.map(word => word.id)), query);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void Promise.all([
      Promise.all(["PENDING_REVIEW", "PUBLISHED", "REJECTED"].map(status => moderation.list(status as "PENDING_REVIEW" | "PUBLISHED" | "REJECTED", controller.signal))).then(groups => groups.flat()),
      relations.list(wordId, controller.signal),
    ]).then(([words, links]) => {
      if (controller.signal.aborted) return;
      setCatalog(words); setLinked(links); setBlocked(false); onChanged();
    }).catch(failure => { if (!controller.signal.aborted) { setError(failure); setBlocked(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [wordId, language, attempt, onChanged]);

  async function change(relatedId: string, value: boolean) {
    if (disabled || loading || blocked || writing.current) return;
    writing.current = true; setBusy(true); setError(null); setNotice("");
    try {
      await relations.set(wordId, relatedId, value);
      if (!active.current) return;
      onChanged(); setNotice("Связи обновлены.");
      try { const current = await relations.list(wordId); if (active.current) setLinked(current); }
      catch (failure) { if (active.current) { setError(failure); setBlocked(true); } }
    } catch (failure) {
      if (active.current) { setError(failure); setBlocked(true); }
    } finally { writing.current = false; if (active.current) setBusy(false); }
  }
  const locked = disabled || busy || loading || blocked;
  return <section className={styles.relationEditor} aria-label={t("Редактор связанных слов")} aria-busy={busy || loading}>
    <p className={styles.hint}>{t("Связи двусторонние. Пользователь увидит только доступные ему карточки.")}</p>
    {notice && <p role="status">{t(notice)}</p>}
    {Boolean(error) && <div role="alert" className={styles.error}><p>{errorText(error)}</p><p>{t("Перед следующим изменением обновите список связей.")}</p></div>}
    <button type="button" disabled={busy || loading || disabled} onClick={() => setAttempt(value => value + 1)}>{t("Обновить связи")}</button>
    {loading ? <p role="status">{t("Загружаем связанные слова…")}</p> : <>
      <h5>{t("Связанные слова")}</h5>
      {!linked.length ? <p>{t("Связанных слов пока нет.")}</p> : <ul className={styles.relationList}>{linked.map(word => <li key={word.id}><span><strong>{word.article !== "none" && `${word.article} `}{word.german}</strong><br />{word.selectedTranslation.text ?? t("Перевод отсутствует")}</span>
        <button type="button" disabled={locked} aria-label={t("Убрать связь с {0}", { 0: word.german })} onClick={() => void change(word.id, false)}>{t("Убрать связь")}</button></li>)}</ul>}
      <label htmlFor="related-word-search">{t("Найти слово для связи")}</label>
      <input id="related-word-search" type="search" maxLength={200} value={query} disabled={locked} onChange={event => setQuery(event.target.value)} />
      {!query.trim() ? <p className={styles.hint}>{t("Введите слово или перевод. Показаны первые 10 совпадений.")}</p> : !candidates.length ? <p>{t("Подходящих карточек нет или они уже связаны.")}</p> : <ul className={styles.relationList}>{candidates.map(word => <li key={word.id}><span><strong>{word.article !== "none" && `${word.article} `}{word.german}</strong><br />{word.translations.find(row => row.language === language)?.text ?? t("Перевод отсутствует")} · {t(publicationLabel(word.publicationStatus))}</span>
        <button type="button" disabled={locked} aria-label={t("Связать с {0}", { 0: word.german })} onClick={() => void change(word.id, true)}>{t("Добавить связь")}</button></li>)}</ul>}
    </>}
  </section>;
}
