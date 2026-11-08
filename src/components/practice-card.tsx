"use client";
import { useRef, useState } from "react";
import { barePracticeGerman, correctPracticeArticle, fullPracticeGerman, type NounArticle, type PracticeMode, type PracticeWord } from "@/lib/practice-modes";
import { displayTranslation } from "@/lib/word-view";
import type { WordExample } from "@/lib/card-draft";
import { useI18n } from "./ui-language-provider";
import styles from "./practice-card.module.css";

export function PracticeCard({ word, mode, examples, revealed, onReveal, onAnswer, saving, speechSupported, onSpeak, onSpeakExample, last }: {
  word: PracticeWord; mode: PracticeMode; examples: WordExample[]; revealed: boolean;
  onReveal: () => void; onAnswer: (known: boolean) => void; saving: boolean;
  speechSupported: boolean; onSpeak: () => void; onSpeakExample: (example: WordExample) => void; last: boolean;
}) {
  const { t } = useI18n();
  const [choice, setChoice] = useState<NounArticle | null>(null);
  const choiceLock = useRef(false);
  const correct = choice !== null && correctPracticeArticle(word, choice);
  const articleMode = mode === "article";
  const answerVisible = articleMode ? choice !== null : revealed;
  const color = mode !== "forward" ? "article-neutral" : word.grammaticalNumber === "plural" ? "article-orange" : word.article === "der" ? "article-blue" : word.article === "das" ? "article-green" : word.article === "die" ? "article-red" : "article-neutral";

  function choose(article: NounArticle) {
    if (choiceLock.current || saving) return;
    choiceLock.current = true; setChoice(article);
  }

  return <div className={`study-card ${color} ${styles.card}`}>
    <p className="eyebrow">{t(mode === "reverse" ? "Перевод → немецкий" : articleMode ? "Выберите артикль" : "Немецкий → перевод")}</p>
    <h3 dir="auto">{mode === "reverse" && !answerVisible ? word.selectedTranslation.text : articleMode && !answerVisible ? `___ ${barePracticeGerman(word)}` : fullPracticeGerman(word)}</h3>

    {(mode === "forward" || answerVisible) && <button type="button" className="speak-button" disabled={!speechSupported || saving} onClick={onSpeak}>{t("🔊 Прослушать")}</button>}

    {articleMode && <>
      <div className={styles.articleChoices} role="group" aria-label={t("Выберите артикль")}>
        {(["der", "die", "das"] as const).map(article => <button key={article} type="button" disabled={choice !== null || saving} aria-pressed={choice === article}
          className={choice === null ? "" : article === word.article ? styles.correct : article === choice ? styles.incorrect : ""}
          onClick={() => choose(article)}>{article}</button>)}
      </div>
      {choice !== null && <p role="status" className={correct ? styles.success : styles.error}>
        {correct ? t("Верно!") : t("Правильный артикль: {0}", { 0: word.article })}
      </p>}
    </>}

    {answerVisible && <div className="study-answer">
      <h4 dir="auto">{displayTranslation(word, t("Перевод отсутствует"))}</h4>
      {word.pluralForm && <p>{t("Множественное число:")} {word.pluralForm}</p>}
      {word.notes && <p>{word.notes}</p>}
      {examples.slice(0, 2).map(example => <div key={example.id} className="study-example">
        <p>{example.german}</p><p dir="auto">{displayTranslation(example, t("Перевод отсутствует"))}</p>
        <button type="button" className="small-button secondary-button" disabled={!speechSupported || saving} onClick={() => onSpeakExample(example)}>{t("🔊 Слушать пример")}</button>
      </div>)}
    </div>}

    {!articleMode && <div className="study-card-actions">
      {!answerVisible && <button type="button" className="study-reveal-button" onClick={onReveal} disabled={saving}>{t(mode === "reverse" ? "Показать немецкое слово" : "Показать перевод")}</button>}
      {(mode === "forward" || answerVisible) && <>
        <button type="button" className="study-unknown-button" disabled={saving} onClick={() => onAnswer(false)}>{t(mode === "reverse" ? "Не вспомнил" : "Не знаю — повторить позже")}</button>
        <button type="button" className="study-known-button" disabled={saving} onClick={() => onAnswer(true)}>{t(mode === "reverse" ? "Вспомнил" : "Знаю слово")}</button>
      </>}
    </div>}
    {articleMode && choice !== null && <button type="button" className={styles.next} disabled={saving} onClick={() => onAnswer(correct)}>{t(last ? "Завершить тренировку" : "Следующая карточка")}</button>}
  </div>;
}
