"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { safeErrorMessage } from "@/lib/i18n";
import { loadStudyDifficultStatistics, type StudyDifficultStatistics } from "@/lib/study-statistics-client";
import { useI18n } from "./ui-language-provider";
import styles from "./study-statistics-panel.module.css";

export function StudyDifficultStatisticsPanel({ userId, days }: { userId: string; days: number }) {
  const { t, errorText } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: StudyDifficultStatistics } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const key = JSON.stringify([userId, days, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(""); setLoading(true);
    void loadStudyDifficultStatistics(apiFetch, days, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Не удалось загрузить статистику трудных слов")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, userId, days]);
  const data = result?.key === key ? result.data : null;
  return <section className={styles.activity} aria-label={t("Статистика трудных слов")} aria-busy={loading}>
    <h4>{t("Статистика трудных слов")}</h4>
    <p className={styles.hint}>{t("Результаты для слов, которые сейчас отмечены трудными в вашем словаре, включая архив. Если изменить отметку или убрать слово из словаря, разбивка пересчитается.")}</p>
    {loading ? <p role="status">{t("Загружаем статистику…")}</p> : error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(n => n + 1)}>{t("Повторить")}</button></p> : data && <>
      <dl className={styles.totals}>
        {([ ["Сейчас отмечено трудными", data.current.words], ["Активных трудных слов", data.current.active], ["Трудных слов в архиве", data.current.archived],
          ["Тренировалось за период", data.period.words], ["Без ответов за период", data.period.withoutAnswers] ] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
      </dl>
      {!data.current.words ? <p>{t("Сейчас нет отмеченных трудных слов")}</p> : !data.period.answers ? <p>{t("За этот период нет сохранённых ответов на эти слова")}</p> : <>
        <p>{t("Тренировок: {sessions}; ответов: {answers}", { sessions: data.period.sessions, answers: data.period.answers })}</p>
        <p>{t("Знаю: {known}; нужно повторить: {review}", { known: data.period.known, review: data.period.needsReview })}</p>
        <p>{t("Доля ответов «Знаю»: {percent}%", { percent: Math.round(100 * data.period.known / data.period.answers) })}</p>
      </>}
      <p className={styles.hint}>{t("Слова считаются по одному, повторные ответы учитываются отдельно. Отметить трудное слово и начать тренировку можно в словаре.")}</p>
    </>}
  </section>;
}
