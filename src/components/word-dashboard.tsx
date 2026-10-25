"use client";

import { FormEvent, useEffect, useState } from "react";

type Article = "der" | "das" | "die" | "none";
type GrammaticalNumber = "singular" | "plural" | "not_applicable";
type Word = {
  id: string;
  german: string;
  article: Article;
  grammaticalNumber: GrammaticalNumber;
  translation: string;
  level: string | null;
  lessonNumber: number | null;
  pluralForm?: string | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

function colorClass(word: Word) {
  if (word.grammaticalNumber === "plural") return "article-orange";
  if (word.article === "der") return "article-blue";
  if (word.article === "das") return "article-green";
  if (word.article === "die") return "article-red";
  return "article-neutral";
}

export function WordDashboard() {
  const [words, setWords] = useState<Word[]>([]);
  const [german, setGerman] = useState("");
  const [article, setArticle] = useState<Article>("der");
  const [grammaticalNumber, setGrammaticalNumber] = useState<GrammaticalNumber>("singular");
  const [translation, setTranslation] = useState("");
  const [level, setLevel] = useState("A1");
  const [lessonNumber, setLessonNumber] = useState("1");
  const [status, setStatus] = useState("Подключаемся к API…");
  const [busy, setBusy] = useState(false);

  async function loadWords() {
    try {
      const response = await fetch(`${API_URL}/words`, { cache: "no-store" });
      if (!response.ok) throw new Error("API вернул ошибку");
      const data = await response.json();
      setWords(data);
      setStatus("Подключено к API");
    } catch {
      setStatus("API пока недоступен. Запусти backend и PostgreSQL.");
    }
  }

  useEffect(() => { void loadWords(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          german: german.trim(),
          article,
          grammaticalNumber,
          translation: translation.trim(),
          level,
          lessonNumber: lessonNumber ? Number(lessonNumber) : null
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "Не удалось сохранить слово");
      }
      setGerman("");
      setTranslation("");
      await loadWords();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark">W</div>
        <div>
          <p className="eyebrow">DEUTSCH LERNEN</p>
          <h1>Wortkarten</h1>
        </div>
        <span className="status">{status}</span>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">ТВОЙ СЛОВАРЬ</p>
          <h2>Слова, которые<br /><span>запоминаются.</span></h2>
          <p className="intro-copy">Собирай лексику по урокам и повторяй её с умом.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">В словаре</span>
          <strong>{words.length}</strong>
          <span className="summary-caption">карточек</span>
        </div>
      </section>

      <section className="content-grid">
        <section className="panel form-panel">
          <div className="section-heading">
            <div><p className="eyebrow">НОВАЯ ЗАПИСЬ</p><h3>Добавить слово</h3></div>
            <span className="plus">+</span>
          </div>
          <form onSubmit={submit}>
            <label>Немецкое слово
              <input required value={german} onChange={e => setGerman(e.target.value)} placeholder="например, Tisch" />
            </label>
            <label>Артикль / категория
              <select value={`${article}:${grammaticalNumber}`} onChange={e => {
                const [nextArticle, nextNumber] = e.target.value.split(":") as [Article, GrammaticalNumber];
                setArticle(nextArticle);
                setGrammaticalNumber(nextNumber);
              }}>
                <option value="der:singular">der — мужской род (синий)</option>
                <option value="das:singular">das — средний род (зелёный)</option>
                <option value="die:singular">die — женский род, ед. ч. (красный/розовый)</option>
                <option value="die:plural">die — множественное число (жёлтый/оранжевый)</option>
                <option value="none:not_applicable">Без артикля / не указан</option>
              </select>
            </label>
            <label>Перевод
              <input required value={translation} onChange={e => setTranslation(e.target.value)} placeholder="стол" />
            </label>
            <div className="form-row">
              <label>Уровень
                <select value={level} onChange={e => setLevel(e.target.value)}>
                  {["A1", "A2", "B1", "B2", "C1", "C2"].map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>№ урока
                <input type="number" min="1" value={lessonNumber} onChange={e => setLessonNumber(e.target.value)} />
              </label>
            </div>
            <button disabled={busy} type="submit">{busy ? "Сохраняем…" : "Добавить в словарь"} <span>↗</span></button>
          </form>
          <p className="hint">Это стартовый прототип: вход и повторение подключим следующими этапами.</p>
        </section>

        <section className="word-section">
          <div className="section-heading list-heading">
            <div><p className="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</p><h3>Последние слова</h3></div>
            <span className="count">{words.length} всего</span>
          </div>
          {words.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">Aa</div>
              <h4>Пока здесь пусто</h4>
              <p>Добавь первое слово — оно появится в твоём словаре.</p>
            </div>
          ) : (
            <div className="word-list">
              {words.map(word => (
                <article className={`word-card ${colorClass(word)}`} key={word.id}>
                  <div className="word-color" />
                  <div className="word-main">
                    <h4>{word.grammaticalNumber === "plural" ? "die " : word.article !== "none" ? `${word.article} ` : ""}{word.german}</h4>
                    <p>{word.translation}</p>
                    <div className="word-meta">
                      {word.level && <span>{word.level}</span>}
                      {word.lessonNumber && <span>Урок {word.lessonNumber}</span>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
      <footer>Учись небольшими шагами. Повторяй регулярно.</footer>
    </main>
  );
}
