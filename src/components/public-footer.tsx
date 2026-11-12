"use client";

import Link from "next/link";
import { useI18n } from "./ui-language-provider";
import styles from "./public-footer.module.css";

const labels: Record<string, { description: string; privacy: string }> = {
  ru: { description: "Wortkarten — карточки немецких слов и интервальное повторение.", privacy: "Конфиденциальность" },
  en: { description: "Wortkarten — German vocabulary cards and spaced repetition.", privacy: "Privacy policy" },
  de: { description: "Wortkarten — deutsche Vokabelkarten und verteiltes Wiederholen.", privacy: "Datenschutz" },
  uk: { description: "Wortkarten — картки німецьких слів та інтервальне повторення.", privacy: "Конфіденційність" },
};

export function PublicFooter() {
  const { language } = useI18n();
  const text = labels[language] ?? labels.en;
  return <footer className={styles.footer}>
    <p>{text.description}</p>
    <Link href="/privacy">{text.privacy}</Link>
  </footer>;
}
