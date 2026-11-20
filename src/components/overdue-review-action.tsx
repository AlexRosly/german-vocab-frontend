"use client";
import { useEffect, useState } from "react";
import { overdueReviewWords, reviewDay, type ReviewSchedule } from "@/lib/overdue-review";
import { useI18n } from "./ui-language-provider";

export function OverdueReviewAction<T extends { id: string }>({ words, due, timeZone, disabled, onStart }: {
  words: readonly T[]; due: readonly ReviewSchedule[]; timeZone?: string; disabled: boolean; onStart: () => void;
}) {
  const { t, count } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setNow(new Date()); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const ready = reviewDay(now, timeZone) !== null;
  const queue = overdueReviewWords(words, due, timeZone, now);
  return <div>
    <h5>{t("Просроченные повторения")}</h5>
    <p className="hint">{ready ? t("Срок раньше сегодняшнего дня ({0}). Сначала самые давние.", { 0: timeZone! }) : t("Часовой пояс ещё не загружен. Обновите словарь или повторите загрузку статистики.")}</p>
    <button type="button" disabled={disabled || !ready || !queue.length} onClick={onStart}>{t("Повторить просроченные ({count})", { count: count(queue.length) })}</button>
  </div>;
}
