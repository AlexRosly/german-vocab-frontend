"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, type StudyWord } from "@/lib/api";
import { displayTranslation } from "@/lib/word-view";
import styles from "./library-panel.module.css";

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.message === "string" ? data.message : "Не удалось загрузить библиотеку. Повторите попытку.");
  }
  return response.json();
}

export function LibraryPanel({ language, onDictionaryChange, onBusyChange }: {
  language: string; onDictionaryChange: () => Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState({ query: "", attempt: 0 });
  const [words, setWords] = useState<StudyWord[]>([]);
  const [membership, setMembership] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setWords([]); setError(""); setNotice("");
    void (async () => {
      try {
        const [library, mine] = await Promise.all([
          apiFetch(`/words?q=${encodeURIComponent(search.query)}`, { signal: controller.signal }).then(readResponse<StudyWord[]>),
          apiFetch("/words/mine", { signal: controller.signal }).then(readResponse<StudyWord[]>),
        ]);
        if (!controller.signal.aborted) {
          setWords(library); setMembership(new Set(mine.map((word) => word.id)));
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Не удалось загрузить библиотеку");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [search, language]);

  useEffect(() => {
    onBusyChange(addingId !== null);
    return () => onBusyChange(false);
  }, [addingId, onBusyChange]);

  async function add(word: StudyWord) {
    if (addingId || membership.has(word.id)) return;
    setAddingId(word.id); setError(""); setNotice("");
    try {
      await readResponse<StudyWord>(await apiFetch(`/words/${encodeURIComponent(word.id)}/dictionary`, { method: "POST" }));
      setMembership((current) => new Set([...current, word.id]));
      setNotice(`«${word.german}» добавлено в ваш словарь. Можно начать тренировку во вкладке «Словарь».`);
      await onDictionaryChange();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось добавить слово. Повторите попытку.");
    } finally { setAddingId(null); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch((current) => ({ query: input.trim(), attempt: current.attempt + 1 }));
  }

  return <section className={styles.panel} aria-labelledby="library-heading">
    <div className={styles.heading}><div><p className="eyebrow">ОБЩАЯ БИБЛИОТЕКА</p><h3 id="library-heading">Готовые слова для вашего словаря</h3></div>
      {!loading && !error && <span className={styles.count}>{words.length} найдено</span>}
    </div>
    <p className={styles.hint}>Здесь только опубликованные карточки. Добавьте слово в свой словарь, чтобы изучать его со своим прогрессом.</p>
    <form className={styles.search} onSubmit={submit} role="search" aria-label="Поиск в библиотеке">
      <label htmlFor="library-search">Поиск по слову или переводу</label>
      <input id="library-search" value={input} maxLength={100} placeholder="Например, Baum" disabled={addingId !== null} onChange={(event) => setInput(event.target.value)} />
      <button type="submit" disabled={addingId !== null}>Найти</button>
    </form>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error} <button type="button" disabled={addingId !== null} onClick={() => setSearch((current) => ({ ...current, attempt: current.attempt + 1 }))}>Обновить библиотеку</button></p>}
    {loading ? <p role="status">Загружаем библиотеку…</p> : !error && !words.length ? <p>Слова не найдены. Попробуйте другой запрос.</p> : <div className={styles.grid}>
      {words.map((word) => <article className={styles.card} key={word.id}>
        <p className={styles.meta}>Опубликовано · {word.level ?? "Уровень не указан"}{word.lessonNumber !== null ? ` · Урок ${word.lessonNumber}` : ""}</p>
        <h4 className={word.grammaticalNumber === "plural" ? "article-orange" : word.article === "der" ? "article-blue" : word.article === "die" ? "article-red" : word.article === "das" ? "article-green" : "article-neutral"}>
          {word.article !== "none" && `${word.article} `}{word.german}
        </h4>
        <p>{displayTranslation(word)}</p>
        {word.pluralForm && <p className={styles.hint}>Мн. число: {word.pluralForm}</p>}
        {word.notes && <p className={styles.hint}>{word.notes}</p>}
        <LibraryExamples wordId={word.id} />
        <button type="button" disabled={addingId !== null || membership.has(word.id)} onClick={() => void add(word)}
          aria-label={`${membership.has(word.id) ? "Уже в словаре" : "Добавить в мой словарь"}: ${word.german}`}>
          {addingId === word.id ? "Добавляем…" : membership.has(word.id) ? "Уже в словаре ✓" : "+ В мой словарь"}
        </button>
      </article>)}
    </div>}
  </section>;
}

function LibraryExamples({ wordId }: { wordId: string }) {
  const [open, setOpen] = useState(false);
  const [examples, setExamples] = useState<{ id: string; german: string; translation: string }[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setExamples(null); setError("");
    void apiFetch(`/words/${encodeURIComponent(wordId)}/examples`, { signal: controller.signal })
      .then(readResponse<{ id: string; german: string; translation: string }[]>).then((data) => { if (!controller.signal.aborted) setExamples(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Не удалось загрузить примеры"); });
    return () => controller.abort();
  }, [open, wordId, attempt]);
  return <div className={styles.examples}>
    <button className={styles.link} type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Скрыть примеры" : "Показать примеры"}</button>
    {open && <div>{error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button></p>
      : examples === null ? <p role="status">Загружаем примеры…</p> : !examples.length ? <p className={styles.hint}>Примеров пока нет.</p>
      : <><p className={styles.hint}>Переводы примеров пока доступны на русском.</p>{examples.map((example) => <p key={example.id}>{example.german}<br /><span className={styles.hint}>{example.translation}</span></p>)}</>}</div>}
  </div>;
}
