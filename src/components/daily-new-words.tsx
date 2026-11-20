"use client";
import { dailyNewWordsPlan } from "@/lib/daily-new-words";
import { useI18n } from "./ui-language-provider";
export function DailyNewWordsSummary({ progress }: { progress: unknown }) {
  const { t, count } = useI18n();
  const plan = dailyNewWordsPlan(progress);
  if (!plan) return null;
  return <div>
    <h5>{t("План новых слов")}</h5>
    <p>{t("Новых слов сегодня: {done} из {goal}", { done: plan.done, goal: plan.goal })}</p>
    <p className="hint">{t("Учебный день: {date} · {zone}", { date: plan.studyDate, zone: plan.timeZone })}</p>
    <p>{plan.remaining ? t("Осталось по плану: {count}", { count: count(plan.remaining) }) : t("План выполнен! Можно продолжать без ограничений.")}</p>
    <p className="hint">{t("Первый сохранённый ответ на слово в любом режиме. Повторные ответы не увеличивают число.")}</p>
  </div>;
}
