"use client";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { loadGoogleIdentity } from "@/lib/google-identity";
import { useI18n } from "./ui-language-provider";
import styles from "./google-sign-in.module.css";

export function GoogleSignIn({ purpose, disabled, onCredential, onBusy }: {
  purpose: "login" | "link"; disabled: boolean; onCredential: (credential: string) => Promise<void>; onBusy?: (busy: boolean) => void;
}) {
  const { t, errorText, language } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ disabled, onCredential, onBusy }); latest.current = { disabled, onCredential, onBusy };
  const submitting = useRef(false), mounted = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; latest.current.onBusy?.(false); }; }, []);
  useEffect(() => {
    const abort = new AbortController(); const element = host.current;
    setReady(false); setEnabled(null); setError(null); element?.replaceChildren();
    void (async () => {
      try {
        const config = await apiClient.googleConfig(abort.signal);
        if (abort.signal.aborted) return;
        setEnabled(config.enabled); if (!config.enabled) return;
        const [api, challenge] = await Promise.all([loadGoogleIdentity(), apiClient.googleChallenge(purpose, abort.signal)]);
        if (abort.signal.aborted || !element) return;
        api.initialize({ client_id: challenge.clientId, nonce: challenge.nonce, auto_select: false, ux_mode: "popup", callback: response => {
          if (abort.signal.aborted || latest.current.disabled || submitting.current || !response.credential) return;
          submitting.current = true; setBusy(true); latest.current.onBusy?.(true);
          void latest.current.onCredential(response.credential).catch(failure => {
            if (mounted.current) { setError(failure); setReady(false); }
          }).finally(() => {
            submitting.current = false;
            if (mounted.current) { setBusy(false); latest.current.onBusy?.(false); }
          });
        } });
        api.renderButton(element, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: Math.max(200, Math.min(360, element.clientWidth)), locale: language });
        setReady(true);
      } catch (failure) { if (!abort.signal.aborted) setError(failure); }
    })();
    return () => { abort.abort(); element?.replaceChildren(); };
  }, [attempt, language, purpose]);
  return <div className={styles.widget} hidden={enabled === false} aria-label={t(purpose === "login" ? "Вход через Google" : "Подключение Google")} aria-busy={busy}>
    <div ref={host} className={disabled || busy || !ready ? styles.blocked : undefined} hidden={!!error} inert={disabled || busy || !ready || !!error} />
    {busy && <p role="status">{t("Подождите…")}</p>}
    {!ready && !error && !busy && <p role="status">{t("Загружаем Google-вход…")}</p>}
    {!!error && <div role="alert"><p>{errorText(error)}</p><button type="button" disabled={busy || disabled} onClick={() => setAttempt(value => value + 1)}>{t("Повторить вход через Google")}</button></div>}
  </div>;
}
