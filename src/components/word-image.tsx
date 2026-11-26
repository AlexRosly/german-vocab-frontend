"use client";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { WordImagesClient, WordImagesError, type WordImageInfo } from "@/lib/word-images-client";
import { useI18n } from "./ui-language-provider";
import styles from "./word-image.module.css";
const client = new WordImagesClient(apiFetch);

export function useWordImagesEnabled(identity: string) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { const controller = new AbortController(); setEnabled(false); void client.config(controller.signal).then(v => { if (!controller.signal.aborted) setEnabled(v); }).catch(() => {}); return () => controller.abort(); }, [identity]);
  return enabled;
}
export function WordImage({ wordId, german, enabled, editable = false, disabled = false, onChanged }: { wordId: string; german: string; enabled: boolean; editable?: boolean; disabled?: boolean; onChanged?: () => void }) {
  const { t, errorText } = useI18n();
  const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false), [attempt, setAttempt] = useState(0);
  const [image, setImage] = useState<WordImageInfo | null>(null), [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false);
  const [file, setFile] = useState<File | null>(null), [fileKey, setFileKey] = useState(0), [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null), saving = useRef(false);
  useEffect(() => { if (!enabled) return; if (!window.IntersectionObserver) { setVisible(true); return; } const observer = new IntersectionObserver(rows => { if (rows.some(row => row.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "200px" }); if (root.current) observer.observe(root.current); return () => observer.disconnect(); }, [enabled]);
  useEffect(() => {
    if (!enabled || !visible) return;
    const controller = new AbortController(); let created: string | null = null;
    setLoading(true); setError(""); setUrl(null);
    void (async () => { const current = await client.get(wordId, controller.signal); if (controller.signal.aborted) return; setImage(current); setLoaded(true); setConflict(false);
      if (current) { const blob = await client.blob(wordId, current, controller.signal); if (controller.signal.aborted) return; created = URL.createObjectURL(blob); setUrl(created); }
    })().catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить или сохранить изображение"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (created) URL.revokeObjectURL(created); };
  }, [wordId, enabled, visible, attempt]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (!open) return; const element = dialog.current, container = root.current, overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; element?.showModal(); return () => { element?.close(); document.body.style.overflow = overflow; if (container?.isConnected) (container.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? container).focus(); }; }, [open]);
  async function mutate(remove = false) {
    if (saving.current || disabled || !loaded || conflict || (!remove && !file)) return;
    const controller = new AbortController(); request.current = controller; saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const saved = remove ? await client.remove(wordId, image!.revision, controller.signal) : await client.save(wordId, image?.revision ?? null, file!, controller.signal);
      if (controller.signal.aborted) return;
      setImage(saved); setFile(null); setFileKey(v => v + 1); setAttempt(v => v + 1); setNotice(remove ? "Изображение убрано из карточки" : "Изображение сохранено"); onChanged?.();
    } catch (e) { if (!controller.signal.aborted) { setConflict(e instanceof WordImagesError && e.status === 409); setError(e instanceof Error ? e.message : "Не удалось загрузить или сохранить изображение"); } }
    finally { saving.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  if (!enabled || (loaded && !image && !editable && !error)) return null;
  const picture = url && image ? <Image src={url} width={image.width} height={image.height} unoptimized alt={t("Иллюстрация: {0}", { 0: german })} className={styles.picture} /> : null;
  return <div ref={root} className={styles.root} tabIndex={-1}>
    {picture && <button ref={trigger} type="button" className={styles.preview} aria-label={t("Открыть изображение: {0}", { 0: german })} onClick={() => setOpen(true)}>{picture}</button>}
    {editable && !picture && <button ref={trigger} type="button" disabled={disabled || loading} onClick={() => setOpen(true)}>{t("Изображение")}</button>}
    {editable && picture && <button type="button" disabled={disabled || loading} onClick={() => setOpen(true)}>{t("Изменить изображение")}</button>}
    {!open && error && <p role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt(v => v + 1)}>{t("Повторить")}</button></p>}
    {open && createPortal(<dialog ref={dialog} className={styles.dialog} aria-label={t("Изображение карточки")} onCancel={event => { event.preventDefault(); if (!busy) setOpen(false); }}>
      <header><h3>{t("Изображение карточки")}</h3><button type="button" disabled={busy} onClick={() => setOpen(false)}>{t("Закрыть")}</button></header>
      <p>{german}</p>{picture}{loading && <p role="status">{t("Загружаем изображение…")}</p>}
      {editable && <><p>{t("Общее изображение карточки. JPEG, PNG или WebP до 4 МБ. Сохраняйте только изображения, которые разрешено использовать.")}</p>
        <label>{t("Файл изображения")}<input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy || loading || conflict} onChange={e => { setFile(e.target.files?.[0] ?? null); setNotice(""); }} /></label>
        <div className={styles.actions}><button type="button" disabled={disabled || busy || loading || !loaded || conflict || !file} onClick={() => void mutate()}>{t(busy ? "Сохраняем…" : "Сохранить изображение")}</button>
        {image && <button type="button" disabled={disabled || busy || loading || conflict} onClick={() => { if (window.confirm(t("Убрать изображение из общей карточки?"))) void mutate(true); }}>{t("Убрать изображение")}</button>}</div></>}
      {error && <p role="alert">{errorText(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
      {(conflict || error) && <button type="button" disabled={busy || loading} onClick={() => setAttempt(v => v + 1)}>{t("Загрузить актуальную версию")}</button>}
    </dialog>, document.body)}
  </div>;
}
