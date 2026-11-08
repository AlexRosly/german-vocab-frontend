"use client";
import { useEffect, useState } from "react";
import { apiClient, apiFetch } from "@/lib/api";
import { GoogleSignIn } from "./google-sign-in";
import { useI18n } from "./ui-language-provider";
import styles from "./google-sign-in.module.css";

export function GoogleAccountPanel({ userId }: { userId: string }) {
  const { t, errorText } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null), [connected, setConnected] = useState<boolean | null>(null);
  const [password, setPassword] = useState(""), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(null); setOpen(false); setPassword(""); setConnected(null); setEnabled(null);
    void (async () => {
      try {
        const config = await apiClient.googleConfig(abort.signal);
        if (abort.signal.aborted) return;
        setEnabled(config.enabled); if (!config.enabled) return;
        const response = await apiFetch("/auth/google/account", { signal: abort.signal });
        if (!response.ok) throw new Error("Не удалось загрузить подключение Google");
        const data = await response.json();
        if (typeof data?.connected !== "boolean") throw new Error("Не удалось загрузить подключение Google");
        if (!abort.signal.aborted) setConnected(data.connected);
      } catch (failure) { if (!abort.signal.aborted) setError(failure); }
    })();
    return () => abort.abort();
  }, [userId, attempt]);
  return <section className={styles.panel} aria-label={t("Вход через Google")}>
    <h3>{t("Вход через Google")}</h3>
    {enabled === false ? <p>{t("Вход через Google пока не настроен")}</p> : connected === true ? <p role="status">{t("Google подключён. Можно входить в этот же аккаунт через Google.")}</p>
      : connected === false ? <>
        <p>{t("Подтвердите пароль текущего аккаунта и выберите Google-аккаунт. Словарь и прогресс сохранятся.")}</p>
        <label>{t("Пароль текущего аккаунта")}<input type="password" autoComplete="current-password" maxLength={72} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        {!open ? <button type="button" disabled={busy || [...password].length < 12 || new TextEncoder().encode(password).length > 72} onClick={() => setOpen(true)}>{t("Подключить Google")}</button>
          : <GoogleSignIn purpose="link" disabled={busy || [...password].length < 12 || new TextEncoder().encode(password).length > 72} onBusy={setBusy} onCredential={async credential => {
            await apiClient.linkGoogle(credential, password); setPassword(""); setConnected(true); setOpen(false);
          }} />}
      </> : !error ? <p role="status">{t("Загружаем Google-вход…")}</p> : null}
    {!!error && <div role="alert"><p>{errorText(error)}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{t("Повторить")}</button></div>}
  </section>;
}
