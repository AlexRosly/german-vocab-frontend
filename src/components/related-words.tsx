"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { WordRelationsClient, type RelatedCard, type RelatedExample } from "@/lib/word-relations-client";
import { useI18n } from "./ui-language-provider";
import styles from "./related-words.module.css";
const client = new WordRelationsClient(apiFetch);

function RelationList({ wordId, language, onOpen }: { wordId: string; language: string; onOpen: (id: string) => void }) {
  const { t, errorText } = useI18n();
  const [data, setData] = useState<RelatedCard[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    void client.list(wordId, controller.signal).then(rows => { if (!controller.signal.aborted) setData(rows); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure); });
    return () => controller.abort();
  }, [wordId, language, attempt]);
  return <div aria-live="polite">{error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(value => value + 1)}>{t("Повторить")}</button></p>
    : data === null ? <p role="status">{t("Загружаем связанные слова…")}</p> : !data.length ? <p>{t("Связанных слов пока нет.")}</p>
    : <><p className={styles.hint}>{t("Связанные выражения могут различаться по смыслу и употреблению.")}</p><ul className={styles.list}>{data.map(word => <li key={word.id}><button type="button" onClick={() => onOpen(word.id)}>
      <strong>{word.article !== "none" && `${word.article} `}{word.german}</strong><span>{word.selectedTranslation.text ?? t("Перевод отсутствует")}</span>
    </button></li>)}</ul></>}</div>;
}

export function RelatedWords({ wordId, language }: { wordId: string; language: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  return <section className={styles.section} aria-label={t("Связанные слова")}>
    <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? t("Скрыть связанные слова") : t("Связанные слова")}</button>
    {open && <RelationList key={wordId + language} wordId={wordId} language={language} onOpen={setTarget} />}
    {target && <RelatedWordDialog initialId={target} language={language} onClose={() => setTarget(null)} />}
  </section>;
}

function RelatedWordDialog({ initialId, language, onClose }: { initialId: string; language: string; onClose: () => void }) {
  const { t, errorText } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [history, setHistory] = useState([initialId]);
  const id = history[history.length - 1];
  const [detail, setDetail] = useState<{ word: RelatedCard; examples: RelatedExample[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setError(null);
    void client.detail(id, controller.signal).then(data => { if (!controller.signal.aborted) { setDetail(data); heading.current?.focus(); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure); });
    return () => controller.abort();
  }, [id, language, attempt]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="related-word-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={styles.header}><h2 id="related-word-heading" tabIndex={-1} ref={heading}>{detail ? `${detail.word.article === "none" ? "" : detail.word.article + " "}${detail.word.german}` : t("Карточка слова")}</h2>
      <button type="button" onClick={onClose}>{t("Закрыть")}</button></div>
    {history.length > 1 && <button type="button" onClick={() => setHistory(value => value.slice(0, -1))}>{t("Назад к предыдущей карточке")}</button>}
    {error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(value => value + 1)}>{t("Повторить")}</button></p>
      : !detail ? <p role="status">{t("Загружаем карточку…")}</p> : <>
        <p className={styles.translation}>{detail.word.selectedTranslation.text ?? t("Перевод отсутствует")}</p>
        {detail.word.pluralForm && <p>{t("Мн. число:")} {detail.word.pluralForm}</p>}
        {detail.word.notes && <p className={styles.hint}>{detail.word.notes}</p>}
        <h3>{t("Примеры употребления")}</h3>
        {!detail.examples.length ? <p>{t("Примеров пока нет.")}</p> : detail.examples.map(ex => <blockquote key={ex.id}><p>{ex.german}</p><p className={styles.hint}>{ex.selectedTranslation.text ?? t("Перевод отсутствует")}</p></blockquote>)}
        <h3>{t("Связанные слова")}</h3>
        <RelationList key={id + language} wordId={id} language={language} onOpen={next => setHistory(value => [...value, next])} />
      </>}
  </dialog>;
}
