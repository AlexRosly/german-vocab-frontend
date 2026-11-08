"use client";
import { safeErrorMessage } from "@/lib/i18n";
import { useI18n } from "./ui-language-provider";
import type { WordExample } from "@/lib/card-draft";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch, type StudyWord } from "@/lib/api";
import { bookFilterOptions, filterLibraryWords, libraryLessons } from "@/lib/word-books";
import { RelatedWords } from "./related-words";
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
  const { t, errorText } = useI18n();
  const [input, setInput] = useState("");
  const [book, setBook] = useState("");
  const [lesson, setLesson] = useState("");
  const adding = useRef(false);
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
        if (!controller.signal.aborted) setError(failure instanceof Error ? safeErrorMessage(failure) : "Не удалось загрузить библиотеку");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [search, language]);

  useEffect(() => {
    onBusyChange(addingId !== null);
    return () => onBusyChange(false);
  }, [addingId, onBusyChange]);

  async function add(word: StudyWord) {
    if (adding.current || membership.has(word.id)) return;
    adding.current = true;
    setAddingId(word.id); setError(""); setNotice("");
    try {
      await readResponse<StudyWord>(await apiFetch(`/words/${encodeURIComponent(word.id)}/dictionary`, { method: "POST" }));
      setMembership((current) => new Set([...current, word.id]));
      setNotice(`«${word.german}» добавлено в ваш словарь. Можно начать тренировку во вкладке «Словарь».`);
      await onDictionaryChange();
    } catch (failure) {
      setError(failure instanceof Error ? safeErrorMessage(failure) : "Не удалось добавить слово. Повторите попытку.");
    } finally { adding.current = false; setAddingId(null); }
  }

  async function addAll() {
    if (adding.current || loading || error || input.trim() !== search.query || !missingCount || visible.length > 2000) return;
    adding.current = true;
    setAddingId("bulk"); setError(""); setNotice("");
    const wordIds = visible.map(word => word.id);
    try {
      const result = await readResponse<{ addedCount: number; alreadyInDictionaryCount: number; unavailableCount: number; wordIds: string[] }>(await apiFetch("/words/dictionary/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wordIds }),
      }));
      setMembership(current => new Set([...current, ...result.wordIds]));
      setNotice(t("Добавлено: {0}. Уже в словаре: {1}. Недоступно: {2}.", { 0: result.addedCount, 1: result.alreadyInDictionaryCount, 2: result.unavailableCount }));
      await onDictionaryChange();
      if (result.unavailableCount) {
        const requested = new Set(wordIds), available = new Set(result.wordIds);
        setWords(current => current.filter(word => !requested.has(word.id) || available.has(word.id)));
      }
    } catch (failure) {
      setError(failure instanceof Error ? safeErrorMessage(failure) : "Не удалось добавить слова. Обновите библиотеку и повторите попытку.");
    } finally { adding.current = false; setAddingId(null); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch((current) => ({ query: input.trim(), attempt: current.attempt + 1 }));
  }

  const books = bookFilterOptions(words, book), visible = filterLibraryWords(words, book, lesson);
  const lessons = libraryLessons(words, book, lesson), missingCount = visible.filter(word => !membership.has(word.id)).length;
  return <section className={styles.panel} aria-labelledby="library-heading">
    <div className={styles.heading}><div><p className="eyebrow">{t("ОБЩАЯ БИБЛИОТЕКА")}</p><h3 id="library-heading">{t("Готовые слова для вашего словаря")}</h3></div>
      {!loading && !error && <span className={styles.count}>{visible.length}{" "}{t("найдено")}</span>}
    </div>
    <p className={styles.hint}>{t("Здесь только опубликованные карточки. Добавьте слово в свой словарь, чтобы изучать его со своим прогрессом.")}</p>
    <form className={styles.search} onSubmit={submit} role="search" aria-label={t("Поиск в библиотеке")}>
      <label htmlFor="library-search">{t("Поиск по слову или переводу")}</label>
      <input id="library-search" value={input} maxLength={100} placeholder={t("Например, Baum")} disabled={addingId !== null} onChange={(event) => setInput(event.target.value)} />
      <button type="submit" disabled={addingId !== null}>{t("Найти")}</button>
    </form>
    <div className={styles.filters}>
      <label>{t("Книга")}<select value={book} disabled={addingId !== null} onChange={event => { setBook(event.target.value); setLesson(""); setNotice(""); }}><option value="">{t("Все книги")}</option><option value="none">{t("Без книги")}</option>{books.map(option => <option key={option.key} value={option.key}>{option.title}</option>)}</select></label>
      <label>{t("Урок")}<select value={lesson} disabled={addingId !== null} onChange={event => { setLesson(event.target.value); setNotice(""); }}><option value="">{t("Все уроки")}</option><option value="none">{t("Без урока")}</option>{lessons.map(number => <option key={number} value={number}>{number}</option>)}</select></label>
    </div>
    <div className={styles.bulk}>
      <button type="button" disabled={loading || !!error || input.trim() !== search.query || addingId !== null || !missingCount || visible.length > 2000} onClick={() => void addAll()}>
        {addingId === "bulk" ? t("Добавляем…") : t("Добавить все найденные ({0})", { 0: missingCount })}
      </button>
      <p className={styles.hint}>{t("Новых: {0}. Уже в словаре: {1}. Прогресс и архив сохраняются.", { 0: missingCount, 1: visible.length - missingCount })}</p>
      {input.trim() !== search.query && <p className={styles.hint}>{t("Нажмите «Найти», чтобы применить поиск перед массовым добавлением.")}</p>}
      {visible.length > 2000 && <p className={styles.hint}>{t("За один раз можно добавить до 2000 слов. Уточните книгу, урок или поиск.")}</p>}
    </div>
    {notice && <p className={styles.notice} role="status">{t(notice)}</p>}
    {error && <p className={styles.error} role="alert">{errorText(error)} <button type="button" disabled={addingId !== null} onClick={() => setSearch((current) => ({ ...current, attempt: current.attempt + 1 }))}>{t("Обновить библиотеку")}</button></p>}
    {loading ? <p role="status">{t("Загружаем библиотеку…")}</p> : !error && !visible.length ? <p>{t("Слова не найдены. Попробуйте другой запрос.")}</p> : <div className={styles.grid}>
      {visible.map((word) => <article className={styles.card} key={word.id}>
        <p className={styles.meta}>{t("Опубликовано ·")}{" "}{word.level ?? t("Уровень не указан")}{word.lessonNumber !== null ? t(" · Урок {0}", { 0: word.lessonNumber }) : ""}</p>
        <h4 className={word.grammaticalNumber === "plural" ? "article-orange" : word.article === "der" ? "article-blue" : word.article === "die" ? "article-red" : word.article === "das" ? "article-green" : "article-neutral"}>
          {word.article !== "none" && `${word.article} `}{word.german}
        </h4>
        {word.sourceBook && <p className={styles.hint}>{t("Книга-источник")}: {word.sourceBook}</p>}
        <p>{displayTranslation(word, t("Перевод отсутствует"))}</p>
        {word.pluralForm && <p className={styles.hint}>{t("Мн. число:")}{" "}{word.pluralForm}</p>}
        {word.notes && <p className={styles.hint}>{word.notes}</p>}
        <LibraryExamples wordId={word.id} />
        <RelatedWords wordId={word.id} language={language} />
        <button type="button" disabled={addingId !== null || membership.has(word.id)} onClick={() => void add(word)}
          aria-label={`${membership.has(word.id) ? t("Уже в словаре") : t("Добавить в мой словарь")}: ${word.german}`}>
          {addingId === word.id ? t("Добавляем…") : membership.has(word.id) ? t("Уже в словаре ✓") : t("+ В мой словарь")}
        </button>
      </article>)}
    </div>}
  </section>;
}

function LibraryExamples({ wordId }: { wordId: string }) {
  const { t, errorText } = useI18n();
  const [open, setOpen] = useState(false);
  const [examples, setExamples] = useState<WordExample[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setExamples(null); setError("");
    void apiFetch(`/words/${encodeURIComponent(wordId)}/examples`, { signal: controller.signal })
      .then(readResponse<WordExample[]>).then((data) => { if (!controller.signal.aborted) setExamples(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? safeErrorMessage(failure) : "Не удалось загрузить примеры"); });
    return () => controller.abort();
  }, [open, wordId, attempt]);
  return <div className={styles.examples}>
    <button className={styles.link} type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? t("Скрыть примеры") : t("Показать примеры")}</button>
    {open && <div>{error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt((value) => value + 1)}>{t("Повторить")}</button></p>
      : examples === null ? <p role="status">{t("Загружаем примеры…")}</p> : !examples.length ? <p className={styles.hint}>{t("Примеров пока нет.")}</p>
      : <>{examples.map((example) => <p key={example.id}>{example.german}<br /><span className={styles.hint}>{displayTranslation(example, t("Перевод отсутствует"))}</span></p>)}</>}</div>}
  </div>;
}
