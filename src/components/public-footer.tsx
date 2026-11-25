"use client";

import Link from "next/link";
import { useI18n } from "./ui-language-provider";
import styles from "./public-footer.module.css";

const labels: Record<string, { description: string; privacy: string; terms: string; contact: string }> = {
  ru: { description: "Wortkarten — карточки немецких слов и интервальное повторение.", privacy: "Конфиденциальность", terms:"Правила проекта", contact:"Контакты" },
  en: { description: "Wortkarten — German vocabulary cards and spaced repetition.", privacy: "Privacy policy", terms:"Project rules", contact:"Contact" },
  de: { description: "Wortkarten — deutsche Vokabelkarten und verteiltes Wiederholen.", privacy: "Datenschutz", terms:"Nutzungsregeln", contact:"Kontakt" },
  uk: { description: "Wortkarten — картки німецьких слів та інтервальне повторення.", privacy: "Конфіденційність", terms:"Правила проєкту", contact:"Контакти" },
};

export function PublicFooter() {
  const { language } = useI18n();
  const text = labels[language] ?? labels.en;
  return <footer className={styles.footer}>
    <p>{text.description}</p>
    <Link href="/privacy">{text.privacy}</Link><Link href="/terms">{text.terms}</Link><Link href="/contact">{text.contact}</Link>
  </footer>;
}
