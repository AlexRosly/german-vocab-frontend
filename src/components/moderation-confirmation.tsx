"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "./ui-language-provider";
import styles from "./moderation-panel.module.css";

export function ModerationConfirmation({ title, description, locked, onCancel, children }: {
  title: ReactNode; description: string; locked: boolean; onCancel: () => void; children: ReactNode;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    cancel.current?.focus({ preventScroll: true });
    return () => { element?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} role="alertdialog" className={`${styles.dialog} ${styles.decisionDialog}`}
    aria-labelledby="moderation-confirmation-title" aria-describedby="moderation-confirmation-description" aria-busy={locked}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!locked) onCancel(); }}>
    <h4 id="moderation-confirmation-title">{title}</h4>
    <p id="moderation-confirmation-description" className={styles.hint}>{description}</p>
    <div className={styles.actions}>{children}<button ref={cancel} type="button" disabled={locked} onClick={onCancel}>{t("Отмена")}</button></div>
  </dialog>;
}
