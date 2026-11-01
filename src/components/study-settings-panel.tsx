"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { StudySettingsClient, type StudySettings } from "@/lib/study-settings-client";
import { useI18n } from "./ui-language-provider";
import styles from "./study-settings-panel.module.css";
const client = new StudySettingsClient(apiFetch);
const zones = ["UTC", "Europe/Berlin", "Europe/Kyiv", "Europe/London", "Europe/Paris", "Europe/Warsaw", "Europe/Moscow", "Asia/Almaty", "Asia/Tbilisi", "America/New_York", "America/Los_Angeles"];

export function StudySettingsPanel({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const { t, errorText } = useI18n();
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const [goal, setGoal] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const saving = useRef(false);
  const writeController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setSettings(null); setError(""); setSaved(false);
    void client.get(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setSettings(data); setTimeZone(data.timeZone); setGoal(String(data.dailyGoal));
    }).catch(() => { if (!controller.signal.aborted) setError("Не удалось сохранить или загрузить настройки обучения"); });
    return () => { controller.abort(); writeController.current?.abort(); };
  }, [userId, attempt]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (saving.current || !settings) return;
    const controller = new AbortController(); writeController.current = controller;
    saving.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      const data = await client.save({ timeZone, dailyGoal: Number(goal) }, controller.signal);
      if (!controller.signal.aborted) { setSettings(data); setTimeZone(data.timeZone); setGoal(String(data.dailyGoal)); setSaved(true); onSaved(); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Не удалось сохранить или загрузить настройки обучения"); }
    finally { if (!controller.signal.aborted) { saving.current = false; setBusy(false); } }
  }
  return <section className={styles.panel} aria-labelledby="settings-heading">
    <h3 id="settings-heading">{t("Настройки обучения")}</h3>
    <p>{t("Цель и часовой пояс сохраняются в вашем аккаунте.")}</p>
    {!settings ? error ? <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt((value) => value + 1)}>{t("Повторить")}</button></p> : <p role="status">{t("Загружаем настройки…")}</p> : <form onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy} className={styles.fields}>
        <label htmlFor="daily-goal-input">{t("Ежедневная цель, слов")}</label>
        <input id="daily-goal-input" type="number" min={1} max={500} step={1} required value={goal} onChange={(event) => { setGoal(event.target.value); setSaved(false); }} />
        <label htmlFor="time-zone-input">{t("Часовой пояс")}</label>
        <input id="time-zone-input" list="time-zone-options" required maxLength={100} value={timeZone} onChange={(event) => { setTimeZone(event.target.value); setSaved(false); }} />
        <datalist id="time-zone-options">{[...new Set([...zones, settings.timeZone])].map((zone) => <option key={zone} value={zone} />)}</datalist>
        <button type="button" onClick={() => { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); setSaved(false); }}>{t("Использовать часовой пояс браузера")}</button>
        <p className={styles.hint}>{t("Например, Europe/Berlin. Сутки учитывают переход на летнее и зимнее время.")}</p>
        <p className={styles.hint}>{t("Цель считает разные слова текущего словаря, изученные за день. Повтор одного слова в тот же день не увеличивает цель.")}</p>
        <button type="submit">{t(busy ? "Сохраняем настройки…" : "Сохранить настройки")}</button>
      </fieldset>
      {error && <p role="alert">{errorText(error)}</p>}
      {saved && <p role="status">{t("Настройки обучения сохранены.")}</p>}
    </form>}
  </section>;
}

export type DailyProgress = StudySettings & { studiedToday: number; studyDate: string };
export function DailyGoalCard({ progress, loading, error, onRetry }: { progress: DailyProgress | null; loading: boolean; error: string; onRetry: () => void }) {
  const { t, count } = useI18n();
  return <section className="daily-goal" aria-label={t("Цель на сегодня")}>
    <h3>{t("Цель на сегодня")}</h3>
    {loading ? <p role="status">{t("Загружаем статистику…")}</p> : error || !progress ? <p>{t("Не удалось загрузить статистику")} <button type="button" onClick={onRetry}>{t("Повторить")}</button></p> : <>
      <p>{t("Изучено сегодня: {done} из {goal}", { done: progress.studiedToday, goal: progress.dailyGoal })}</p>
      <p className={styles.hint}>{t("Учебный день: {date} · {zone}", { date: progress.studyDate, zone: progress.timeZone })}</p>
      <div className="daily-goal-track" role="progressbar" aria-label={t("Цель на сегодня")} aria-valuemin={0} aria-valuemax={progress.dailyGoal} aria-valuenow={Math.min(progress.studiedToday, progress.dailyGoal)}>
        <div className="daily-goal-fill" style={{ width: `${Math.min(progress.studiedToday / progress.dailyGoal, 1) * 100}%` }} />
      </div>
      <p>{progress.studiedToday >= progress.dailyGoal ? t("Цель достигнута!") : t("До цели осталось: {count}", { count: count(progress.dailyGoal - progress.studiedToday) })}</p>
    </>}
  </section>;
}
