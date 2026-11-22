"use client";

import { useState } from "react";
import { dailyActivityLevel, statisticsDayLabel, type StudyActivity } from "@/lib/study-statistics-client";
import { useI18n } from "./ui-language-provider";
import styles from "./study-statistics-panel.module.css";

export function StudyActivityCalendar({ activity }: { activity: StudyActivity }) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState(() => activity.days.filter(row => row.sessions > 0).at(-1)?.date ?? activity.days.at(-1)!.date);
  const current = activity.days.find(row => row.date === selected) ?? activity.days.at(-1)!;
  const maximum = Math.max(1, ...activity.days.map(row => row.answers));
  const firstWeekday = (new Date(`${activity.days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return <section className={styles.activity} aria-labelledby="activity-heading">
    <h4 id="activity-heading">{t("Активность по дням")}</h4>
    <p>{t("Дней с занятиями: {count}", { count: activity.activeDays })}</p>
    <p className={styles.hint}>{t("Учебный часовой пояс: {zone}", { zone: activity.timeZone })}</p>
    <p className={styles.hint}>{t("Первый и последний день могут быть неполными. Цвет показывает количество ответов. Выберите день, чтобы увидеть результаты.")}</p>
    <div className={styles.calendar} role="group" aria-label={t("Выберите день")}>
      {Array.from({ length: 7 }, (_, i) => <span key={`weekday-${i}`} aria-hidden="true" className={styles.weekday}>{weekday.format(new Date(Date.UTC(2024, 0, 1 + i)))}</span>)}
      {Array.from({ length: firstWeekday }, (_, i) => <span key={`empty-${i}`} aria-hidden="true" />)}
      {activity.days.map(row => {
        const label = t("{date}: ответов {answers}, знаю {known}, нужно повторить {review}", {
          date: statisticsDayLabel(row.date, locale), answers: row.answers, known: row.known, review: row.needsReview,
        });
        return <button type="button" key={row.date} aria-pressed={row.date === current.date} aria-label={label} title={label}
          className={styles[`level${dailyActivityLevel(row.answers, maximum)}`]} onClick={() => setSelected(row.date)}>
          <span aria-hidden="true">{Number(row.date.slice(-2))}</span>
        </button>;
      })}
    </div>
    <div className={styles.dayDetail} aria-live="polite" aria-atomic="true">
      <h5>{statisticsDayLabel(current.date, locale)}</h5>
      {!current.sessions ? <p>{t("В этот день нет сохранённых тренировок")}</p> : <>
        <p>{t("Тренировок: {sessions}; ответов: {answers}", { sessions: current.sessions, answers: current.answers })}</p>
        <p>{t("Знаю: {known}; нужно повторить: {review}", { known: current.known, review: current.needsReview })}</p>
      </>}
    </div>
  </section>;
}
