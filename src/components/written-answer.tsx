"use client";
import { useRef, useState } from "react";
import { correctPracticePlural, correctPracticeSpelling, fullPracticeGerman, practicePlurals } from "@/lib/practice-modes";
import type { PracticeWord } from "@/lib/practice-modes";
import { useI18n } from "./ui-language-provider";
import styles from "./practice-card.module.css";

export function WrittenAnswer({ word, mode, saving, onChecked }: {
  word: PracticeWord; mode: "plural" | "spelling"; saving: boolean; onChecked: (correct: boolean) => void;
}) {
  const { t } = useI18n();
  const plural = mode === "plural";
  const label = plural ? "Введите множественное число" : "Напишите немецкое слово";
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ correct: boolean; skipped: boolean } | null>(null);
  const locked = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  function check(skipped = false) {
    if (locked.current || saving || (!skipped && !answer.trim())) return;
    locked.current = true;
    const correct = !skipped && (plural ? correctPracticePlural(word, answer) : correctPracticeSpelling(word, answer));
    setResult({ correct, skipped });
    input.current?.blur();
    onChecked(correct);
  }

  return <div className={styles.writtenAnswer}>
    <form onSubmit={event => { event.preventDefault(); check(); }}>
      <label htmlFor="practice-written-answer">{t(label)}</label>
      <input ref={input} id="practice-written-answer" type="text" lang="de" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        maxLength={plural ? 200 : 220} value={answer} onChange={event => setAnswer(event.target.value)} disabled={saving || result !== null}
        aria-describedby="practice-written-hint" enterKeyHint="done" />
      <p id="practice-written-hint" className={styles.hint}>{t(plural ? "Можно с артиклем die или без него. Регистр не учитывается, умлауты и ß важны." : "Напишите слово из этой карточки. Учитываются регистр, умлауты и ß. Артикль существительного можно опустить.")}</p>
      {result === null && <div className={styles.inputActions}>
        <button type="submit" disabled={saving || !answer.trim()}>{t("Проверить ответ")}</button>
        <button type="button" className="secondary-button" disabled={saving} onClick={() => check(true)}>{t("Не знаю")}</button>
      </div>}
    </form>
    {result !== null && <div role="status" aria-live="polite">
      <p className={result.correct ? styles.success : styles.error}>{t(result.correct ? "Верно!" : "Нужно повторить")}</p>
      {!result.correct && !result.skipped && <p>{t("Ваш ответ: {0}", { 0: answer })}</p>}
      <p><strong>{t(plural ? "Множественное число:" : "Правильный ответ:")}</strong> {plural ? practicePlurals(word).map(form => `die ${form}`).join(" / ") : fullPracticeGerman(word)}</p>
    </div>}
  </div>;
}
