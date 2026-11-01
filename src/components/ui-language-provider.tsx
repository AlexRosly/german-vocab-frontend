"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { apiClient } from "@/lib/api";
import { INITIAL_AUTH } from "@/lib/api-client";
import { createI18n, isUiLanguage, safeErrorMessage, UI_LANGUAGES, UI_LANGUAGE_STORAGE_KEY, uiLanguage } from "@/lib/i18n";

type UiContext = ReturnType<typeof createI18n> & { changeLanguage: (language: string) => Promise<void> };
const Context = createContext<UiContext | null>(null);
const serverSnapshot = () => INITIAL_AUTH;

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("UiLanguageProvider is required");
  return value;
}

export function UiLanguageProvider({ children }: { children: React.ReactNode }) {
  const auth = useSyncExternalStore(apiClient.subscribe, apiClient.getSnapshot, serverSnapshot);
  const [guestLanguage, setGuestLanguage] = useState("ru");
  const [storageReady, setStorageReady] = useState(false);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const language = uiLanguage(auth.user?.interfaceLanguage ?? guestLanguage);
  const i18n = useMemo(() => createI18n(language), [language]);

  useEffect(() => {
    try { setGuestLanguage(uiLanguage(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY))); } catch { /* Browser storage may be disabled. */ }
    setStorageReady(true);
    const onStorage = (event: StorageEvent) => { if (event.key === UI_LANGUAGE_STORAGE_KEY) setGuestLanguage(uiLanguage(event.newValue)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    if (!storageReady) return;
    try { localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language); } catch { /* The account preference still persists on the server. */ }
    if (auth.user) setGuestLanguage(language);
  }, [language, storageReady, auth.user]);

  async function changeLanguage(value: string) {
    if (!isUiLanguage(value) || saving.current) return;
    const ownerId = apiClient.getSnapshot().user?.id;
    saving.current = true; setPending(true); setError("");
    try {
      if (ownerId) await apiClient.updateInterfaceLanguage(value);
      if (apiClient.getSnapshot().user?.id !== ownerId) return;
      setGuestLanguage(value);
    } catch (failure) {
      if (apiClient.getSnapshot().user?.id === ownerId) setError(safeErrorMessage(failure, "Не удалось сохранить язык интерфейса"));
    } finally { saving.current = false; setPending(false); }
  }

  return <Context.Provider value={{ ...i18n, changeLanguage }}>
    <title>{i18n.t("Wortkarten — немецкие слова")}</title>
    <meta name="description" content={i18n.t("Личные карточки немецких слов и интервальное повторение")} />
    <section className="ui-language" aria-label={i18n.t("Язык интерфейса")} aria-busy={pending}>
      <label htmlFor="interface-language">{i18n.t("Язык интерфейса")}</label>
      <select id="interface-language" value={language} disabled={pending} onChange={(event) => void changeLanguage(event.target.value)}>
        {UI_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
      <span className="hint" role="status">{i18n.t(pending ? "Сохраняем язык интерфейса…" : auth.user ? "Язык сохранён в аккаунте." : "Язык страницы входа сохраняется в этом браузере.")}</span>
      {error && <p role="alert">{i18n.errorText(error)}</p>}
    </section>
    {children}
  </Context.Provider>;
}
