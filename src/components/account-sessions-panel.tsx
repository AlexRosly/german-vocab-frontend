"use client";
import { useEffect, useRef, useState } from "react";
import { apiClient, apiFetch } from "@/lib/api";
import { AccountSessionsClient, type AccountSessions } from "@/lib/account-sessions-client";
import { useI18n } from "./ui-language-provider";
import styles from "./account-sessions-panel.module.css";
const client = new AccountSessionsClient(apiFetch);

export function AccountSessionsPanel({ userId }: { userId: string }) {
  const { t, errorText, date } = useI18n();
  const [data, setData] = useState<AccountSessions | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const saving = useRef(false);
  const action = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setConfirmation(null);
    void client.list(controller.signal).then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setError("Не удалось загрузить активные входы"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); action.current?.abort(); };
  }, [userId, attempt]);
  async function endSession(id: string) {
    if (saving.current) return;
    const controller = new AbortController(); action.current = controller;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (id === "all") await apiClient.logoutAll();
      else await client.revoke(id, controller.signal);
      if (!controller.signal.aborted) { setNotice("Вход завершён."); setConfirmation(null); setAttempt((value) => value + 1); }
    } catch {
      if (!controller.signal.aborted) setError(id === "all" ? "Не удалось выйти на всех устройствах. Повторите попытку." : "Не удалось завершить вход");
    } finally { saving.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className={styles.panel} aria-labelledby="sessions-heading" aria-busy={busy || loading}>
    <div className={styles.heading}><h3 id="sessions-heading">{t("Активные входы")}</h3>
      <button type="button" disabled={busy || loading} onClick={() => { setNotice(""); setAttempt((value) => value + 1); }}>{t("Обновить список входов")}</button></div>
    <p className={styles.hint}>{t("Здесь входы в ваш аккаунт. Завершённый вход потребует повторной авторизации.")}</p>
    <p className={styles.hint}>{t("Обновление доступа не означает активность человека. Названия устройств и IP пока не сохраняются.")}</p>
    {error && <p role="alert">{errorText(error)} {!data && <button type="button" onClick={() => setAttempt((value) => value + 1)}>{t("Повторить")}</button>}</p>}
    {notice && <p role="status">{t(notice)}</p>}
    {loading ? <p role="status">{t("Загружаем активные входы…")}</p> : data && <>
      <ul className={styles.list}>{data.sessions.map((session, index) => <li key={session.id}>
        <div><h4>{t(session.current ? "Этот вход" : "Другой вход {number}", { number: index })}</h4>
          <p>{t("Создан: {date}", { date: date(session.createdAt) })}</p>
          <p>{t("Действует до: {date}", { date: date(session.refreshExpiresAt) })}</p>
          <p>{t("Обновление доступа: {date}", { date: date(session.updatedAt) })}</p></div>
        {!session.current && <button type="button" disabled={busy} onClick={() => { setConfirmation(session.id); setError(""); setNotice(""); }}>{t("Завершить этот вход")}</button>}
        {session.current && <span>{t("Для выхода здесь используйте кнопку «Выйти» вверху страницы.")}</span>}
      </li>)}</ul>
      {data.hasMore && <p>{t("Показаны последние 100 других входов. Чтобы завершить все, используйте «Выйти на всех устройствах».")}</p>}
      <button type="button" disabled={busy} onClick={() => { setConfirmation("all"); setError(""); setNotice(""); }}>{t("Выйти на всех устройствах")}</button>
    </>}
    {confirmation && <div className={styles.confirmation} role="group" aria-label={t("Подтверждение выхода")}>
      <p>{t(confirmation === "all" ? "Завершить все входы, включая текущий? Потребуется войти снова." : "Завершить выбранный вход? На нём потребуется войти снова.")}</p>
      <button type="button" disabled={busy} onClick={() => void endSession(confirmation)}>{t(busy ? "Завершаем вход…" : "Подтвердить выход")}</button>
      <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>{t("Отмена")}</button>
    </div>}
  </section>;
}
