"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiClient, apiFetch, fetchDueWords, fetchNewWords } from "@/lib/api";
import type { AuthUser } from "@/lib/api-client";
import { canEditWord, displayTranslation, publicationLabel } from "@/lib/word-view";
import { LibraryPanel } from "./library-panel";
import { TranslationLanguagePicker } from "./translation-language-picker";
import { ModerationPanel } from "./moderation-panel";
import { WordTranslationsEditor } from "./word-translations-editor";
import type { SavedTranslation } from "@/lib/word-translations-client";

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
  selectedTranslation: { language: string; text: string | null };
  publicationStatus: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
  createdByUserId: string | null;
  level: string | null;
  lessonNumber: number | null;
  pluralForm?: string | null;
  notes?: string | null;
};

type WordProgressItem = {
  id: string;
  wordId: string;
  knownCount: number;
  needsReviewCount: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  updatedAt: string;
  word: Word;
  consecutiveKnown: number;
  currentIntervalDays: number;
};

type StudyProgress = {
  totalSessions: number;
  totalWordsInDictionary: number;
  wordsWithProgress: number;
  knownAnswers: number;
  needsReviewAnswers: number;
  words: WordProgressItem[];
  studiedToday: number;
  dueCount: number;
};

function colorClass(w: Word) {
  if (w.grammaticalNumber === "plural") return "article-orange";
  if (w.article === "der") return "article-blue";
  if (w.article === "das") return "article-green";
  if (w.article === "die") return "article-red";
  return "article-neutral";
}

async function fetchExamples(wordId: string): Promise<WordExample[]> {
  const response = await apiFetch(`/words/${wordId}/examples`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw Error(body?.message ?? "Не удалось загрузить примеры");
  }

  return response.json();
}

export function WordDashboard({ user }: { user: AuthUser }) {
  const [words, setWords] = useState<Word[]>([]);
  const [examplesByWord, setExamplesByWord] = useState<
    Record<string, WordExample[]>
  >({});
  const [exampleInputs, setExampleInputs] = useState<
    Record<string, { german: string; translation: string }>
  >({});
  const [editingExampleId, setEditingExampleId] = useState<string | null>(null);
  const [editingExampleWordId, setEditingExampleWordId] = useState<
    string | null
  >(null);
  const [exampleBusyWordId, setExampleBusyWordId] = useState<string | null>(
    null,
  );

  const [german, setGerman] = useState("");
  const [article, setArticle] = useState<Article>("der");
  const [grammaticalNumber, setGrammaticalNumber] =
    useState<GrammaticalNumber>("singular");
  const [translation, setTranslation] = useState("");
  const [level, setLevel] = useState("A1");
  const [lessonNumber, setLessonNumber] = useState("1");
  const [pluralForm, setPluralForm] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Загружаем словарь…");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [speakingExampleId, setSpeakingExampleId] = useState<string | null>(
    null,
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterLesson, setFilterLesson] = useState("all");
  const [filterArticle, setFilterArticle] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");

  const [studyMode, setStudyMode] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [knownWordIds, setKnownWordIds] = useState<string[]>([]);
  const [unknownWordIds, setUnknownWordIds] = useState<string[]>([]);
  const [studyFinished, setStudyFinished] = useState(false);
  const [studySaving, setStudySaving] = useState(false);
  const [studySaved, setStudySaved] = useState(false);
  const [languageChanging, setLanguageChanging] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [translationTarget, setTranslationTarget] = useState<{ id: string; german: string } | null>(null);
  const [translationVersion, setTranslationVersion] = useState(0);
  const [dictionaryLoading, setDictionaryLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"dictionary" | "progress" | "library" | "moderation">(
    "dictionary",
  );

  const [studyProgress, setStudyProgress] = useState<StudyProgress | null>(
    null,
  );
  const [progressStatusFilter, setProgressStatusFilter] = useState<
    "all" | "learning" | "review" | "known"
  >("all");

  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [studyWords, setStudyWords] = useState<Word[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [dueLoading, setDueLoading] = useState(false);
  const [dueError, setDueError] = useState("");

  const [newWordCount, setNewWordCount] = useState(0);
  const [newWordsLoading, setNewWordsLoading] = useState(false);
  const [newWordsError, setNewWordsError] = useState("");
  const [newWordsLimit, setNewWordsLimit] = useState(5);

  const speechVoices = useRef<SpeechSynthesisVoice[]>([]);
  const speakingExampleIdRef = useRef<string | null>(null);
  const studyRequestKey = useRef<string | null>(null);

  const refreshNewWordsCount = useCallback(async () => {
    try {
      const data = await fetchNewWords();
      setNewWordCount(data.count);
      setNewWordsError("");
    } catch (error) {
      setNewWordsError(error instanceof Error ? error.message : "Не удалось обновить новые слова");
    }
  }, []);

  const loadWords = useCallback(async () => {
    setDictionaryLoading(true);
    try {
      const response = await apiFetch("/words/mine", {
        cache: "no-store",
      });

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
        }),
      );

      setExamplesByWord(Object.fromEntries(examples));
      void refreshNewWordsCount();
      setStatus("Словарь обновлён");
    } catch {
      setStatus("Не удалось загрузить словарь. Повторите попытку позже.");
    } finally { setDictionaryLoading(false); }
  }, [refreshNewWordsCount]);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  // Инициализация Web Speech API и загрузка доступных голосов.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const synthesis = window.speechSynthesis;

    function updateVoices() {
      speechVoices.current = synthesis.getVoices();
      setSpeechSupported(true);
    }

    updateVoices();
    synthesis.addEventListener("voiceschanged", updateVoices);

    return () => {
      synthesis.removeEventListener("voiceschanged", updateVoices);
      synthesis.cancel();
      speakingExampleIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadDueWords();
  }, []);

  function stopSpeech() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    speakingExampleIdRef.current = null;
    setSpeakingExampleId(null);
  }

  function speakExample(example: WordExample) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setStatus("Этот браузер не поддерживает озвучивание.");
      return;
    }

    const synthesis = window.speechSynthesis;

    // Повторное нажатие на активное слово или предложение останавливает речь.
    if (speakingExampleIdRef.current === example.id) {
      stopSpeech();
      return;
    }

    synthesis.cancel();
    speakingExampleIdRef.current = null;
    setSpeakingExampleId(null);

    const utterance = new SpeechSynthesisUtterance(example.german);
    utterance.lang = "de-DE";
    utterance.rate = 0.9;

    const voices = speechVoices.current.length
      ? speechVoices.current
      : synthesis.getVoices();

    const germanVoice =
      voices.find((voice) => voice.lang.toLowerCase() === "de-de") ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith("de"));

    if (germanVoice) {
      utterance.voice = germanVoice;
    }

    utterance.onstart = () => {
      speakingExampleIdRef.current = example.id;
      setSpeakingExampleId(example.id);
    };

    utterance.onend = () => {
      if (speakingExampleIdRef.current === example.id) {
        speakingExampleIdRef.current = null;
        setSpeakingExampleId(null);
      }
    };

    utterance.onerror = (event) => {
      if (speakingExampleIdRef.current === example.id) {
        speakingExampleIdRef.current = null;
        setSpeakingExampleId(null);
      }

      if (event.error !== "canceled" && event.error !== "interrupted") {
        setStatus("Не удалось выполнить озвучивание.");
      }
    };

    synthesis.speak(utterance);
  }

  function speakWord(word: Word) {
    const spokenWord =
      word.grammaticalNumber === "plural"
        ? `die ${word.german}`
        : word.article !== "none"
          ? `${word.article} ${word.german}`
          : word.german;

    speakExample({
      id: `word-${word.id}`,
      wordId: word.id,
      german: spokenWord,
      translation: word.translation,
    });
  }

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

      const response = await apiFetch(
        editingId ? `/words/${editingId}` : `/words`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
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
    if (studyMode || studySaving || (studyFinished && !studySaved)) return;
    if (
      !window.confirm(
        `Убрать слово «${word.german}» из личного словаря?`,
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const response = await apiFetch(`/words/${word.id}/dictionary`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw Error(body?.message ?? "Не удалось удалить слово");
      }

      if (editingId === word.id) resetForm();
      setStudyWords([]);
      setStudyFinished(false);
      setStudySaved(false);
      setKnownWordIds([]);
      setUnknownWordIds([]);
      studyRequestKey.current = null;

      await loadWords();
      setStatus(`Убрано из словаря: ${word.german}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  }

  function updateExampleInput(
    wordId: string,
    field: "german" | "translation",
    value: string,
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
      [wordId]: {
        german: example.german,
        translation: example.translation,
      },
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

  async function saveExample(
    wordId: string,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const input = exampleInputs[wordId] ?? {
      german: "",
      translation: "",
    };

    if (!input.german.trim() || !input.translation.trim()) {
      setStatus("Заполни немецкое предложение и перевод.");
      return;
    }

    setExampleBusyWordId(wordId);

    try {
      const isEditing =
        editingExampleWordId === wordId && Boolean(editingExampleId);

      const url = isEditing
        ? `/words/${wordId}/examples/${editingExampleId}`
        : `/words/${wordId}/examples`;

      const response = await apiFetch(url, {
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

      setExamplesByWord((current) => ({
        ...current,
        [wordId]: updatedExamples,
      }));

      setExampleInputs((current) => ({
        ...current,
        [wordId]: { german: "", translation: "" },
      }));

      setEditingExampleId(null);
      setEditingExampleWordId(null);
      setStatus(isEditing ? "Пример обновлён" : "Пример добавлен");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Ошибка сохранения примера",
      );
    } finally {
      setExampleBusyWordId(null);
    }
  }

  async function deleteExample(wordId: string, example: WordExample) {
    if (!window.confirm("Удалить этот пример?")) return;

    setExampleBusyWordId(wordId);

    try {
      const response = await apiFetch(
        `/words/${wordId}/examples/${example.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw Error(body?.message ?? "Не удалось удалить пример");
      }

      const updatedExamples = await fetchExamples(wordId);

      setExamplesByWord((current) => ({
        ...current,
        [wordId]: updatedExamples,
      }));

      if (editingExampleId === example.id) {
        cancelExampleEdit(wordId);
      }

      if (speakingExampleIdRef.current === example.id) {
        stopSpeech();
      }

      setStatus("Пример удалён");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Ошибка удаления примера",
      );
    } finally {
      setExampleBusyWordId(null);
    }
  }

  async function saveStudySession(
    sessionWords: { wordId: string; answer: "KNOWN" | "NEEDS_REVIEW" }[],
  ) {
    const requestKey = studyRequestKey.current ?? crypto.randomUUID();
    studyRequestKey.current = requestKey;
    const response = await apiFetch(`/study/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestKey,
      },
      body: JSON.stringify({
        totalWords: sessionWords.length,
        words: sessionWords,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        Array.isArray(body?.message)
          ? body.message.join(", ")
          : (body?.message ?? "Не удалось сохранить результаты тренировки"),
      );
    }

    void refreshNewWordsCount();
    return response.json();
  }

  function startStudyWithWords(wordsToStudy: Word[]) {
    if (studySaving) return;
    if (wordsToStudy.length === 0) {
      setStatus("Нет слов для тренировки.");
      return;
    }

    stopSpeech();
    studyRequestKey.current = crypto.randomUUID();
    setStudyWords(wordsToStudy.slice(0, 500));
    setStudyIndex(0);
    setShowTranslation(false);
    setKnownWordIds([]);
    setUnknownWordIds([]);
    setStudyFinished(false);
    setStudySaving(false);
    setStudySaved(false);
    setStudyMode(true);
  }

  function startStudy() {
    startStudyWithWords(filteredWords);
  }

  async function startDueStudy() {
    setDueLoading(true);
    setDueError("");

    try {
      const words = await loadDueWords();

      if (words.length === 0) {
        if (!dueError) {
          setDueError("Пока нет слов для повторения. Попробуй позже.");
        }
        return;
      }

      startStudyWithWords(words);
    } finally {
      setDueLoading(false);
    }
  }

  async function startNewWordsStudy() {
    setNewWordsLoading(true);
    setNewWordsError("");

    try {
      const data = await fetchNewWords();
      setNewWordCount(data.count);

      if (data.words.length === 0) {
        setNewWordsError(
          "Новых слов пока нет. Добавь слова в словарь, чтобы начать изучение.",
        );
        return;
      }

      const wordsToStudy =
        newWordsLimit === 0 ? data.words : data.words.slice(0, newWordsLimit);
      startStudyWithWords(wordsToStudy);
    } catch (error) {
      setNewWordsError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить новые слова",
      );
    } finally {
      setNewWordsLoading(false);
    }
  }

  async function startNewStudy() {
    setDueLoading(true);
    setDueError("");

    try {
      const data = await fetchNewWords();

      if (data.words.length === 0) {
        setStatus("Новых слов нет — ты уже начал изучать весь словарь.");
        return;
      }

      startStudyWithWords(data.words);
      setStatus(`Начинаем тренировку: ${data.count} новых слов.`);
    } catch (error) {
      setDueError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить новые слова",
      );
    } finally {
      setDueLoading(false);
    }
  }

  function revealTranslation() {
    setShowTranslation(true);
  }

  async function answerStudyCard(knewWord: boolean) {
    const currentWord = studyWords[studyIndex];

    if (!currentWord || studySaving) return;

    const nextKnownWordIds = knewWord
      ? knownWordIds.includes(currentWord.id)
        ? knownWordIds
        : [...knownWordIds, currentWord.id]
      : knownWordIds.filter((id) => id !== currentWord.id);

    const nextUnknownWordIds = knewWord
      ? unknownWordIds.filter((id) => id !== currentWord.id)
      : unknownWordIds.includes(currentWord.id)
        ? unknownWordIds
        : [...unknownWordIds, currentWord.id];

    setKnownWordIds(nextKnownWordIds);
    setUnknownWordIds(nextUnknownWordIds);
    setShowTranslation(false);

    if (studyIndex + 1 < studyWords.length) {
      setStudyIndex((current) => current + 1);
      return;
    }

    const sessionWords = studyWords.map((word) => ({
      wordId: word.id,
      answer: nextKnownWordIds.includes(word.id)
        ? ("KNOWN" as const)
        : ("NEEDS_REVIEW" as const),
    }));

    setStudyMode(false);
    setStudyFinished(true);
    setStudySaving(true);
    setStudySaved(false);
    setStatus("Сохраняем результаты тренировки…");

    try {
      await saveStudySession(sessionWords);

      await Promise.all([loadDueWords(), loadStudyProgress()]);

      setStudySaved(true);
      setStatus("Тренировка завершена. Результаты сохранены.");

      // Обновляем количество слов, которым требуется повторение.
      void loadDueWords();

      // Обновляем статистику, если открыт раздел прогресса.
      if (activeTab === "progress") {
        void loadStudyProgress();
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Тренировка завершена, но сохранить результаты не удалось: ${error.message}`
          : "Тренировка завершена, но сохранить результаты не удалось.",
      );
    } finally {
      setStudySaving(false);
    }
  }

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  const filteredWords = words
    .filter((word) => {
      const examples = examplesByWord[word.id] ?? [];

      const searchableText = [
        word.german,
        word.selectedTranslation?.text ?? "",
        word.pluralForm ?? "",
        word.notes ?? "",
        ...examples.flatMap((example) => [example.german, example.translation]),
      ]
        .join(" ")
        .toLocaleLowerCase();

      const matchesQuery =
        !normalizedQuery || searchableText.includes(normalizedQuery);

      const matchesLevel = filterLevel === "all" || word.level === filterLevel;

      const matchesLesson =
        filterLesson === "all" ||
        String(word.lessonNumber ?? "") === filterLesson;

      const matchesArticle =
        filterArticle === "all" ||
        (filterArticle === "plural"
          ? word.grammaticalNumber === "plural"
          : filterArticle === "none"
            ? word.article === "none"
            : word.article === filterArticle &&
              word.grammaticalNumber !== "plural");

      return matchesQuery && matchesLevel && matchesLesson && matchesArticle;
    })
    .sort((a, b) => {
      if (sortOrder === "az") {
        return a.german.localeCompare(b.german, "de");
      }

      if (sortOrder === "za") {
        return b.german.localeCompare(a.german, "de");
      }

      if (sortOrder === "level") {
        const levelCompare = (a.level ?? "").localeCompare(b.level ?? "");

        if (levelCompare !== 0) return levelCompare;

        return (a.lessonNumber ?? 0) - (b.lessonNumber ?? 0);
      }

      // recent: сохраняем порядок, полученный от API.
      return 0;
    });

  async function loadStudyProgress() {
    setProgressLoading(true);
    setProgressError("");

    try {
      const response = await apiFetch(`/study/progress`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.message ?? "Не удалось загрузить статистику обучения",
        );
      }

      const data: StudyProgress = await response.json();
      setStudyProgress(data);
    } catch (error) {
      setProgressError(
        error instanceof Error ? error.message : "Ошибка загрузки статистики",
      );
    } finally {
      setProgressLoading(false);
    }
  }

  async function loadDueWords(): Promise<Word[]> {
    try {
      setDueError("");

      const data = await fetchDueWords();

      setDueCount(data.dueCount);

      return data.words;
    } catch (error) {
      console.error("Ошибка загрузки слов для повторения:", error);

      setDueError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить слова для повторения",
      );

      return [];
    }
  }

  function getWordStatus(item: WordProgressItem) {
    if (item.nextReviewAt && new Date(item.nextReviewAt) <= new Date()) {
      return "Пора повторить";
    }

    if (item.consecutiveKnown >= 3) {
      return "Закреплено";
    }

    return "Закрепляется";
  }

  const filteredProgressWords = (studyProgress?.words ?? []).filter((item) => {
    const status = getWordStatus(item);

    if (progressStatusFilter === "review") {
      return status === "Пора повторить";
    }

    if (progressStatusFilter === "known") {
      return status === "Закреплено";
    }

    if (progressStatusFilter === "learning") {
      return status === "Закрепляется";
    }

    return true;
  });

  const languageLocked = studyMode || studySaving || (studyFinished && !studySaved) ||
    busy || libraryBusy || moderationBusy || translationTarget !== null || dictionaryLoading || dueLoading || newWordsLoading || progressLoading || exampleBusyWordId !== null;

  async function syncAfterCardChange() {
    setStudyWords([]); setStudyFinished(false); setStudySaved(false);
    setKnownWordIds([]); setUnknownWordIds([]); studyRequestKey.current = null;
    await Promise.all([loadWords(), loadStudyProgress(), loadDueWords()]);
  }

  function openTranslations(word: { id: string; german: string }) {
    if (studyMode || studySaving || (studyFinished && !studySaved) || busy || moderationBusy || exampleBusyWordId !== null) return;
    stopSpeech();
    setTranslationTarget({ id: word.id, german: word.german });
  }

  async function syncAfterTranslation(saved: SavedTranslation) {
    if (saved.language === "ru" && editingId === saved.wordId) setTranslation(saved.text);
    setTranslationVersion((value) => value + 1);
    await syncAfterCardChange();
  }

  async function changeTranslationLanguage(language: string) {
    if (languageLocked || languageChanging || language === user.translationLanguage) return;
    setLanguageChanging(true);
    try {
      await apiClient.updateTranslationLanguage(language);
      stopSpeech();
      setWords([]);
      setStudyProgress(null);
      setStudyWords([]);
      setStudyFinished(false);
      setStudySaved(false);
      setKnownWordIds([]);
      setUnknownWordIds([]);
      studyRequestKey.current = null;
      await Promise.all([loadWords(), loadStudyProgress(), loadDueWords()]);
    } finally { setLanguageChanging(false); }
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

      <TranslationLanguagePicker language={user.translationLanguage} disabled={languageLocked}
        pending={languageChanging} onChange={changeTranslationLanguage} />

      <div inert={languageChanging} aria-busy={languageChanging}>

      <section className="intro">
        <div>
          <p className="eyebrow">ТВОЙ СЛОВАРЬ</p>
          <h2>
            Слова, которые
            <br />
            <span>запоминаются.</span>
          </h2>
          <p className="intro-copy">
            Собирай лексику по урокам и повторяй её с умом.
          </p>
        </div>
        <div className="summary-card">
          <span className="summary-label">В словаре</span>
          <strong>{words.length}</strong>
          <span className="summary-caption">карточек</span>
        </div>
      </section>
      <nav className="dashboard-tabs" aria-label="Разделы приложения">
        <button
          type="button"
          className={
            activeTab === "dictionary"
              ? "dashboard-tab active"
              : "dashboard-tab"
          }
          onClick={() => setActiveTab("dictionary")}
          disabled={libraryBusy || moderationBusy}
        >
          Словарь
        </button>

        <button
          type="button"
          className={
            activeTab === "progress" ? "dashboard-tab active" : "dashboard-tab"
          }
          onClick={() => {
            setActiveTab("progress");
            void loadStudyProgress();
          }}
          disabled={libraryBusy || moderationBusy}
        >
          Прогресс
        </button>
        <button type="button" className={activeTab === "library" ? "dashboard-tab active" : "dashboard-tab"}
          disabled={libraryBusy || moderationBusy} onClick={() => setActiveTab("library")}>
          Библиотека
        </button>
        {user.role === "ADMIN" && <button type="button"
          className={activeTab === "moderation" ? "dashboard-tab active" : "dashboard-tab"}
          disabled={libraryBusy || moderationBusy} onClick={() => setActiveTab("moderation")}>Модерация</button>}
      </nav>

      {activeTab === "library" && <LibraryPanel language={user.translationLanguage}
        onDictionaryChange={loadWords} onBusyChange={setLibraryBusy} />}

      {activeTab === "moderation" && user.role === "ADMIN" && <ModerationPanel
        decisionsLocked={studyMode || studySaving || (studyFinished && !studySaved)}
        onDecision={syncAfterCardChange} onBusyChange={setModerationBusy}
        translationVersion={translationVersion} onEditTranslations={openTranslations} />}

      {
        activeTab === "progress" ? (
          <section className="progress-panel">
            {/* <div className="section-heading">
              <div>
                <p className="eyebrow">DEIN FORTSCHRITT</p>
                <h3>Прогресс обучения</h3>
              </div>

              <button
                type="button"
                className="small-button secondary-button"
                onClick={() => void loadStudyProgress()}
                disabled={progressLoading}
              >
                {progressLoading ? "Обновляем…" : "Обновить"}
              </button>
            </div> */}

            <div className="section-heading">
              <div>
                <p className="eyebrow">WORD BY WORD</p>
                <h3>Статистика по словам</h3>
              </div>
            </div>

            <div className="progress-status-filters">
              <button
                type="button"
                className={progressStatusFilter === "all" ? "active" : ""}
                onClick={() => setProgressStatusFilter("all")}
              >
                Все ({studyProgress?.words.length ?? 0})
              </button>

              <button
                type="button"
                className={progressStatusFilter === "learning" ? "active" : ""}
                onClick={() => setProgressStatusFilter("learning")}
              >
                Закрепляется (
                {
                  (studyProgress?.words ?? []).filter(
                    (item) => getWordStatus(item) === "Закрепляется",
                  ).length
                }
                )
              </button>

              <button
                type="button"
                className={progressStatusFilter === "review" ? "active" : ""}
                onClick={() => setProgressStatusFilter("review")}
              >
                Пора повторить (
                {
                  (studyProgress?.words ?? []).filter(
                    (item) => getWordStatus(item) === "Пора повторить",
                  ).length
                }
                )
              </button>

              <button
                type="button"
                className={progressStatusFilter === "known" ? "active" : ""}
                onClick={() => setProgressStatusFilter("known")}
              >
                Закреплено (
                {
                  (studyProgress?.words ?? []).filter(
                    (item) => getWordStatus(item) === "Закреплено",
                  ).length
                }
                )
              </button>
            </div>

            {progressLoading && !studyProgress ? (
              <p>Загружаем статистику…</p>
            ) : progressError && !studyProgress ? (
              <div className="empty-state">
                <h4>Не удалось загрузить статистику</h4>
                <p>{progressError}</p>
                <button
                  type="button"
                  className="small-button"
                  onClick={() => void loadStudyProgress()}
                >
                  Попробовать снова
                </button>
              </div>
            ) : studyProgress ? (
              <>
                {progressError && <p role="alert">{progressError}</p>}

                <div className="study-results-grid progress-summary">
                  <div>
                    <strong>{studyProgress.totalSessions}</strong>
                    <span>Тренировок</span>
                  </div>

                  <div>
                    <strong>{studyProgress.knownAnswers}</strong>
                    <span>Ответов «Знаю»</span>
                  </div>

                  <div>
                    {/* <strong>{studyProgress.needsReviewAnswers}</strong> */}
                    {/* <span>Нужно повторить</span> */}
                    <strong>{studyProgress.dueCount}</strong>
                    <span>Пора повторить</span>
                  </div>

                  <div>
                    <strong>{studyProgress.wordsWithProgress}</strong>
                    <span>Слов изучалось</span>
                  </div>
                  <div>
                    <strong>{studyProgress.studiedToday}</strong>
                    <span>Изучено сегодня</span>
                  </div>

                  {/* <div>
                    <strong>{studyProgress.dueCount}</strong>
                    <span>Пора повторить</span>
                  </div> */}
                  <div>
                    <strong>
                      {
                        studyProgress.words.filter(
                          (item) => item.knownCount > 0,
                        ).length
                      }
                    </strong>
                    <span>Слов с ответом «Знаю»</span>
                  </div>
                </div>

                <div className="progress-overview">
                  <div className="progress-overview-heading">
                    <h4>Общий результат</h4>
                    <strong>
                      {studyProgress.knownAnswers +
                        studyProgress.needsReviewAnswers >
                      0
                        ? Math.round(
                            (studyProgress.knownAnswers /
                              (studyProgress.knownAnswers +
                                studyProgress.needsReviewAnswers)) *
                              100,
                          )
                        : 0}
                      %
                    </strong>
                  </div>

                  <div
                    className="study-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={
                      studyProgress.knownAnswers +
                        studyProgress.needsReviewAnswers >
                      0
                        ? Math.round(
                            (studyProgress.knownAnswers /
                              (studyProgress.knownAnswers +
                                studyProgress.needsReviewAnswers)) *
                              100,
                          )
                        : 0
                    }
                  >
                    <div
                      className="study-progress-fill"
                      style={{
                        width: `${
                          studyProgress.knownAnswers +
                            studyProgress.needsReviewAnswers >
                          0
                            ? (studyProgress.knownAnswers /
                                (studyProgress.knownAnswers +
                                  studyProgress.needsReviewAnswers)) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <p className="hint">
                    Всего слов в словаре: {studyProgress.totalWordsInDictionary}
                    . Показатель отражает самооценку ответов, а не
                    автоматическую проверку знаний.
                  </p>
                </div>

                <div className="progress-words">
                  {/* <div className="section-heading">
                    <div>
                      <p className="eyebrow">WORD BY WORD</p>
                      <h3>Статистика по словам</h3>
                    </div>
                  </div> */}

                  {
                    /* {studyProgress.words.length === 0 ? (
                    <div className="empty-state">
                      <h4>Пока нет истории повторений</h4>
                      <p>
                        Пройди тренировку, и здесь появятся результаты по
                        словам.
                      </p>
                    </div> */
                    filteredProgressWords.length === 0 ? (
                      <div className="empty-state">
                        <h4>
                          {studyProgress.words.length === 0
                            ? "Пока нет истории повторений"
                            : "В этой категории пока нет слов"}
                        </h4>
                        <p>
                          {studyProgress.words.length === 0
                            ? "Пройди тренировку, и здесь появятся результаты по словам."
                            : "Выбери другую категорию или продолжи обучение."}
                        </p>
                      </div>
                    ) : (
                      <div className="word-list">
                        {[...filteredProgressWords]
                          .sort((a, b) => {
                            const aTotal = a.knownCount + a.needsReviewCount;
                            const bTotal = b.knownCount + b.needsReviewCount;

                            const aDifficulty =
                              aTotal > 0 ? a.needsReviewCount / aTotal : 0;
                            const bDifficulty =
                              bTotal > 0 ? b.needsReviewCount / bTotal : 0;

                            return (
                              bDifficulty - aDifficulty ||
                              b.needsReviewCount - a.needsReviewCount
                            );
                          })
                          .map((item) => (
                            <article
                              className={`word-card ${colorClass(item.word)}`}
                              key={item.id}
                            >
                              <div className="word-color" />

                              <div className="word-main">
                                <h4>
                                  {item.word.grammaticalNumber === "plural"
                                    ? "die "
                                    : item.word.article !== "none"
                                      ? `${item.word.article} `
                                      : ""}
                                  {item.word.german}
                                </h4>
                                <span
                                  className={`word-status ${
                                    getWordStatus(item) === "Пора повторить"
                                      ? "word-status--review"
                                      : getWordStatus(item) === "Закреплено"
                                        ? "word-status--known"
                                        : "word-status--learning"
                                  }`}
                                >
                                  {getWordStatus(item)}
                                </span>

                                <p>{displayTranslation(item.word)}</p>

                                <div className="word-meta">
                                  <span>Знаю: {item.knownCount}</span>
                                  <span>
                                    Повторить: {item.needsReviewCount}
                                  </span>
                                </div>
                                <p className="word-extra">
                                  <strong>Последнее повторение:</strong>{" "}
                                  {item.lastReviewedAt
                                    ? new Date(
                                        item.lastReviewedAt,
                                      ).toLocaleString("ru-RU")
                                    : "Нет данных"}
                                </p>

                                <p className="word-extra">
                                  <strong>Следующее повторение:</strong>{" "}
                                  {item.nextReviewAt
                                    ? new Date(
                                        item.nextReviewAt,
                                      ).toLocaleString("ru-RU")
                                    : "Не запланировано"}
                                </p>

                                <p className="word-extra">
                                  <strong>Текущий интервал:</strong>{" "}
                                  {item.currentIntervalDays > 0
                                    ? `${item.currentIntervalDays} дн.`
                                    : "Ещё не установлен"}
                                </p>

                                <p className="word-extra">
                                  <strong>Успешных ответов подряд:</strong>{" "}
                                  {item.consecutiveKnown}
                                </p>
                                {/* <p className="word-extra">
                                <strong>Последнее повторение:</strong>{" "}
                                {item.lastReviewedAt
                                  ? new Date(
                                      item.lastReviewedAt,
                                    ).toLocaleString("ru-RU")
                                  : "Нет данных"}
                              </p>

                              <p className="word-extra">
                                <strong>Следующее повторение:</strong>{" "}
                                <p className="word-extra">
                                  <strong>Текущий интервал:</strong>{" "}
                                  {item.currentIntervalDays > 0
                                    ? `${item.currentIntervalDays} дн.`
                                    : "Ещё не установлен"}
                                </p>
                                <p className="word-extra">
                                  <strong>Успешных ответов подряд:</strong>{" "}
                                  {item.consecutiveKnown}
                                </p>
                                {item.nextReviewAt
                                  ? new Date(item.nextReviewAt).toLocaleString(
                                      "ru-RU",
                                    )
                                  : "Не запланировано"}
                              </p> */}
                              </div>
                            </article>
                          ))}
                      </div>
                    )
                  }
                </div>

                <div>
                  <strong>{studyProgress.dueCount}</strong>
                  <span>Пора повторить</span>
                </div>
              </>
            ) : null}
          </section>
        ) : null
        // <section className="content-grid">
        //   {/* Сюда перенеси существующее содержимое content-grid без изменений */}
        // </section>
      }

      {activeTab === "dictionary" && (
        <section className="content-grid">
          <section className="panel form-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {editingId ? "ИЗМЕНЕНИЕ ЗАПИСИ" : "НОВАЯ ЗАПИСЬ"}
                </p>
                <h3>{editingId ? "Редактировать слово" : "Добавить слово"}</h3>
              </div>
              <span className="plus">{editingId ? "✎" : "+"}</span>
            </div>

            <form onSubmit={submitWord}>
              <label>
                Немецкое слово
                <input
                  required
                  value={german}
                  onChange={(event) => setGerman(event.target.value)}
                  placeholder="например, Apfel"
                />
              </label>

              <label>
                Артикль / категория
                <select
                  value={`${article}:${grammaticalNumber}`}
                  onChange={(event) => {
                    const [nextArticle, nextNumber] = event.target.value.split(
                      ":",
                    ) as [Article, GrammaticalNumber];

                    setArticle(nextArticle);
                    setGrammaticalNumber(nextNumber);
                  }}
                >
                  <option value="der:singular">
                    der — мужской род (синий)
                  </option>
                  <option value="das:singular">
                    das — средний род (зелёный)
                  </option>
                  <option value="die:singular">
                    die — женский род, ед. ч. (красный/розовый)
                  </option>
                  <option value="die:plural">
                    die — множественное число (жёлтый/оранжевый)
                  </option>
                  <option value="none:not_applicable">
                    Без артикля / не указан
                  </option>
                </select>
              </label>

              <label>
                Перевод на русский
                <input
                  required
                  value={translation}
                  onChange={(event) => setTranslation(event.target.value)}
                  placeholder="яблоко"
                />
              </label>

              <label>
                Множественное число
                <input
                  value={pluralForm}
                  onChange={(event) => setPluralForm(event.target.value)}
                  placeholder="Например: die Äpfel"
                />
              </label>

              <label>
                Заметки
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Контекст, произношение или подсказка"
                  rows={3}
                />
              </label>

              <div className="form-row">
                <label>
                  Уровень
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                  >
                    {["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  № урока
                  <input
                    type="number"
                    min="1"
                    value={lessonNumber}
                    onChange={(event) => setLessonNumber(event.target.value)}
                  />
                </label>
              </div>

              <button disabled={busy} type="submit">
                {busy
                  ? "Сохраняем…"
                  : editingId
                    ? "Сохранить изменения"
                    : "Добавить в словарь"}{" "}
                <span>↗</span>
              </button>

              {editingId && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  type="button"
                  onClick={resetForm}
                >
                  Отмена
                </button>
              )}
            </form>

            <p className="hint">
              Добавляй формы множественного числа, заметки и примеры
              употребления.
            </p>
          </section>

          <section className="word-section">
            <div className="section-heading list-heading">
              <div>
                <p className="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</p>
                <h3>Последние слова</h3>
                <button
                  type="button"
                  className="study-start-button"
                  onClick={startStudy}
                  disabled={filteredWords.length === 0}
                >
                  Начать тренировку ({filteredWords.length} слов)
                </button>
                <button
                  type="button"
                  onClick={() => void startNewStudy()}
                  disabled={dueLoading}
                >
                  {dueLoading ? "Загрузка..." : "Новые слова"}
                </button>
                <button
                  type="button"
                  onClick={startDueStudy}
                  disabled={dueLoading || dueCount === 0}
                >
                  {dueLoading ? "Загрузка..." : `Пора повторить (${dueCount})`}
                </button>

                <div className="new-words-controls">
                  <label htmlFor="new-words-limit">
                    Сколько новых слов изучить?
                  </label>

                  <select
                    id="new-words-limit"
                    value={newWordsLimit === 0 ? "all" : String(newWordsLimit)}
                    onChange={(event) =>
                      setNewWordsLimit(
                        event.target.value === "all"
                          ? 0
                          : Number(event.target.value),
                      )
                    }
                    disabled={newWordsLoading || studyMode}
                  >
                    <option value="5">5 слов</option>
                    <option value="10">10 слов</option>
                    <option value="20">20 слов</option>
                    <option value="all">Все новые слова</option>
                  </select>

                  <button
                    type="button"
                    className="study-start-button"
                    onClick={startNewWordsStudy}
                    disabled={newWordsLoading || studyMode}
                  >
                    {newWordsLoading
                      ? "Загрузка..."
                      : `Изучить новые слова (${newWordCount})`}
                  </button>

                  {newWordsError && <p role="alert">{newWordsError}</p>}
                </div>

                {dueError && <p role="alert">{dueError}</p>}
                <div className="word-filters">
                  <label>
                    Поиск
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Слово, перевод, заметка или пример…"
                    />
                  </label>

                  <div className="form-row">
                    <label>
                      Уровень
                      <select
                        value={filterLevel}
                        onChange={(event) => setFilterLevel(event.target.value)}
                      >
                        <option value="all">Все уровни</option>
                        {["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Урок
                      <select
                        value={filterLesson}
                        onChange={(event) =>
                          setFilterLesson(event.target.value)
                        }
                      >
                        <option value="all">Все уроки</option>
                        {[
                          ...new Set(
                            words
                              .map((word) => word.lessonNumber)
                              .filter(
                                (value): value is number => value != null,
                              ),
                          ),
                        ]
                          .sort((a, b) => a - b)
                          .map((lesson) => (
                            <option key={lesson} value={String(lesson)}>
                              Урок {lesson}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Артикль
                      <select
                        value={filterArticle}
                        onChange={(event) =>
                          setFilterArticle(event.target.value)
                        }
                      >
                        <option value="all">Все категории</option>
                        <option value="der">der — мужской</option>
                        <option value="das">das — средний</option>
                        <option value="die">die — женский</option>
                        <option value="plural">Множественное число</option>
                        <option value="none">Без артикля</option>
                      </select>
                    </label>

                    <label>
                      Сортировка
                      <select
                        value={sortOrder}
                        onChange={(event) => setSortOrder(event.target.value)}
                      >
                        <option value="recent">Сначала новые</option>
                        <option value="az">По алфавиту: А–Я</option>
                        <option value="za">По алфавиту: Я–А</option>
                        <option value="level">По уровню и уроку</option>
                      </select>
                    </label>
                  </div>

                  <p className="hint">
                    Показано {filteredWords.length} из {words.length} слов
                  </p>

                  {(searchQuery ||
                    filterLevel !== "all" ||
                    filterLesson !== "all" ||
                    filterArticle !== "all" ||
                    sortOrder !== "recent") && (
                    <button
                      type="button"
                      className="small-button secondary-button"
                      onClick={() => {
                        setSearchQuery("");
                        setFilterLevel("all");
                        setFilterLesson("all");
                        setFilterArticle("all");
                        setSortOrder("recent");
                      }}
                    >
                      Сбросить поиск и фильтры
                    </button>
                  )}
                </div>
              </div>
              <span className="count">{words.length} всего</span>
            </div>

            {/* {words.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">Aa</div>
              <h4>Пока здесь пусто</h4>
              <p>Добавь первое слово — оно появится в твоём словаре.</p>
            </div>
          ) : ( */}
            {studyMode && studyWords[studyIndex] && (
              <section className="study-panel">
                <div className="study-header">
                  <span>
                    Карточка {studyIndex + 1} из {studyWords.length}
                  </span>

                  <button
                    type="button"
                    className="small-button secondary-button"
                    onClick={() => setStudyMode(false)}
                  >
                    Завершить
                  </button>
                </div>

                <div className="study-progress">
                  <div
                    className="study-progress-fill"
                    style={{
                      width: `${((studyIndex + 1) / studyWords.length) * 100}%`,
                    }}
                  />
                </div>

                <div
                  className={`study-card ${colorClass(studyWords[studyIndex])}`}
                >
                  <p className="eyebrow">
                    {studyWords[studyIndex].level ?? "Немецкий"}
                  </p>

                  <h3>
                    {studyWords[studyIndex].grammaticalNumber === "plural"
                      ? "die "
                      : studyWords[studyIndex].article !== "none"
                        ? `${studyWords[studyIndex].article} `
                        : ""}
                    {studyWords[studyIndex].german}
                  </h3>

                  {studyWords[studyIndex].pluralForm && (
                    <p>
                      Множественное число: {studyWords[studyIndex].pluralForm}
                    </p>
                  )}

                  <button
                    type="button"
                    className="speak-button"
                    disabled={!speechSupported}
                    onClick={() => speakWord(studyWords[studyIndex])}
                  >
                    🔊 Прослушать
                  </button>

                  {showTranslation ? (
                    <div className="study-answer">
                      <h4>{displayTranslation(studyWords[studyIndex])}</h4>

                      {studyWords[studyIndex].notes && (
                        <p>{studyWords[studyIndex].notes}</p>
                      )}

                      {(examplesByWord[studyWords[studyIndex].id] ?? [])
                        .slice(0, 2)
                        .map((example) => (
                          <div key={example.id} className="study-example">
                            <p>{example.german}</p>
                            <p>{example.translation}</p>
                            <button
                              type="button"
                              className="small-button secondary-button"
                              disabled={!speechSupported}
                              onClick={() => speakExample(example)}
                            >
                              🔊 Слушать пример
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="study-card-actions">
                      <button
                        type="button"
                        className="study-reveal-button"
                        onClick={revealTranslation}
                      >
                        Показать перевод
                      </button>

                      <button
                        type="button"
                        className="study-unknown-button"
                        onClick={() => answerStudyCard(false)}
                        disabled={studySaving}
                      >
                        Не знаю
                      </button>

                      <button
                        type="button"
                        className="study-known-button"
                        onClick={() => answerStudyCard(true)}
                        disabled={studySaving}
                      >
                        Знаю слово
                      </button>
                    </div>
                  )}

                  {showTranslation && (
                    <div className="study-actions">
                      <button
                        type="button"
                        className="study-unknown-button"
                        onClick={() => answerStudyCard(false)}
                        disabled={studySaving}
                      >
                        Не знаю — повторить позже
                      </button>

                      <button
                        type="button"
                        className="study-known-button"
                        onClick={() => answerStudyCard(true)}
                        disabled={studySaving}
                      >
                        Знаю слово
                      </button>
                    </div>
                  )}
                </div>

                <p className="study-session-stats">
                  Знаю: {knownWordIds.length} · Повторить:{" "}
                  {unknownWordIds.length}
                </p>
              </section>
            )}

            {studyFinished && (
              <section className="study-results">
                <p className="eyebrow">ТРЕНИРОВКА ЗАВЕРШЕНА</p>
                <h3>Отличная работа!</h3>
                {studySaving && (
                  <p role="status">Сохраняем результаты…</p>
                )}

                {studySaved && (
                  <p role="status">✓ Результаты сохранены</p>
                )}

                {!studySaving && !studySaved && (
                  <button
                    type="button"
                    className="study-known-button"
                    onClick={async () => {
                      setStudySaving(true);
                      setStatus("Повторяем сохранение результатов…");
                      const sessionWords = studyWords
                        .filter(
                          (word) =>
                            knownWordIds.includes(word.id) ||
                            unknownWordIds.includes(word.id),
                        )
                        .map((word) => ({
                          wordId: word.id,
                          answer: knownWordIds.includes(word.id)
                            ? ("KNOWN" as const)
                            : ("NEEDS_REVIEW" as const),
                        }));

                      try {
                        await saveStudySession(sessionWords);
                        setStudySaved(true);
                        setStatus("Результаты тренировки сохранены.");
                      } catch (error) {
                        setStatus(
                          error instanceof Error
                            ? `Не удалось сохранить: ${error.message}`
                            : "Не удалось сохранить результаты.",
                        );
                      } finally {
                        setStudySaving(false);
                      }
                    }}
                    disabled={studySaving}
                  >
                    Повторить сохранение
                  </button>
                )}

                <div className="study-results-grid">
                  <div>
                    <strong>{knownWordIds.length}</strong>
                    <span>Знаю</span>
                  </div>

                  <div>
                    <strong>{unknownWordIds.length}</strong>
                    <span>Повторить</span>
                  </div>

                  <div>
                    <strong>
                      {knownWordIds.length + unknownWordIds.length > 0
                        ? Math.round(
                            (knownWordIds.length /
                              (knownWordIds.length + unknownWordIds.length)) *
                              100,
                          )
                        : 0}
                      %
                    </strong>
                    <span>Знаю без подсказки</span>
                  </div>
                </div>

                <div className="study-results-actions">
                  <button
                    type="button"
                    className="study-unknown-button"
                    disabled={unknownWordIds.length === 0 || studySaving}
                    onClick={() => {
                      const wordsToRepeat = studyWords.filter((word) =>
                        unknownWordIds.includes(word.id),
                      );

                      if (wordsToRepeat.length === 0) return;

                      startStudyWithWords(wordsToRepeat);
                    }}
                  >
                    Повторить сложные
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const missedWords = studyWords.filter((word) =>
                        unknownWordIds.includes(word.id),
                      );

                      if (missedWords.length > 0) {
                        startStudyWithWords(missedWords);
                      }
                    }}
                    disabled={unknownWordIds.length === 0}
                  >
                    Повторить ошибки ({unknownWordIds.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStudyMode(false);
                      setStudyFinished(false);
                      setShowTranslation(false);
                    }}
                  >
                    Вернуться к словарю
                  </button>

                  {/* <button
                  type="button"
                  className="study-unknown-button"
                  disabled={unknownWordIds.length === 0}
                  onClick={() => {
                    const wordsToRepeat = filteredWords.filter((word) =>
                      unknownWordIds.includes(word.id),
                    );

                    if (wordsToRepeat.length === 0) return;

                    setStudyIndex(0);
                    setShowTranslation(false);
                    setKnownWordIds([]);
                    setUnknownWordIds([]);
                    setStudyFinished(false);

                    // В следующем шаге можно вынести слова для повторения
                    // в отдельное состояние studyWords.
                    setStatus(
                      "Для повторения выбери фильтр или запусти все слова.",
                    );
                  }}
                >
                  Повторить сложные
                </button> */}
                </div>

                <div className="daily-goal">
                  <h3>Цель на сегодня</h3>
                  <p>
                    Изучено слов в этой тренировке:{" "}
                    <strong>{studyWords.length}</strong> из 10
                  </p>

                  <div
                    className="daily-goal-track"
                    role="progressbar"
                    aria-label="Прогресс тренировки"
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-valuenow={Math.min(studyWords.length, 10)}
                  >
                    <div
                      className="daily-goal-fill"
                      style={{
                        width: `${Math.min(studyWords.length / 10, 1) * 100}%`,
                      }}
                    />
                  </div>

                  <p>
                    {studyWords.length >= 10
                      ? "Цель достигнута!"
                      : `До цели осталось ${10 - studyWords.length} слов`}
                  </p>
                </div>
              </section>
            )}

            {filteredWords.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">Aa</div>
                <h4>Ничего не найдено</h4>
                <p>Измени запрос или сбрось фильтры.</p>
              </div>
            ) : (
              <div className="word-list">
                {filteredWords.map((word) => {
                  const examples = examplesByWord[word.id] ?? [];
                  const exampleInput = exampleInputs[word.id] ?? {
                    german: "",
                    translation: "",
                  };

                  const editingThisExample =
                    editingExampleWordId === word.id &&
                    Boolean(editingExampleId);
                  const editable = canEditWord(word, user);

                  return (
                    <article
                      className={`word-card ${colorClass(word)}`}
                      key={word.id}
                    >
                      <div className="word-color" />

                      <div className="word-main">
                        {/* <h4>
                        {word.grammaticalNumber === "plural"
                          ? "die "
                          : word.article !== "none"
                            ? `${word.article} `
                            : ""}
                        {word.german}
                      </h4> */}
                        <div className="word-title-row">
                          <h4>
                            {word.grammaticalNumber === "plural"
                              ? "die "
                              : word.article !== "none"
                                ? `${word.article} `
                                : ""}
                            {word.german}
                          </h4>

                          <button
                            type="button"
                            className={`speak-button ${
                              speakingExampleId === `word-${word.id}`
                                ? "is-speaking"
                                : ""
                            }`}
                            onClick={() => speakWord(word)}
                            disabled={!speechSupported}
                            aria-label={`Прослушать слово ${word.german}`}
                            title="Прослушать слово с артиклем"
                          >
                            {speakingExampleId === `word-${word.id}`
                              ? "■ Стоп"
                              : "🔊"}
                          </button>
                        </div>
                        <p>{displayTranslation(word)}</p>

                        {word.pluralForm && (
                          <p className="word-extra">
                            <strong>Мн. число:</strong> {word.pluralForm}
                          </p>
                        )}

                        {word.notes && (
                          <p className="word-extra">
                            <strong>Заметки:</strong> {word.notes}
                          </p>
                        )}

                        <div className="word-meta">
                          <span>{publicationLabel(word.publicationStatus)}</span>
                          {word.level && <span>{word.level}</span>}
                          {word.lessonNumber != null && (
                            <span>Урок {word.lessonNumber}</span>
                          )}
                        </div>

                        <section className="examples-section">
                          <h4 className="examples-title">
                            Примеры употребления <span>{examples.length}</span>
                          </h4>

                          {examples.length > 0 && (
                            <div className="examples-list">
                              {examples.map((example) => {
                                const isSpeaking =
                                  speakingExampleId === example.id;

                                return (
                                  <div
                                    className="example-item"
                                    key={example.id}
                                  >
                                    <div className="example-copy">
                                      <div className="example-german">
                                        <p>{example.german}</p>

                                        <button
                                          type="button"
                                          className={`speak-button ${
                                            isSpeaking ? "is-speaking" : ""
                                          }`}
                                          onClick={() => speakExample(example)}
                                          disabled={
                                            !speechSupported ||
                                            exampleBusyWordId === word.id
                                          }
                                          aria-label={
                                            isSpeaking
                                              ? "Остановить озвучивание"
                                              : "Прослушать немецкое предложение"
                                          }
                                          title={
                                            !speechSupported
                                              ? "Озвучивание не поддерживается браузером"
                                              : isSpeaking
                                                ? "Остановить"
                                                : "Прослушать"
                                          }
                                        >
                                          {isSpeaking ? "■ Стоп" : "🔊 Слушать"}
                                        </button>
                                      </div>

                                      <p>{example.translation}</p>
                                    </div>

                                    {editable && (
<div className="example-actions">
                                      <button
                                        type="button"
                                        className="small-button secondary-button"
                                        disabled={
                                          exampleBusyWordId === word.id || busy
                                        }
                                        onClick={() =>
                                          beginEditExample(word.id, example)
                                        }
                                      >
                                        Изменить
                                      </button>

                                      <button
                                        type="button"
                                        className="small-button delete-button"
                                        disabled={
                                          exampleBusyWordId === word.id || busy
                                        }
                                        onClick={() =>
                                          void deleteExample(word.id, example)
                                        }
                                      >
                                        Удалить
                                      </button>
                                    </div>
)}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {editable && (
<form
                            className="example-form"
                            onSubmit={(event) =>
                              void saveExample(word.id, event)
                            }
                          >
                            <label>
                              Предложение на немецком
                              <textarea
                                rows={2}
                                required
                                value={exampleInput.german}
                                onChange={(event) =>
                                  updateExampleInput(
                                    word.id,
                                    "german",
                                    event.target.value,
                                  )
                                }
                                placeholder="Например: Ich esse einen Apfel."
                              />
                            </label>

                            <label>
                              Перевод на русский
                              <textarea
                                rows={2}
                                required
                                value={exampleInput.translation}
                                onChange={(event) =>
                                  updateExampleInput(
                                    word.id,
                                    "translation",
                                    event.target.value,
                                  )
                                }
                                placeholder="Например: Я ем яблоко."
                              />
                            </label>

                            <div className="example-form-actions">
                              <button
                                type="submit"
                                className="small-button"
                                disabled={exampleBusyWordId === word.id || busy}
                              >
                                {exampleBusyWordId === word.id
                                  ? "Сохраняем…"
                                  : editingThisExample
                                    ? "Сохранить пример"
                                    : "Добавить пример"}
                              </button>

                              {editingThisExample && (
                                <button
                                  type="button"
                                  className="small-button secondary-button"
                                  onClick={() => cancelExampleEdit(word.id)}
                                  disabled={exampleBusyWordId === word.id}
                                >
                                  Отмена
                                </button>
                              )}
                            </div>
                          </form>
)}
                        </section>
                      </div>

                      <div className="word-actions">
                        {editable && <button type="button" className="small-button secondary-button"
                          disabled={busy || studyMode || studySaving || (studyFinished && !studySaved) || exampleBusyWordId !== null}
                          aria-label={`Переводы: ${word.german}`} onClick={() => openTranslations(word)}>Переводы</button>}
                        {editable && (
<button
                          type="button"
                          className="small-button"
                          disabled={busy}
                          onClick={() => startEditing(word)}
                        >
                          Изменить
                        </button>
)}

                        <button
                          type="button"
                          className="small-button delete-button"
                          disabled={busy || studyMode || studySaving || (studyFinished && !studySaved)}
                          title={studyMode || (studyFinished && !studySaved) ? "Сначала завершите и сохраните тренировку" : "Убрать из личного словаря"}
                          onClick={() => void deleteWord(word)}
                        >
                          Убрать из словаря
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      )}

      <footer>Учись небольшими шагами. Повторяй регулярно.</footer>
      </div>
      {translationTarget && <WordTranslationsEditor key={translationTarget.id} word={translationTarget}
        initialLanguage={user.translationLanguage} onClose={() => setTranslationTarget(null)} onSaved={syncAfterTranslation} />}
    </main>
  );
}
