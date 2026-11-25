"use client";
import { useEffect, useRef, useState } from "react";
import { apiClient, apiFetch } from "@/lib/api";
import { useI18n } from "./ui-language-provider";
import { ModerationDialog } from "./moderation-dialog";
import { GoogleSignIn } from "./google-sign-in";
import styles from "./data-controls.module.css";

type Config = { enabled: true; password: boolean; google: boolean };
export function AccountArchivePanel({ userId }: { userId: string }) {
  const { t, errorText } = useI18n();
  const [config, setConfig] = useState<Config | null>(null), [hidden, setHidden] = useState(false), [error, setError] = useState<unknown>(null), [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false), [confirmation, setConfirmation] = useState(""), [method, setMethod] = useState<"password" | "google">("password"), [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), writing = useRef(false);
  useEffect(() => { const c = new AbortController(); setError(null); void apiFetch('/auth/account/archive-config', { cache: 'no-store', signal: c.signal }).then(async r => {
    if (r.status === 404) { if (!c.signal.aborted) setHidden(true); return; }
    if (!r.ok) throw Error("Не удалось загрузить настройки аккаунта");
    const d = await r.json(); if (d?.enabled !== true || typeof d.password !== 'boolean' || typeof d.google !== 'boolean') throw Error("Не удалось загрузить настройки аккаунта");
    if (!c.signal.aborted) { setConfig(d); setMethod(d.password ? 'password' : 'google'); }
  }).catch(e => { if (!c.signal.aborted) setError(e); }); return () => c.abort(); }, [userId, attempt]);
  async function archive(credential?: string) {
    if (writing.current || confirmation !== 'DELETE') return;
    writing.current = true; setBusy(true); setError(null);
    try { await apiClient.archiveAccount({ confirmation: 'ARCHIVE', method, ...(method === 'password' ? { password } : { credential }) }); }
    catch (e) { setError(e); if (credential) throw e; }
    finally { setPassword(''); writing.current = false; setBusy(false); }
  }
  if (hidden) return null;
  return <section className={styles.panel} aria-labelledby="account-archive-title"><h3 id="account-archive-title">{t("Удалить аккаунт")}</h3>
    <p>{t("Все входы будут завершены. Словарь, личные материалы и прогресс сохранятся. Вернуться можно через восстановление аккаунта с паролем или Google.")}</p>
    <p><a href="#dictionary-export-heading">{t("Перед удалением можно скачать свои данные")}</a></p>
    <button ref={trigger} type="button" disabled={!config || busy} onClick={() => { setOpen(true); setError(null); setConfirmation(''); setPassword(''); }}>{t("Удалить аккаунт")}</button>
    <p className="hint">{t("Персональные данные сохраняются. Для их полного удаления напишите владельцу сервиса.")} <a href="mailto:rosly.a777@gmail.com">rosly.a777@gmail.com</a></p>
    {!open && !!error && <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(n => n + 1)}>{t("Повторить")}</button></p>}
    {open && config && <ModerationDialog className={styles.archiveDialog} title={t("Подтвердить удаление аккаунта")} locked={busy} onClose={() => { setOpen(false); setPassword(''); }} restoreFocus={() => trigger.current?.focus()}>
      <div className={`${styles.form} ${styles.archiveContent}`}><p>{t("Это обратимое действие. Доступ к аккаунту будет отключён на всех устройствах. Словарь, личные материалы и прогресс сохранятся для восстановления.")}</p>
      <label>{t("Для подтверждения введите DELETE")}<input autoComplete="off" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} /></label>
      {config.password && config.google && <><label htmlFor="account-archive-method">{t("Способ подтверждения")}</label><select id="account-archive-method" value={method} disabled={busy} onChange={e => { setMethod(e.target.value as 'password' | 'google'); setPassword(''); setError(null); }}><option value="password">{t("Пароль аккаунта")}</option><option value="google">Google</option></select></>}
      {method === 'password' && config.password && <form className={styles.form} onSubmit={e => { e.preventDefault(); void archive(); }}><label>{t("Пароль текущего аккаунта")}<input type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label><button type="submit" disabled={busy || confirmation !== 'DELETE' || !password}>{t(busy ? "Подождите…" : "Удалить аккаунт и выйти на всех устройствах")}</button></form>}
      {method === 'google' && config.google && confirmation === 'DELETE' && <><p>{t("Подтвердите тот Google-аккаунт, который подключён к этому профилю.")}</p><GoogleSignIn purpose="archive" disabled={busy} onCredential={credential => archive(credential)} /></>}
      {!config.google && !config.password && <p>{t("Подтверждение недоступно. Напишите владельцу сервиса.")}</p>}
      {!!error && <p role="alert">{errorText(error)}</p>}</div>
    </ModerationDialog>}
  </section>;
}
