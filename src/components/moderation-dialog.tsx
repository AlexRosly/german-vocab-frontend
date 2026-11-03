"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "./ui-language-provider";
import styles from "./moderation-panel.module.css";
export function ModerationDialog({ children, locked, onClose, restoreFocus }: {
  children: ReactNode; locked: boolean; onClose: () => void; restoreFocus: () => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const restore = useRef(restoreFocus);
  useEffect(() => { restore.current = restoreFocus; }, [restoreFocus]);
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; restore.current(); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="moderation-dialog-title" onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <header className={styles.dialogHeader}><h3 id="moderation-dialog-title">{t("Проверка карточки")}</h3><button type="button" disabled={locked} onClick={onClose}>{t("Закрыть")}</button></header>
    <div className={styles.dialogBody}>{children}</div>
  </dialog>;
}
