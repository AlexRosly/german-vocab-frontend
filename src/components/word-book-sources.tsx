"use client";
import { sharedBookSources, type BookWord } from "@/lib/word-books";
import { useI18n } from "./ui-language-provider";
export function WordBookSources({ word }: { word: BookWord }) {
  const { t } = useI18n();
  const rows = sharedBookSources(word);
  if (!rows.length) return word.lessonNumber == null ? null : <p style={{ margin: 0 }}>{t("Урок")} {word.lessonNumber}</p>;
  return <div style={{ display: "grid", gap: ".3rem", overflowWrap: "anywhere" }} aria-label={t("Книга-источник")}>
    {rows.map(row => <p key={row.sourceBook} style={{ margin: 0 }}><strong>{row.sourceBook}</strong>{row.lessonNumbers.length > 0 && <> · {t("Урок")} {row.lessonNumbers.join(", ")}</>}</p>)}
  </div>;
}
