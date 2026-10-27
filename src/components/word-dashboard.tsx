"use client";

import { FormEvent, useEffect, useState } from "react";

type Article = "der" | "das" | "die" | "none";
type GrammaticalNumber = "singular" | "plural" | "not_applicable";

type WordExample = {
  id: string;
  wordId: string;
  german: string;
  translation: string;
};

type Word = {
  id: string;
  german: string;
  article: Article;
  grammaticalNumber: GrammaticalNumber;
  translation: string;
  level: string | null;
  lessonNumber: number | null;
  pluralForm?: string | null;
  notes?: string | null;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

function colorClass(w: Word) {
  if (w.grammaticalNumber === "plural") return "article-orange";
  if (w.article === "der") return "article-blue";
  if (w.article === "das") return "article-green";
  if (w.article === "die") return "article-red";
  return "article-neutral";
}

export function WordDashboard() {
  const [words, setWords] = useState<Word[]>([]);
  const [examplesByWord, setExamplesByWord] = useState<Record<string, WordExample[]>>({});
  const [exampleInputs, setExampleInputs] = useState<Record<string, { german: string; translation: string }>>({});
  const [editingExampleId, setEditingExampleId] = useState<string | null>(null);
  const [editingExampleWordId, setEditingExampleWordId] = useState<string | null>(null);
  const [exampleBusyWordId, setExampleBusyWordId] = useState<string | null>(null);

  const [german, setGerman] = useState("");
  const [article, setArticle] = useState<Article>("der");
  const [grammaticalNumber, setGrammaticalNumber] =
    useState<GrammaticalNumber>("singular");
  const [translation, setTranslation] = useState("");
  const [level, setLevel] = useState("A1");
  const [lessonNumber, setLessonNumber] = useState("1");
  const [pluralForm, setPluralForm] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Подключаемся к API…");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function fetchExamples(wordId: string): Promise<WordExample[]> {
    const response = await fetch(`${API_URL}/words/${wordId}/examples`, {
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw Error(body?.message ?? "Не удалось загрузить примеры");
    }
    return response.json();
  }

  async function loadWords() {
    try {
      const response = await fetch(`${API_URL}/words`, { cache: "no-store" });
      if (!response.ok) throw Error("API вернул ошибку");
      const loadedWords: Word[] = await response.json();
      setWords(loadedWords);

      const examples = await Promise.all(
        loadedWords.map(async (word) => {
          try {
            return [word.id, await fetchExamples(word.id)] as const;
          } catch {
            return [word.id, []] as const;
          }
        })
      );
      setExamplesByWord(Object.fromEntries(examples));
      setStatus("Подключено к API");
    } catch {
      setStatus("API пока недоступен. Запусти backend и PostgreSQL.");
    }
  }

  useEffect(() => {
    void loadWords();
  }, []);

  function resetForm() {
    setEditingId(null);
    setGerman("");
    setArticle("der");
    setGrammaticalNumber("singular");
    setTranslation("");
    setLevel("A1");
    setLessonNumber("1");
    setPluralForm("");
    setNotes("");
  }

  function startEditing(word: Word) {
    setEditingId(word.id);
    setGerman(word.german);
    setArticle(word.article);
    setGrammaticalNumber(word.grammaticalNumber);
    setTranslation(word.translation);
    setLevel(word.level ?? "A1");
    setLessonNumber(word.lessonNumber == null ? "" : String(word.lessonNumber));
    setPluralForm(word.pluralForm ?? "");
    setNotes(word.notes ?? "");
    setStatus(`Редактирование: ${word.german}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        german: german.trim(),
        article,
        grammaticalNumber,
        translation: translation.trim(),
        level,
        lessonNumber: lessonNumber ? Number(lessonNumber) : null,
        pluralForm: pluralForm.trim() || null,
        notes: notes.trim() || null,
      };
      const response = await fetch(
        editingId ? `${API_URL}/words/${editingId}` : `${API_URL}/words`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw Error(body?.message ?? "Не удалось сохранить слово");
      }
      const wasEditing = Boolean(editingId);
      resetForm();
      await loadWords();
      setStatus(wasEditing ? "Изменения сохранены" : "Слово добавлено");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWord(word: Word) {
    if (!window.confirm(`Удалить слово «${word.german}»? Это действие нельзя отменить.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/words/${word.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw Error(body?.message ?? "Не удалось удалить слово");
      }
      if (editingId === word.id) resetForm();
      await loadWords();
      setStatus(`Удалено: ${word.german}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  }

  function updateExampleInput(
    wordId: string,
    field: "german" | "translation",
    value: string
  ) {
    setExampleInputs((current) => ({
      ...current,
      [wordId]: {
        german: current[wordId]?.german ?? "",
        translation: current[wordId]?.translation ?? "",
        [field]: value,
      },
    }));
  }

  function beginEditExample(wordId: string, example: WordExample) {
    setEditingExampleId(example.id);
    setEditingExampleWordId(wordId);
    setExampleInputs((current) => ({
      ...current,
      [wordId]: { german: example.german, translation: example.translation },
    }));
  }

  function cancelExampleEdit(wordId: string) {
    setEditingExampleId(null);
    setEditingExampleWordId(null);
    setExampleInputs((current) => ({
      ...current,
      [wordId]: { german: "", translation: "" },
    }));
  }

  async function saveExample(wordId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = exampleInputs[wordId] ?? { german: "", translation: "" };
    if (!input.german.trim() || !input.translation.trim()) {
      setStatus("Заполни немецкое предложение и перевод.");
      return;
    }

    setExampleBusyWordId(wordId);
    try {
      const isEditing = editingExampleWordId === wordId && Boolean(editingExampleId);
      const url = isEditing
        ? `${API_URL}/words/${wordId}/examples/${editingExampleId}`
        : `${API_URL}/words/${wordId}/examples`;
      const response = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          german: input.german.trim(),
          translation: input.translation.trim(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw Error(body?.message ?? "Не удалось сохранить пример");
      }

      const updatedExamples = await fetchExamples(wordId);
      setExamplesByWord((current) => ({ ...current, [wordId]: updatedExamples }));
      setExampleInputs((current) => ({
        ...current,
        [wordId]: { german: "", translation: "" },
      }));
      setEditingExampleId(null);
      setEditingExampleWordId(null);
      setStatus(isEditing ? "Пример обновлён" : "Пример добавлен");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка сохранения примера");
    } finally {
      setExampleBusyWordId(null);
    }
  }

  async function deleteExample(wordId: string, example: WordExample) {
    if (!window.confirm("Удалить этот пример?")) return;
    setExampleBusyWordId(wordId);
    try {
      const response = await fetch(
        `${API_URL}/words/${wordId}/examples/${example.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw Error(body?.message ?? "Не удалось удалить пример");
      }
      const updatedExamples = await fetchExamples(wordId);
      setExamplesByWord((current) => ({ ...current, [wordId]: updatedExamples }));
      if (editingExampleId === example.id) cancelExampleEdit(wordId);
      setStatus("Пример удалён");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка удаления примера");
    } finally {
      setExampleBusyWordId(null);
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
            <div>
              <p className="eyebrow">{editingId ? "ИЗМЕНЕНИЕ ЗАПИСИ" : "НОВАЯ ЗАПИСЬ"}</p>
              <h3>{editingId ? "Редактировать слово" : "Добавить слово"}</h3>
            </div>
            <span className="plus">{editingId ? "✎" : "+"}</span>
          </div>

          <form onSubmit={submitWord}>
            <label>Немецкое слово
              <input required value={german} onChange={(event) => setGerman(event.target.value)} placeholder="например, Apfel" />
            </label>
            <label>Артикль / категория
              <select value={`${article}:${grammaticalNumber}`} onChange={(event) => {
                const [nextArticle, nextNumber] = event.target.value.split(":") as [Article, GrammaticalNumber];
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
              <input required value={translation} onChange={(event) => setTranslation(event.target.value)} placeholder="яблоко" />
            </label>
            <label>Множественное число
              <input value={pluralForm} onChange={(event) => setPluralForm(event.target.value)} placeholder="Например: die Äpfel" />
            </label>
            <label>Заметки
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Контекст, произношение или подсказка" rows={3} />
            </label>
            <div className="form-row">
              <label>Уровень
                <select value={level} onChange={(event) => setLevel(event.target.value)}>
                  {["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>№ урока
                <input type="number" min="1" value={lessonNumber} onChange={(event) => setLessonNumber(event.target.value)} />
              </label>
            </div>
            <button disabled={busy} type="submit">
              {busy ? "Сохраняем…" : editingId ? "Сохранить изменения" : "Добавить в словарь"} <span>↗</span>
            </button>
            {editingId && <button className="secondary-button" disabled={busy} type="button" onClick={resetForm}>Отмена</button>}
          </form>
          <p className="hint">Добавляй формы множественного числа, заметки и примеры употребления.</p>
        </section>

        <section className="word-section">
          <div className="section-heading list-heading">
            <div><p className="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</p><h3>Последние слова</h3></div>
            <span className="count">{words.length} всего</span>
          </div>
          {words.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">Aa</div><h4>Пока здесь пусто</h4><p>Добавь первое слово — оно появится в твоём словаре.</p></div>
          ) : (
            <div className="word-list">
              {words.map((word) => {
                const examples = examplesByWord[word.id] ?? [];
                const exampleInput = exampleInputs[word.id] ?? { german: "", translation: "" };
                const editingThisExample = editingExampleWordId === word.id && Boolean(editingExampleId);
                return (
                  <article className={`word-card ${colorClass(word)}`} key={word.id}>
                    <div className="word-color" />
                    <div className="word-main">
                      <h4>{word.grammaticalNumber === "plural" ? "die " : word.article !== "none" ? `${word.article} ` : ""}{word.german}</h4>
                      <p>{word.translation}</p>
                      {word.pluralForm && <p className="word-extra"><strong>Мн. число:</strong> {word.pluralForm}</p>}
                      {word.notes && <p className="word-extra"><strong>Заметки:</strong> {word.notes}</p>}
                      <div className="word-meta">{word.level && <span>{word.level}</span>}{word.lessonNumber != null && <span>Урок {word.lessonNumber}</span>}</div>

                      <section className="examples-section">
                        <h4 className="examples-title">Примеры употребления <span>{examples.length}</span></h4>
                        {examples.length > 0 && (
                          <div className="examples-list">
                            {examples.map((example) => (
                              <div className="example-item" key={example.id}>
                                <div className="example-copy">
                                  <p>{example.german}</p>
                                  <p>{example.translation}</p>
                                </div>
                                <div className="example-actions">
                                  <button type="button" className="small-button secondary-button" disabled={exampleBusyWordId === word.id || busy} onClick={() => beginEditExample(word.id, example)}>Изменить</button>
                                  <button type="button" className="small-button delete-button" disabled={exampleBusyWordId === word.id || busy} onClick={() => void deleteExample(word.id, example)}>Удалить</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <form className="example-form" onSubmit={(event) => void saveExample(word.id, event)}>
                          <label>Предложение на немецком
                            <textarea rows={2} required value={exampleInput.german} onChange={(event) => updateExampleInput(word.id, "german", event.target.value)} placeholder="Например: Ich esse einen Apfel." />
                          </label>
                          <label>Перевод на русский
                            <textarea rows={2} required value={exampleInput.translation} onChange={(event) => updateExampleInput(word.id, "translation", event.target.value)} placeholder="Например: Я ем яблоко." />
                          </label>
                          <div className="example-form-actions">
                            <button type="submit" className="small-button" disabled={exampleBusyWordId === word.id || busy}>
                              {exampleBusyWordId === word.id ? "Сохраняем…" : editingThisExample ? "Сохранить пример" : "Добавить пример"}
                            </button>
                            {editingThisExample && <button type="button" className="small-button secondary-button" onClick={() => cancelExampleEdit(word.id)} disabled={exampleBusyWordId === word.id}>Отмена</button>}
                          </div>
                        </form>
                      </section>
                    </div>
                    <div className="word-actions">
                      <button type="button" className="small-button" disabled={busy} onClick={() => startEditing(word)}>Изменить</button>
                      <button type="button" className="small-button delete-button" disabled={busy} onClick={() => void deleteWord(word)}>Удалить</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
      <footer>Учись небольшими шагами. Повторяй регулярно.</footer>
    </main>
  );
}
