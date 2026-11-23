"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { safeErrorMessage } from "@/lib/i18n";
import { loadStudyBookStatistics, type StudyBookStatistics, type StudyBookSelection } from "@/lib/study-statistics-client";
import { useI18n } from "./ui-language-provider";
import styles from "./study-statistics-panel.module.css";

export function StudyBookStatisticsPanel({ userId, days, refresh }: { userId: string; days: number; refresh: string }) {
  const { t, errorText } = useI18n();
  const [selection, setSelection] = useState<StudyBookSelection>(null);
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: StudyBookStatistics } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const key = JSON.stringify([userId, days, selection, page, refresh, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(""); setLoading(true);
    void loadStudyBookStatistics(apiFetch, days, page, selection, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Не удалось загрузить статистику книг")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, days, page, selection]);
  const data = result?.key === key ? result.data : null;
  const select = (value: StudyBookSelection) => { setSelection(value); setPage(1); };
  return <section className={styles.activity} aria-label={t("По книгам и урокам")} aria-busy={loading}>
    <h4>{t("По книгам и урокам")}</h4>
    <p className={styles.hint}>{t("Используются текущие общие и ваши личные привязки. Слово может входить в несколько книг или уроков: их результаты пересекаются, складывать их не нужно.")}</p>
    <p className={styles.hint}>{t("Считаются сохранённые ответы с доступными записями карточек, включая архив и снятые из словаря слова. После полного удаления карточки её ответы в эту разбивку не входят.")}</p>
    {selection && <><button type="button" onClick={() => select(null)}>{t("Все книги")}</button><h5 className={styles.bookTitle}>{selection.book ?? t("Без книги")}</h5></>}
    {loading ? <p role="status">{t("Загружаем статистику…")}</p> : error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(n => n + 1)}>{t("Повторить")}</button></p> : data && <>
      {!data.totalGroups ? <p>{t("За этот период нет ответов для этой разбивки")}</p> : <>
        <ul className={styles.bookRows}>
          {data.rows.map(row => <li key={selection ? String(row.lessonNumber) : row.sourceBook ?? ""}>
            {selection ? <h5>{row.lessonNumber === null ? t("Без урока") : t("Урок {number}", { number: row.lessonNumber })}</h5> :
              <button type="button" className={styles.bookButton} onClick={() => select({ book: row.sourceBook })}>{row.sourceBook ?? t("Без книги")} · {t("Посмотреть уроки")}</button>}
            <p>{t("Разных слов: {count}", { count: row.words })}</p>
            <p>{t("Тренировок: {sessions}; ответов: {answers}", { sessions: row.sessions, answers: row.answers })}</p>
            <p>{t("Знаю: {known}; нужно повторить: {review}", { known: row.known, review: row.needsReview })}</p>
          </li>)}
        </ul>
        {!data.rows.length && <p>{t("На этой странице нет результатов")}</p>}
        <nav className={styles.periods} aria-label={t("Страницы статистики книг")}>
          <button type="button" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>{t("Предыдущая страница")}</button>
          <span>{t("Страница {page} из {pages}", { page, pages: Math.max(1, Math.ceil(data.totalGroups / data.pageSize)) })}</span>
          <button type="button" disabled={page * data.pageSize >= data.totalGroups} onClick={() => setPage(n => n + 1)}>{t("Следующая страница")}</button>
        </nav>
      </>}
    </>}
  </section>;
}
