"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { historyModeLabel } from "@/lib/study-history-client";
import { safeErrorMessage } from "@/lib/i18n";
import { loadStudyStatistics, type StudyStatistics } from "@/lib/study-statistics-client";
import { useI18n } from "./ui-language-provider";
import { StudyActivityCalendar } from "./study-activity-calendar";
import styles from "./study-statistics-panel.module.css";

export function StudyStatisticsPanel({ userId, version }: { userId: string; version: number }) {
  const { t, errorText, date } = useI18n();
  const [days, setDays] = useState(30);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ userId: string; data: StudyStatistics } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    void loadStudyStatistics(apiFetch, days, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ userId, data }); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Не удалось загрузить статистику обучения")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, version, days, attempt]);
  const data = result?.userId === userId && result.data.days === days ? result.data : null;
  return <section className={styles.panel} aria-labelledby="statistics-heading" aria-busy={loading}>
    <div className={styles.heading}><h3 id="statistics-heading">{t("Статистика обучения")}</h3>
      <button type="button" disabled={loading} onClick={() => setAttempt(n => n + 1)}>{t("Обновить статистику")}</button>
    </div>
    <div className={styles.periods} role="group" aria-label={t("Период статистики")}>
      {[7, 30, 90].map(n => <button type="button" key={n} aria-pressed={days === n} onClick={() => setDays(n)}>{t("За {days} дней", { days: n })}</button>)}
    </div>
    <p className={styles.hint}>{t("Последние 7, 30 или 90 суток до момента обновления. Считаются все сохранённые результаты вашего аккаунта, включая архив и снятые из словаря слова.")}</p>
    {loading ? <p role="status">{t("Загружаем статистику…")}</p> : error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(n => n + 1)}>{t("Повторить")}</button></p> : data && <>
      <p className={styles.hint}>{date(data.from)} — {date(data.to)}</p>
      {!data.totals.sessions ? <p>{t("За этот период нет сохранённых тренировок")}</p> : <>
        <dl className={styles.totals}>
          {([ ["Сохранено тренировок", data.totals.sessions], ["Ответов", data.totals.answers], ["Знаю", data.totals.known], ["Нужно повторить", data.totals.needsReview] ] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
        </dl>
        <p>{t("Доля ответов «Знаю»: {percent}%", { percent: Math.round(100 * data.totals.known / data.totals.answers) })}</p>
        <ul className={styles.modes}>
          {data.byMode.filter(row => row.sessions > 0).map(row => <li key={row.mode ?? "unknown"}>
            <h4>{t(historyModeLabel(row.mode))}</h4>
            <p>{t("Тренировок: {sessions}; ответов: {answers}", { sessions: row.sessions, answers: row.answers })}</p>
            <p>{t("Знаю: {known}; нужно повторить: {review}", { known: row.known, review: row.needsReview })}</p>
          </li>)}
        </ul>
      </>}
      {data.activity ? <StudyActivityCalendar key={`${userId}-${data.from}-${data.to}`} activity={data.activity} /> : <p className={styles.hint}>{t("Дневная активность пока недоступна")}</p>}
    </>}
    <p className={styles.hint}>{t("Ответы могут относиться к одним и тем же словам. Длинная тренировка сохраняется частями; каждая часть учитывается отдельно. «Знаю» — ваша оценка ответа, а не измерение уровня языка.")}</p>
  </section>;
}
