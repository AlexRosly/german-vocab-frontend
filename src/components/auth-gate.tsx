"use client";
import { safeErrorMessage } from "@/lib/i18n";
import { useI18n } from "./ui-language-provider";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { apiClient, AUTH_MUTATION_EVENT } from "@/lib/api";
import { INITIAL_AUTH } from "@/lib/api-client";
import { WordDashboard } from "./word-dashboard";
import styles from "./auth-gate.module.css";

const serverSnapshot = () => INITIAL_AUTH;

export function AuthGate() {
  const { t, errorText } = useI18n();
  const auth = useSyncExternalStore(apiClient.subscribe, apiClient.getSnapshot, serverSnapshot);
  const [connectionError, setConnectionError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    void apiClient.restoreSession().catch((error: unknown) => {
      if (active) setConnectionError(error instanceof Error ? safeErrorMessage(error) : "Не удалось подключиться к серверу");
    });
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("wortkarten-session");
    if (channel) channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === "session-changed") apiClient.invalidateSession();
    };
    const notifyOtherTabs = () => channel?.postMessage("session-changed");
    window.addEventListener(AUTH_MUTATION_EVENT, notifyOtherTabs);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener(AUTH_MUTATION_EVENT, notifyOtherTabs);
    };
  }, []);

  async function retryConnection() {
    setRetrying(true); setConnectionError("");
    try { await apiClient.restoreSession(); }
    catch (error) { setConnectionError(error instanceof Error ? safeErrorMessage(error) : "Не удалось подключиться к серверу"); }
    finally { setRetrying(false); }
  }

  async function logout() {
    setLoggingOut(true); setLogoutError("");
    try { await apiClient.logout(); }
    catch { setLogoutError("Не удалось завершить сессию на сервере. Повторите выход."); }
    finally { setLoggingOut(false); }
  }

  if (!auth.ready) {
    return (
      <main className={styles.entry}>
        <section className={styles.card} aria-busy={!connectionError || retrying}>
          <div className={styles.brand}>W</div><h1>Wortkarten</h1>
          {connectionError ? <>
            <p role="alert">{errorText(connectionError)}</p>
            <button className={styles.primary} type="button" disabled={retrying} onClick={() => void retryConnection()}>
              {retrying ? t("Подключаемся…") : t("Повторить подключение")}
            </button>
          </> : <p role="status">{t("Восстанавливаем сессию…")}</p>}
        </section>
      </main>
    );
  }

  if (!auth.user) return <AuthForm />;
  return <>
    <div className={styles.account}>
      <span>{t("Мой аккаунт:")}{" "}<strong>{auth.user.email ?? t("Пользователь")}</strong></span>
      <button type="button" className={styles.secondary} disabled={loggingOut} onClick={() => void logout()}>
        {loggingOut ? t("Выходим…") : t("Выйти")}
      </button>
      {logoutError && <p className={styles.accountError} role="alert">{errorText(logoutError)}</p>}
    </div>
    <WordDashboard key={auth.user.id} user={auth.user} />
  </>;
}

function AuthForm() {
  const { t, errorText, language, changeLanguage } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if ([...password].length < 12) { setError("Пароль должен содержать не менее 12 символов."); return; }
    if (new TextEncoder().encode(password).length > 72) { setError("Пароль слишком длинный — сократите его."); return; }
    if (registering && password !== confirmation) { setError("Пароли не совпадают."); return; }
    setPending(true);
    try {
      if (registering) {
        await apiClient.register(email, password);
        await changeLanguage(language);
      }
      else await apiClient.signIn(email, password);
    } catch (failure) {
      setError(failure instanceof Error ? safeErrorMessage(failure) : "Не удалось войти. Повторите попытку.");
    } finally { setPending(false); }
  }

  return (
    <main className={styles.entry}>
      <section className={styles.card} aria-labelledby="auth-heading">
        <div className={styles.brand}>W</div>
        <p className={styles.eyebrow}>WORTKARTEN</p>
        <h1 id="auth-heading">{registering ? t("Создать аккаунт") : t("Войти в свой словарь")}</h1>
        <p className={styles.description}>{t("Немецкие слова, примеры и повторения — в твоём темпе.")}</p>
        <form onSubmit={(event) => void submit(event)} className={styles.form} aria-busy={pending}>
          <label htmlFor="auth-email">{t("Email")}</label>
          <input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254}
            value={email} disabled={pending} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="auth-password">{t("Пароль")}</label>
          <input id="auth-password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"}
            required minLength={12} maxLength={72} value={password} disabled={pending}
            aria-describedby="auth-password-help" onChange={(event) => setPassword(event.target.value)} />
          <p id="auth-password-help" className={styles.hint}>{t("Не менее 12 символов")}</p>
          {registering && <>
            <label htmlFor="auth-confirmation">{t("Повтори пароль")}</label>
            <input id="auth-confirmation" name="confirmation" type="password" autoComplete="new-password" required
              minLength={12} maxLength={72} value={confirmation} disabled={pending} onChange={(event) => setConfirmation(event.target.value)} />
          </>}
          {error && <p className={styles.error} role="alert">{errorText(error)}</p>}
          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? t("Подождите…") : registering ? t("Зарегистрироваться") : t("Войти")}
          </button>
        </form>
        <button type="button" className={styles.switchMode} disabled={pending} onClick={() => {
          setMode(registering ? "login" : "register"); setError(""); setPassword(""); setConfirmation("");
        }}>
          {registering ? t("Уже есть аккаунт? Войти") : t("Нет аккаунта? Зарегистрироваться")}
        </button>
      </section>
    </main>
  );
}
