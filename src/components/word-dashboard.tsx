"use client";
import { WordBookSources } from "./word-book-sources";
import { CorrectionsClient } from "@/lib/corrections-client";
import { CorrectionsPanel, ProposeCorrection } from "./corrections";
import { PersonalBooks } from "./personal-books";
import { bookOptions, bookFilterOptions, matchesBook, matchesLesson as matchesBookLesson, lessonsForBook, normalizeBook } from "@/lib/word-books";
import { GoogleAccountPanel } from "./google-account-panel";
import practiceStyles from "./practice-card.module.css";
import { PracticeCard } from "./practice-card";
import { practiceWords, type PracticeMode } from "@/lib/practice-modes";
import workspaceStyles from "./dictionary-workspace.module.css";
import { DraftRelatedWords } from "./draft-related-words";
import type { RelatedCard } from "@/lib/word-relations-client";
import { eligibleTrainingWords, saveTrainingAnswers } from "@/lib/dictionary-training";
import organizationStyles from "./dictionary-organization.module.css";
import { safeErrorMessage } from "@/lib/i18n";
import { useI18n } from "./ui-language-provider";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiClient, apiFetch, fetchDueWords, fetchNewWords } from "@/lib/api";
import type { AuthUser } from "@/lib/api-client";
import { DictionaryEntryClient, matchesDictionaryView, activeTrainingWords, type DictionaryEntry, type DictionaryView } from "@/lib/dictionary-entry-client";
import { canEditWord, displayTranslation, publicationLabel } from "@/lib/word-view";
import { RelatedWords } from "./related-words";
import { PersonalTranslationsEditor } from "./personal-translations-editor";
import { PersonalNote } from "./personal-note";
import { AccountSessionsPanel } from "./account-sessions-panel";
import { DailyGoalCard, StudySettingsPanel } from "./study-settings-panel";
import { validSettings } from "@/lib/study-settings-client";
import { StudyHistoryPanel } from "./study-history-panel";
import { LibraryPanel } from "./library-panel";
import { TranslationLanguagePicker } from "./translation-language-picker";
import { ModerationPanel } from "./moderation-panel";
import { WordTranslationsEditor } from "./word-translations-editor";
import type { SavedTranslation } from "@/lib/word-translations-client";

type Article = "der" | "das" | "die" | "none";
type GrammaticalNumber = "singular" | "plural" | "not_applicable";

import { InitialExamples } from "./initial-examples";
import { TranslationDraftFields } from "./translation-draft-fields";
import { emptyExample, examplePayload, initialExamples, translationDraft, translationPatch, type ExampleDraft, type WordExample, type TranslationEntry } from "@/lib/card-draft";

const dictionaryEntries = new DictionaryEntryClient(apiFetch);

type Word = {
  dictionaryEntry?: DictionaryEntry;
  id: string;
  german: string;
  article: Article;
  grammaticalNumber: GrammaticalNumber;
  translation: string;
  translations: TranslationEntry[];
  selectedTranslation: { language: string; text: string | null; source?: "personal" };
  publicationStatus: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
  createdByUserId: string | null;
  sourceBook?: string | null;
  bookSources?: { sourceBook: string; lessonNumbers: number[] }[];
  personalBooks?: string[];
  level: string | null;
  lessonNumber: number | null;
  pluralForm?: string | null;
  notes?: string | null;
  examples?: WordExample[];
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
  timeZone: string;
  dailyGoal: number;
  studyDate: string;
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
  const { t, errorText, date, count, noun } = useI18n();
  const [words, setWords] = useState<Word[]>([]);
  const [examplesByWord, setExamplesByWord] = useState<
    Record<string, WordExample[]>
  >({});
  const [exampleInputs, setExampleInputs] = useState<
    Record<string, ExampleDraft>
  >({});
  const [editingExampleId, setEditingExampleId] = useState<string | null>(null);
  const [editingExampleWordId, setEditingExampleWordId] = useState<
    string | null
  >(null);
  const [exampleBusyWordId, setExampleBusyWordId] = useState<string | null>(
    null,
  );

  const [dictionaryArea, setDictionaryArea] = useState<"add" | "training">("training");
  const [relatedDraft, setRelatedDraft] = useState<RelatedCard[]>([]);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const studyHeading = useRef<HTMLHeadingElement>(null);
  const [german, setGerman] = useState("");
  const [article, setArticle] = useState<Article>("der");
  const [grammaticalNumber, setGrammaticalNumber] =
    useState<GrammaticalNumber>("singular");
  const [translationValues, setTranslationValues] = useState<Record<string, string>>({});
  const [formLanguage, setFormLanguage] = useState(user.translationLanguage);
  const [newExamples, setNewExamples] = useState<ExampleDraft[]>([emptyExample(user.translationLanguage)]);
  const [level, setLevel] = useState("A1");
  const [sourceBook, setSourceBook] = useState("");
  const [lessonNumber, setLessonNumber] = useState("1");
  const [pluralForm, setPluralForm] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Загружаем словарь…");
  const [busy, setBusy] = useState(false);
  const [formNotice, setFormNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [speakingExampleId, setSpeakingExampleId] = useState<string | null>(
    null,
  );

  const [visibleWordCount, setVisibleWordCount] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterBook, setFilterBook] = useState("");
  const [filterLesson, setFilterLesson] = useState("all");
  const [filterArticle, setFilterArticle] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const [dictionaryView, setDictionaryView] = useState<DictionaryView>("active");
  const [dictionarySettingsBlocked, setDictionarySettingsBlocked] = useState(false);
  const dictionaryWrite = useRef(false);
  const [dictionarySettingsErrorId, setDictionarySettingsErrorId] = useState<string | null>(null);

  useEffect(() => { setVisibleWordCount(30); }, [searchQuery, filterBook, filterLevel, filterLesson, filterArticle, sortOrder, dictionaryView]);

  const [practiceMode, setPracticeMode] = useState<PracticeMode>("forward");
  const [sessionPracticeMode, setSessionPracticeMode] = useState<PracticeMode>("forward");
  const answerLock = useRef(false);
  const [studyMode, setStudyMode] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [knownWordIds, setKnownWordIds] = useState<string[]>([]);
  const [unknownWordIds, setUnknownWordIds] = useState<string[]>([]);
  const [studyFinished, setStudyFinished] = useState(false);
  const [studySaving, setStudySaving] = useState(false);
  const [studySaved, setStudySaved] = useState(false);
  const [languageChanging, setLanguageChanging] = useState(false);
  const [correctionsEnabled, setCorrectionsEnabled] = useState(false);
  const [correctionsBusy, setCorrectionsBusy] = useState(false);
  const [moderationTarget, setModerationTarget] = useState<string | undefined>();
  useEffect(() => {
    const abort = new AbortController(); setCorrectionsEnabled(false);
    void new CorrectionsClient(apiFetch).enabled(abort.signal).then(enabled => { if (!abort.signal.aborted) setCorrectionsEnabled(enabled); }).catch(() => {});
    return () => abort.abort();
  }, [user.id]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [personalTranslationTarget, setPersonalTranslationTarget] = useState<Word | null>(null);
  const [translationTarget, setTranslationTarget] = useState<{ id: string; german: string } | null>(null);
  const [translationVersion, setTranslationVersion] = useState(0);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const progressRequest = useRef(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [dictionaryLoading, setDictionaryLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"dictionary" | "progress" | "history" | "settings" | "library" | "moderation" | "corrections">(
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
  const [duePool, setDuePool] = useState<Word[]>([]);
  const [dueLoading, setDueLoading] = useState(false);
  const [dueError, setDueError] = useState("");

  const [newPool, setNewPool] = useState<Word[]>([]);
  const [newWordsLoading, setNewWordsLoading] = useState(false);
  const [newWordsError, setNewWordsError] = useState("");
  const [newWordsLimit, setNewWordsLimit] = useState(5);

  const speechVoices = useRef<SpeechSynthesisVoice[]>([]);
  const speakingExampleIdRef = useRef<string | null>(null);
  const studyRequestKey = useRef<string | null>(null);

  const refreshNewWordsCount = useCallback(async () => {
    try {
      const data = await fetchNewWords();
      setNewPool(data.words);
      setNewWordsError("");
    } catch (error) {
      setNewWordsError(error instanceof Error ? safeErrorMessage(error) : "Не удалось обновить новые слова");
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
      setWords(loadedWords); setDictionarySettingsBlocked(false);

      setExamplesByWord(Object.fromEntries(loadedWords.map(word => [word.id, word.examples ?? []])));
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

  function speakExample(example: Pick<WordExample, "id" | "german">) {
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
      german: spokenWord,
    });
  }

  function resetForm() {
    setFormNotice(""); setFormError("");
    setRelatedDraft([]);
    setEditingId(null);
    setGerman("");
    setArticle("der");
    setGrammaticalNumber("singular");
    setTranslationValues({});
    setFormLanguage(user.translationLanguage);
    setNewExamples([emptyExample(user.translationLanguage)]);
    setLevel("A1");
    setSourceBook("");
    setLessonNumber("1");
    setPluralForm("");
    setNotes("");
  }

  function startEditing(word: Omit<Word, "examples">) {
    setFormNotice(""); setFormError("");
    setDictionaryArea("add");
    setEditingId(word.id);
    setGerman(word.german);
    setArticle(word.article);
    setGrammaticalNumber(word.grammaticalNumber);
    setTranslationValues(translationDraft(word.translations));
    setFormLanguage(user.translationLanguage);
    setLevel(word.level ?? "A1");
    setSourceBook(word.sourceBook ?? "");
    setLessonNumber(word.lessonNumber == null ? "" : String(word.lessonNumber));
    setPluralForm(word.pluralForm ?? "");
    setNotes(word.notes ?? "");
    setStatus(`Редактирование: ${word.german}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormNotice(""); setFormError("");
    setBusy(true);

    try {
      const payload = {
        german: german.trim(),
        article,
        grammaticalNumber,
        translations: translationPatch(translationValues),
        ...(!editingId ? { examples: initialExamples(newExamples), relatedWordIds: relatedDraft.map(card => card.id) } : {}),
        level,
        sourceBook: normalizeBook(sourceBook) || null,
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
      setFormNotice(wasEditing ? "Изменения сохранены" : "Слово добавлено");
    } catch (error) {
      const message = error instanceof Error ? safeErrorMessage(error) : "Ошибка сохранения";
      setStatus(message); setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  async function changeDictionaryEntry(word: Word, patch: { isFavorite?: boolean; isArchived?: boolean }) {
    if (!word.dictionaryEntry || dictionaryWrite.current || busy || dictionarySettingsBlocked || studyMode || studySaving || (studyFinished && !studySaved)) return;
    dictionaryWrite.current = true; setBusy(true);
    try {
      let saved: DictionaryEntry;
      try { saved = await dictionaryEntries.save(word.id, word.dictionaryEntry, patch); }
      catch (error) { setDictionarySettingsBlocked(true); setDictionarySettingsErrorId(word.id); setStatus(error instanceof Error ? error.message : "Не удалось изменить настройки слова. Обновите словарь."); return; }
      setWords(current => current.map(item => item.id === word.id ? { ...item, dictionaryEntry: saved } : item));
      try { await syncAfterCardChange(); setStatus("Настройки слова сохранены."); }
      catch { setStatus("Настройки слова сохранены. Обновите словарь."); }
    } finally { dictionaryWrite.current = false; setBusy(false); }
  }

  async function deleteWord(word: Word) {
    if (studyMode || studySaving || (studyFinished && !studySaved)) return;
    if (
      !window.confirm(
        t("Убрать слово «{0}» из личного словаря?", { 0: word.german }),
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
      setStatus(error instanceof Error ? safeErrorMessage(error) : "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  }

  function updateExampleInput(
    wordId: string,
    field: "german" | "language" | "translation",
    value: string,
  ) {
    setExampleInputs((current) => ({
      ...current,
      [wordId]: (() => {
        const draft = current[wordId] ?? emptyExample(user.translationLanguage);
        return field === "translation" ? { ...draft, translations: { ...draft.translations, [draft.language]: value } } : { ...draft, [field]: value };
      })(),
    }));
  }

  function beginEditExample(wordId: string, example: WordExample) {
    setEditingExampleId(example.id);
    setEditingExampleWordId(wordId);

    setExampleInputs((current) => ({
      ...current,
      [wordId]: {
        german: example.german,
        language: user.translationLanguage,
        translations: translationDraft(example.translations),
      },
    }));
  }

  function cancelExampleEdit(wordId: string) {
    setEditingExampleId(null);
    setEditingExampleWordId(null);

    setExampleInputs((current) => ({
      ...current,
      [wordId]: emptyExample(user.translationLanguage),
    }));
  }

  async function saveExample(
    wordId: string,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const input = exampleInputs[wordId] ?? emptyExample(user.translationLanguage);

    if (!input.german.trim()) {
      setStatus("Заполните немецкое предложение. Перевод необязателен.");
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
        body: JSON.stringify(examplePayload(input)),
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
        [wordId]: emptyExample(user.translationLanguage),
      }));

      setEditingExampleId(null);
      setEditingExampleWordId(null);
      setStatus(isEditing ? "Пример обновлён" : "Пример добавлен");
    } catch (error) {
      setStatus(
        error instanceof Error ? safeErrorMessage(error) : "Ошибка сохранения примера",
      );
    } finally {
      setExampleBusyWordId(null);
    }
  }

  async function deleteExample(wordId: string, example: WordExample) {
    if (!window.confirm(t("Удалить этот пример?"))) return;

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
        error instanceof Error ? safeErrorMessage(error) : "Ошибка удаления примера",
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
    await saveTrainingAnswers(apiFetch, sessionWords, requestKey);
    void refreshNewWordsCount();
  }

  function startStudyWithWords(wordsToStudy: Word[]) {
    if (studySaving || busy || dictionarySettingsBlocked) return;
    wordsToStudy = practiceWords(activeTrainingWords(wordsToStudy), practiceMode);
    if (wordsToStudy.length === 0) {
      setStatus("Нет слов для тренировки.");
      return;
    }

    stopSpeech();
    studyRequestKey.current = crypto.randomUUID();
    setSessionPracticeMode(practiceMode);
    setStudyWords(wordsToStudy);
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
    startStudyWithWords(activeTrainingWords(filteredWords));
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

      startStudyWithWords(eligibleTrainingWords(filteredTrainingWords, words));
    } finally {
      setDueLoading(false);
    }
  }

  async function startNewWordsStudy() {
    setNewWordsLoading(true);
    setNewWordsError("");

    try {
      const data = await fetchNewWords();
      setNewPool(data.words);

      const selected = eligibleTrainingWords(filteredTrainingWords, data.words);
      if (selected.length === 0) {
        setNewWordsError(
          "Новых слов пока нет. Добавь слова в словарь, чтобы начать изучение.",
        );
        return;
      }

      const wordsToStudy =
        newWordsLimit === 0 ? selected : selected.slice(0, newWordsLimit);
      startStudyWithWords(wordsToStudy);
    } catch (error) {
      setNewWordsError(
        error instanceof Error
          ? safeErrorMessage(error)
          : "Не удалось загрузить новые слова",
      );
    } finally {
      setNewWordsLoading(false);
    }
  }

  function revealTranslation() {
    setShowTranslation(true);
  }

  async function answerStudyCard(knewWord: boolean) {
    const currentWord = studyWords[studyIndex];

    if (!currentWord || studySaving || answerLock.current) return;
    answerLock.current = true;
    stopSpeech();

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
      setHistoryVersion((value) => value + 1);

      // Обновляем количество слов, которым требуется повторение.
      void loadDueWords();

      // Обновляем статистику, если открыт раздел прогресса.
      if (activeTab === "progress") {
        void loadStudyProgress();
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Тренировка завершена, но сохранить результаты не удалось: ${safeErrorMessage(error)}`
          : "Тренировка завершена, но сохранить результаты не удалось.",
      );
    } finally {
      setStudySaving(false);
    }
  }

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  const books = bookOptions(words);
  const bookSuggestions = [...new Set([...books.map(book => book.title), "B1+ Brückenkurs", "A1 Treffpunkt", "A1.1 Schritte plus", "A1.2 Schritte plus", "A2.1 Schritte plus", "A2.2 Schritte plus", "B1.1 Schritte plus"])];
  const filteredWords = words
    .filter((word) => {
      if (!matchesDictionaryView(word, dictionaryView)) return false;
      const examples = examplesByWord[word.id] ?? [];

      const searchableText = [
        word.german,
        word.selectedTranslation?.text ?? "",
        word.pluralForm ?? "",
        word.notes ?? "",
        word.sourceBook ?? "",
        ...(word.bookSources ?? []).map(source => source.sourceBook),
        ...(word.personalBooks ?? []),
        ...examples.flatMap((example) => [example.german, example.selectedTranslation.text ?? ""]),
      ]
        .join(" ")
        .toLocaleLowerCase();

      const matchesQuery =
        !normalizedQuery || searchableText.includes(normalizedQuery);

      const matchesLevel = filterLevel === "all" || word.level === filterLevel;

      const matchesLesson = filterLesson === "all" || matchesBookLesson(word, filterBook, filterLesson);

      const matchesArticle =
        filterArticle === "all" ||
        (filterArticle === "plural"
          ? word.grammaticalNumber === "plural"
          : filterArticle === "none"
            ? word.article === "none"
            : word.article === filterArticle &&
              word.grammaticalNumber !== "plural");

      return matchesQuery && matchesBook(word, filterBook) && matchesLevel && matchesLesson && matchesArticle;
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

  const filteredTrainingWords = practiceWords(activeTrainingWords(filteredWords), practiceMode);
  const filteredNewWords = eligibleTrainingWords(filteredTrainingWords, newPool);
  const filteredDueWords = eligibleTrainingWords(filteredTrainingWords, duePool);
  const trainingLocked = studyMode || studySaving || busy || dictionaryLoading || dictionarySettingsBlocked || newWordsLoading || dueLoading || (studyFinished && !studySaved);

  useEffect(() => {
    if (dictionaryArea === "add") formHeading.current?.focus();
  }, [dictionaryArea, editingId]);
  useEffect(() => {
    if (studyMode) studyHeading.current?.focus();
  }, [studyMode]);
  useEffect(() => { answerLock.current = false; }, [studyIndex, studyMode, studyWords]);

  const loadStudyProgress = useCallback(async () => {
    const request = ++progressRequest.current;
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
      if (!validSettings(data) || !Number.isInteger(data.studiedToday) || data.studiedToday < 0 ||
        typeof data.studyDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.studyDate)) {
        throw new Error("Не удалось загрузить статистику обучения");
      }
      if (request === progressRequest.current) setStudyProgress(data);
    } catch (error) {
      if (request === progressRequest.current) setProgressError(
        error instanceof Error ? safeErrorMessage(error) : "Ошибка загрузки статистики",
      );
    } finally {
      if (request === progressRequest.current) setProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStudyProgress();
    const refresh = () => { if (document.visibilityState === "visible") void loadStudyProgress(); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); progressRequest.current += 1; };
  }, [user.id, settingsVersion, loadStudyProgress]);

  async function loadDueWords(): Promise<Word[]> {
    try {
      setDueError("");

      const data = await fetchDueWords();

      setDuePool(data.words);

      return data.words;
    } catch (error) {
      console.error("Ошибка загрузки слов для повторения:", error);

      setDueError(
        error instanceof Error
          ? safeErrorMessage(error)
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
    busy || libraryBusy || moderationBusy || correctionsBusy || personalTranslationTarget !== null || translationTarget !== null || dictionaryLoading || dueLoading || newWordsLoading || progressLoading || exampleBusyWordId !== null;

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
    if (editingId === saved.wordId) setTranslationValues((current) => ({ ...current, [saved.language]: saved.text }));
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
          <p className="eyebrow">{t("DEUTSCH LERNEN")}</p>
          <h1>Wortkarten</h1>
        </div>
        <span className="status">{errorText(status)}</span>
      </header>

      <TranslationLanguagePicker language={user.translationLanguage} disabled={languageLocked}
        pending={languageChanging} onChange={changeTranslationLanguage} />

      <div inert={languageChanging} aria-busy={languageChanging}>

      <section className="intro">
        <div>
          <p className="eyebrow">{t("ТВОЙ СЛОВАРЬ")}</p>
          <h2>{t("Слова, которые")}{" "}<br />
            <span>{t("запоминаются.")}</span>
          </h2>
          <p className="intro-copy">{t("Собирай лексику по урокам и повторяй её с умом.")}</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">{t("В словаре")}</span>
          <strong>{words.length}</strong>
          <span className="summary-caption">{noun(words.length, "card")}</span>
        </div>
      </section>
      <nav className={`dashboard-tabs ${organizationStyles.navigation}`} aria-label={t("Разделы приложения")}>
        <button
          type="button"
          className={
            activeTab === "dictionary"
              ? "dashboard-tab active"
              : "dashboard-tab"
          }
          onClick={() => setActiveTab("dictionary")}
          disabled={libraryBusy || moderationBusy || correctionsBusy}
        >{t("Словарь")}</button>

        <button
          type="button"
          className={
            activeTab === "progress" ? "dashboard-tab active" : "dashboard-tab"
          }
          onClick={() => {
            setActiveTab("progress");
            void loadStudyProgress();
          }}
          disabled={libraryBusy || moderationBusy || correctionsBusy}
        >{t("Прогресс")}</button>
        <button type="button" className={activeTab === "history" ? "dashboard-tab active" : "dashboard-tab"}
          disabled={libraryBusy || moderationBusy || correctionsBusy} onClick={() => setActiveTab("history")}>{t("История")}</button>
        <button type="button" className={activeTab === "library" ? "dashboard-tab active" : "dashboard-tab"}
          disabled={libraryBusy || moderationBusy || correctionsBusy} onClick={() => setActiveTab("library")}>{t("Библиотека")}</button>
        {user.role === "ADMIN" && <button type="button"
          className={activeTab === "moderation" ? "dashboard-tab active" : "dashboard-tab"}
          disabled={libraryBusy || moderationBusy || correctionsBusy} onClick={() => setActiveTab("moderation")}>{t("Модерация")}</button>}
        {correctionsEnabled && <button type="button" className={activeTab === "corrections" ? "dashboard-tab active" : "dashboard-tab"}
          disabled={libraryBusy || moderationBusy || correctionsBusy} onClick={() => setActiveTab("corrections")}>{t("Исправления")}</button>}
        <button type="button" className={activeTab === "settings" ? "dashboard-tab active" : "dashboard-tab"}
          disabled={libraryBusy || moderationBusy || correctionsBusy} onClick={() => setActiveTab("settings")}>{t("Настройки")}</button>
      </nav>

      {activeTab === "settings" && <><GoogleAccountPanel key={`google-${user.id}`} userId={user.id} /><StudySettingsPanel key={user.id} userId={user.id} onSaved={() => setSettingsVersion((value) => value + 1)} /><AccountSessionsPanel key={`sessions-${user.id}`} userId={user.id} /></>}

      {activeTab === "history" && <StudyHistoryPanel userId={user.id} language={user.translationLanguage} version={historyVersion} />}

      {activeTab === "corrections" && correctionsEnabled && <CorrectionsPanel key={user.id} isAdmin={user.role === "ADMIN"} onBusyChange={setCorrectionsBusy} onOpenCard={wordId => { setModerationTarget(wordId); setActiveTab("moderation"); }} />}

      {activeTab === "library" && <LibraryPanel language={user.translationLanguage} correctionsEnabled={correctionsEnabled}
        onDictionaryChange={async () => { await Promise.all([loadWords(), loadDueWords(), loadStudyProgress()]); }} onBusyChange={setLibraryBusy} />}

      {activeTab === "moderation" && user.role === "ADMIN" && <ModerationPanel initialWordId={moderationTarget}
        onEditWord={card => { setActiveTab("dictionary"); startEditing({ ...card, selectedTranslation: { language: user.translationLanguage, text: card.translations.find(entry => entry.language === user.translationLanguage)?.text ?? null } }); }}
        decisionsLocked={studyMode || studySaving || (studyFinished && !studySaved)}
        onDecision={syncAfterCardChange} onBusyChange={setModerationBusy}
        translationLanguage={user.translationLanguage} translationVersion={translationVersion} onEditTranslations={openTranslations} />}

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
                <p className="eyebrow">{t("СЛОВО ЗА СЛОВОМ")}</p>
                <h3>{t("Статистика по словам")}</h3>
              </div>
            </div>

            <div className="progress-status-filters">
              <button
                type="button"
                className={progressStatusFilter === "all" ? "active" : ""}
                onClick={() => setProgressStatusFilter("all")}
              >{t("Все (")}{studyProgress?.words.length ?? 0})
              </button>

              <button
                type="button"
                className={progressStatusFilter === "learning" ? "active" : ""}
                onClick={() => setProgressStatusFilter("learning")}
              >{t("Закрепляется (")}{" "}{
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
              >{t("Пора повторить (")}{" "}{
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
              >{t("Закреплено (")}{" "}{
                  (studyProgress?.words ?? []).filter(
                    (item) => getWordStatus(item) === "Закреплено",
                  ).length
                }
                )
              </button>
            </div>

            {progressLoading && !studyProgress ? (
              <p>{t("Загружаем статистику…")}</p>
            ) : progressError && !studyProgress ? (
              <div className="empty-state">
                <h4>{t("Не удалось загрузить статистику")}</h4>
                <p>{errorText(progressError)}</p>
                <button
                  type="button"
                  className="small-button"
                  onClick={() => void loadStudyProgress()}
                >{t("Попробовать снова")}</button>
              </div>
            ) : studyProgress ? (
              <>
                {progressError && <p role="alert">{errorText(progressError)}</p>}

                <div className="study-results-grid progress-summary">
                  <div>
                    <strong>{studyProgress.totalSessions}</strong>
                    <span>{t("Тренировок")}</span>
                  </div>

                  <div>
                    <strong>{studyProgress.knownAnswers}</strong>
                    <span>{t("Ответов «Знаю»")}</span>
                  </div>

                  <div>
                    {/* <strong>{studyProgress.needsReviewAnswers}</strong> */}
                    {/* <span>Нужно повторить</span> */}
                    <strong>{studyProgress.dueCount}</strong>
                    <span>{t("Пора повторить")}</span>
                  </div>

                  <div>
                    <strong>{studyProgress.wordsWithProgress}</strong>
                    <span>{t("Слов изучалось")}</span>
                  </div>
                  <div>
                    <strong>{studyProgress.studiedToday}</strong>
                    <span>{t("Изучено сегодня")}</span>
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
                    <span>{t("Слов с ответом «Знаю»")}</span>
                  </div>
                </div>

                <DailyGoalCard progress={studyProgress} loading={progressLoading} error={progressError} onRetry={() => void loadStudyProgress()} />

                <div className="progress-overview">
                  <div className="progress-overview-heading">
                    <h4>{t("Общий результат")}</h4>
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

                  <p className="hint">{t("Активных слов в словаре:")}{" "}{studyProgress.totalWordsInDictionary}{" "}{t(". Показатель отражает самооценку ответов, а не автоматическую проверку знаний.")}</p>
                </div>

                <div className="progress-words">
                  {/* <div className="section-heading">
                    <div>
                      <p className="eyebrow">{t("СЛОВО ЗА СЛОВОМ")}</p>
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
                            ? t("Пока нет истории повторений")
                            : t("В этой категории пока нет слов")}
                        </h4>
                        <p>
                          {studyProgress.words.length === 0
                            ? t("Пройди тренировку, и здесь появятся результаты по словам.")
                            : t("Выбери другую категорию или продолжи обучение.")}
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
                                  {t(getWordStatus(item))}
                                </span>

                                <p dir="auto">{displayTranslation(item.word, t("Перевод отсутствует"))}</p>

                                <div className="word-meta">
                                  <span>{t("Знаю:")}{" "}{item.knownCount}</span>
                                  <span>{t("Повторить:")}{" "}{item.needsReviewCount}
                                  </span>
                                </div>
                                <p className="word-extra">
                                  <strong>{t("Последнее повторение:")}</strong>{" "}
                                  {item.lastReviewedAt
                                    ? date(item.lastReviewedAt)
                                    : t("Нет данных")}
                                </p>

                                <p className="word-extra">
                                  <strong>{t("Следующее повторение:")}</strong>{" "}
                                  {item.nextReviewAt
                                    ? date(item.nextReviewAt)
                                    : t("Не запланировано")}
                                </p>

                                <p className="word-extra">
                                  <strong>{t("Текущий интервал:")}</strong>{" "}
                                  {item.currentIntervalDays > 0
                                    ? count(item.currentIntervalDays, "day")
                                    : t("Ещё не установлен")}
                                </p>

                                <p className="word-extra">
                                  <strong>{t("Успешных ответов подряд:")}</strong>{" "}
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
                  <span>{t("Пора повторить")}</span>
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
        <>
        <div className={workspaceStyles.choices} role="group" aria-label={t("Действия со словарём")}>
          <button type="button" aria-pressed={dictionaryArea === "add"} disabled={trainingLocked || exampleBusyWordId !== null} onClick={() => setDictionaryArea("add")}>
            <strong>{editingId ? t("Редактировать слово") : t("Добавить слово")}</strong><span>{t("Слово, переводы, примеры и связи — в одной форме.")}</span>
          </button>
          <button type="button" aria-pressed={dictionaryArea === "training"} disabled={trainingLocked || exampleBusyWordId !== null} onClick={() => setDictionaryArea("training")}>
            <strong>{t("Тренировка")}</strong><span>{t("Весь словарь, новые слова или повторение по выбранным фильтрам.")}</span>
          </button>
        </div>
        <section className={workspaceStyles.workspace}>
          {dictionaryArea === "add" && <section className={`panel form-panel ${workspaceStyles.formPanel}`} aria-labelledby="word-form-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {editingId ? t("ИЗМЕНЕНИЕ ЗАПИСИ") : t("НОВАЯ ЗАПИСЬ")}
                </p>
                <h3 id="word-form-heading" ref={formHeading} tabIndex={-1}>{editingId ? t("Редактировать слово") : t("Добавить слово")}</h3>
              </div>
              <span className="plus">{editingId ? "✎" : "+"}</span>
            </div>

            <form onSubmit={submitWord}>
              <label>{t("Немецкое слово")}{" "}<input
                  required
                  value={german}
                  onChange={(event) => setGerman(event.target.value)}
                  placeholder={t("например, Apfel")}
                />
              </label>

              <label>{t("Артикль / категория")}{" "}<select
                  value={`${article}:${grammaticalNumber}`}
                  onChange={(event) => {
                    const [nextArticle, nextNumber] = event.target.value.split(
                      ":",
                    ) as [Article, GrammaticalNumber];

                    setArticle(nextArticle);
                    setGrammaticalNumber(nextNumber);
                  }}
                >
                  <option value="der:singular">{t("der — мужской род (синий)")}</option>
                  <option value="das:singular">{t("das — средний род (зелёный)")}</option>
                  <option value="die:singular">{t("die — женский род, ед. ч. (красный/розовый)")}</option>
                  <option value="die:plural">{t("die — множественное число (жёлтый/оранжевый)")}</option>
                  <option value="none:not_applicable">{t("Без артикля / не указан")}</option>
                </select>
              </label>

              <TranslationDraftFields label={t("Перевод слова (необязательно)")} language={formLanguage} values={translationValues} disabled={busy}
                onLanguage={setFormLanguage} onText={(language, text) => setTranslationValues((current) => ({ ...current, [language]: text }))} />

              <label>{t("Множественное число")}{" "}<input
                  value={pluralForm}
                  onChange={(event) => setPluralForm(event.target.value)}
                  placeholder={t("Например: die Äpfel")}
                />
              </label>

              <label>{t("Общая заметка карточки")}{" "}<textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t("Контекст, произношение или подсказка")}
                  rows={3}
                />
              </label>

              <p className="hint">{t("Эта заметка относится к общей карточке. Личную можно добавить после сохранения.")}</p>

              {!editingId && <InitialExamples drafts={newExamples} onChange={setNewExamples} language={formLanguage} disabled={busy} />}

              <label>{t("Книга-источник")}<input list="source-book-options" maxLength={120} value={sourceBook} onChange={event => setSourceBook(event.target.value)} placeholder="B1+ Brückenkurs" /></label>
              <datalist id="source-book-options">{bookSuggestions.map(title => <option key={title} value={title} />)}</datalist>
              <p className="hint">{t("Источник виден в общей карточке. Свои другие книги можно привязать после сохранения.")}</p>
              <div className="form-row">
                <label>{t("Уровень")}{" "}<select
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

                <label>{t("№ урока")}{" "}<input
                    type="number"
                    min="1"
                    value={lessonNumber}
                    onChange={(event) => setLessonNumber(event.target.value)}
                  />
                </label>
              </div>

              {!editingId && <DraftRelatedWords own={words} language={user.translationLanguage} selected={relatedDraft} onChange={setRelatedDraft} disabled={busy} />}

              <button disabled={busy} type="submit">
                {busy
                  ? t("Сохраняем…")
                  : editingId
                    ? t("Сохранить изменения")
                    : t("Добавить в словарь")}{" "}
                <span>↗</span>
              </button>

              {formNotice && <p role="status">{t(formNotice)}</p>}
              {formError && <p role="alert">{errorText(formError)}</p>}
              {editingId && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  type="button"
                  onClick={() => { resetForm(); setDictionaryArea("training"); }}
                >{t("Отмена")}</button>
              )}
            </form>

            <p className="hint">{t("Добавляй формы множественного числа, заметки и примеры употребления.")}</p>
          </section>}

          {dictionaryArea === "training" && <section className="word-section">
            <div className={workspaceStyles.trainingHeader}>
              <div><p className="eyebrow">{t("ТВОЯ КОЛЛЕКЦИЯ")}</p><h3>{t("Тренировка")}</h3></div>
              <div className={workspaceStyles.headerActions}><span className="count">{count(words.length)}</span>
                  <button type="button" className="small-button secondary-button" disabled={busy || dictionaryLoading || studyMode || studySaving || (studyFinished && !studySaved)} onClick={() => void syncAfterCardChange()}>{t("Обновить словарь")}</button>
              </div>
            </div>
            {!studyMode && !studyFinished && <>
                <fieldset className={workspaceStyles.filters} disabled={trainingLocked}>
                  <legend>{t("Фильтры словаря и тренировки")}</legend>
                  <div>
                  <label>{t("Раздел словаря")} <select value={dictionaryView} onChange={event => setDictionaryView(event.target.value as DictionaryView)} disabled={busy}>
                    <option value="active">{t("Активные слова")}</option><option value="favorites">{t("Избранное")}</option><option value="archive">{t("Архив")}</option><option value="all">{t("Все слова")}</option>
                  </select></label>
                  <label>{t("Поиск")}{" "}<input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={t("Слово, перевод, заметка или пример…")}
                    />
                  </label>

                  <label>{t("Книга")}<select value={filterBook} onChange={event => setFilterBook(event.target.value)}>
                    <option value="">{t("Все книги")}</option><option value="none">{t("Без книги")}</option>{bookFilterOptions(words, filterBook).map(book => <option key={book.key} value={book.key}>{book.title}</option>)}
                  </select></label>
                  <div className={workspaceStyles.filterRow}>
                    <label>{t("Уровень")}{" "}<select
                        value={filterLevel}
                        onChange={(event) => setFilterLevel(event.target.value)}
                      >
                        <option value="all">{t("Все уровни")}</option>
                        {["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>{t("Урок")}{" "}<select
                        value={filterLesson}
                        onChange={(event) =>
                          setFilterLesson(event.target.value)
                        }
                      >
                        <option value="all">{t("Все уроки")}</option>
                        {[
                          ...new Set(
                            words
                              .flatMap((word) => lessonsForBook(word, filterBook))
                              .filter(
                                (value): value is number => value != null,
                              ),
                          ),
                        ]
                          .sort((a, b) => a - b)
                          .map((lesson) => (
                            <option key={lesson} value={String(lesson)}>{t("Урок")}{" "}{lesson}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>

                  <div className={workspaceStyles.filterRow}>
                    <label>{t("Артикль")}{" "}<select
                        value={filterArticle}
                        onChange={(event) =>
                          setFilterArticle(event.target.value)
                        }
                      >
                        <option value="all">{t("Все категории")}</option>
                        <option value="der">{t("der — мужской")}</option>
                        <option value="das">{t("das — средний")}</option>
                        <option value="die">{t("die — женский")}</option>
                        <option value="plural">{t("Множественное число")}</option>
                        <option value="none">{t("Без артикля")}</option>
                      </select>
                    </label>

                    <label>{t("Сортировка")}{" "}<select
                        value={sortOrder}
                        onChange={(event) => setSortOrder(event.target.value)}
                      >
                        <option value="recent">{t("Сначала новые")}</option>
                        <option value="az">{t("По алфавиту: А–Я")}</option>
                        <option value="za">{t("По алфавиту: Я–А")}</option>
                        <option value="level">{t("По уровню и уроку")}</option>
                      </select>
                    </label>
                  </div>

                  </div>
                  <p className="hint">{t("Архивные слова не участвуют в новых тренировках. Прогресс и личные материалы сохраняются.")}</p>
                  <p className="hint">{t("Показано {shown} из {total}", { shown: Math.min(visibleWordCount, filteredWords.length), total: filteredWords.length })}</p>

                  {(searchQuery ||
                    filterBook !== "" ||
                    filterLevel !== "all" ||
                    filterLesson !== "all" ||
                    filterArticle !== "all" ||
                    sortOrder !== "recent" || dictionaryView !== "active") && (
                    <button
                      type="button"
                      className="small-button secondary-button"
                      onClick={() => {
                        setSearchQuery("");
                        setFilterLevel("all");
                        setFilterBook("");
                        setFilterLesson("all");
                        setFilterArticle("all");
                        setSortOrder("recent"); setDictionaryView("active");
                      }}
                    >{t("Сбросить поиск и фильтры")}</button>
                  )}
                </fieldset>
            <fieldset className={practiceStyles.modes} disabled={trainingLocked}>
              <legend>{t("Режим тренировки")}</legend>
              <div className={practiceStyles.options}>
                {([
                  ["forward", "Немецкий → перевод"], ["reverse", "Перевод → немецкий"], ["article", "Артикли der/die/das"],
                ] as const).map(([mode, label]) => <label key={mode} className={practiceStyles.option}>
                  <input type="radio" name="practice-mode" value={mode} checked={practiceMode === mode} onChange={() => setPracticeMode(mode)} /><span>{t(label)}</span>
                </label>)}
              </div>
              <p className={practiceStyles.hint}>{t(practiceMode === "reverse" ? "В этом режиме участвуют слова с переводом на выбранном языке." : practiceMode === "article" ? "В этом режиме участвуют существительные с der, die или das в единственном числе." : "Вспомните перевод немецкого слова и оцените свой ответ.")}</p>
              <p className={practiceStyles.hint}>{t("Ответы всех режимов влияют на общий прогресс слова.")}</p>
            </fieldset>
            <p className={workspaceStyles.hint}>{t("Фильтры применяются ко всем трём вариантам тренировки. Архивные слова не участвуют.")}</p>
            <div className={workspaceStyles.trainingActions}>
              <div><h4>{t("Весь выбранный словарь")}</h4><p className={workspaceStyles.hint}>{t("По выбранным фильтрам: {0}", { 0: count(filteredTrainingWords.length) })}</p>
                <button type="button" disabled={trainingLocked || !filteredTrainingWords.length} onClick={startStudy}>{t("Начать тренировку ({count})", { count: count(filteredTrainingWords.length) })}</button>
                {filteredTrainingWords.length > 500 && <p className={workspaceStyles.hint}>{t("Длинная тренировка будет записана в историю несколькими занятиями.")}</p>}
              </div>
              <div><h4>{t("Новые слова")}</h4><p className={workspaceStyles.hint}>{t("Ещё не изучались: {0}", { 0: count(filteredNewWords.length) })}</p>
                <label htmlFor="new-words-limit">{t("Сколько новых слов изучить?")}</label>
                <select id="new-words-limit" value={newWordsLimit === 0 ? "all" : String(newWordsLimit)} disabled={trainingLocked} onChange={event => setNewWordsLimit(event.target.value === "all" ? 0 : Number(event.target.value))}>
                  {[5, 10, 20].map(limit => <option key={limit} value={limit}>{count(limit)}</option>)}<option value="all">{t("Все новые слова")}</option>
                </select>
                <button type="button" disabled={trainingLocked || !filteredNewWords.length} onClick={() => void startNewWordsStudy()}>{t("Изучить новые слова ({0})", { 0: newWordsLimit ? Math.min(newWordsLimit, filteredNewWords.length) : filteredNewWords.length })}</button>
                {newWordsError && <p role="alert">{errorText(newWordsError)} <button type="button" onClick={() => void refreshNewWordsCount()}>{t("Повторить")}</button></p>}
              </div>
              <div><h4>{t("Пора повторить")}</h4><p className={workspaceStyles.hint}>{t("Повторение по расписанию: {0}", { 0: count(filteredDueWords.length) })}</p>
                <button type="button" disabled={trainingLocked || !filteredDueWords.length} onClick={() => void startDueStudy()}>{t("Пора повторить ({0})", { 0: filteredDueWords.length })}</button>
                {dueError && <p role="alert">{errorText(dueError)} <button type="button" onClick={() => void loadDueWords()}>{t("Повторить")}</button></p>}
              </div>
            </div>
            <h3>{t("Карточки по выбранным фильтрам")}</h3>
            </>}


            {/* {words.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">Aa</div>
              <h4>Пока здесь пусто</h4>
              <p>Добавь первое слово — оно появится в твоём словаре.</p>
            </div>
          ) : ( */}
            {studyMode && studyWords[studyIndex] && (
              <section className="study-panel">
                <h3 ref={studyHeading} tabIndex={-1}>{t("Тренировка")}</h3>
                <div className="study-header">
                  <span>{t("Карточка {current} из {total}", { current: studyIndex + 1, total: studyWords.length })}
                  </span>

                  <button
                    type="button"
                    className="small-button secondary-button"
                    onClick={() => setStudyMode(false)}
                  >{t("Завершить")}</button>
                </div>

                <div className="study-progress">
                  <div
                    className="study-progress-fill"
                    style={{
                      width: `${((studyIndex + 1) / studyWords.length) * 100}%`,
                    }}
                  />
                </div>

                <PracticeCard key={`${sessionPracticeMode}:${studyWords[studyIndex].id}`} word={studyWords[studyIndex]} mode={sessionPracticeMode}
                  examples={examplesByWord[studyWords[studyIndex].id] ?? []} revealed={showTranslation} onReveal={revealTranslation}
                  onAnswer={known => { void answerStudyCard(known); }} saving={studySaving} speechSupported={speechSupported}
                  onSpeak={() => speakWord(studyWords[studyIndex])} onSpeakExample={speakExample} last={studyIndex === studyWords.length - 1} />

                <p className="study-session-stats">{t("Знаю:")}{" "}{knownWordIds.length}{" "}{t("· Повторить:")}{" "}
                  {unknownWordIds.length}
                </p>
              </section>
            )}

            {studyFinished && (
              <section className="study-results">
                <p className="eyebrow">{t("ТРЕНИРОВКА ЗАВЕРШЕНА")}</p>
                <h3>{t("Отличная работа!")}</h3>
                {studySaving && (
                  <p role="status">{t("Сохраняем результаты…")}</p>
                )}

                {studySaved && (
                  <p role="status">{t("✓ Результаты сохранены")}</p>
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
                        setHistoryVersion((value) => value + 1);
                      } catch (error) {
                        setStatus(
                          error instanceof Error
                            ? `Не удалось сохранить: ${safeErrorMessage(error)}`
                            : "Не удалось сохранить результаты.",
                        );
                      } finally {
                        setStudySaving(false);
                      }
                    }}
                    disabled={studySaving}
                  >{t("Повторить сохранение")}</button>
                )}

                <div className="study-results-grid">
                  <div>
                    <strong>{knownWordIds.length}</strong>
                    <span>{t("Знаю")}</span>
                  </div>

                  <div>
                    <strong>{unknownWordIds.length}</strong>
                    <span>{t("Повторить")}</span>
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
                    <span>{t("Знаю без подсказки")}</span>
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
                  >{t("Повторить сложные")}</button>

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
                  >{t("Повторить ошибки ({count})", { count: unknownWordIds.length })}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStudyMode(false);
                      setStudyFinished(false);
                      setShowTranslation(false);
                    }}
                  >{t("Вернуться к словарю")}</button>

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

                <DailyGoalCard progress={studyProgress} loading={progressLoading} error={progressError} onRetry={() => void loadStudyProgress()} />
              </section>
            )}

            {!studyMode && !studyFinished && (filteredWords.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">Aa</div>
                <h4>{t("Ничего не найдено")}</h4>
                <p>{t("Измени запрос или сбрось фильтры.")}</p>
              </div>
            ) : (
              <div className="word-list">
                {filteredWords.slice(0, visibleWordCount).map((word) => {
                  const examples = examplesByWord[word.id] ?? [];
                  const exampleInput = exampleInputs[word.id] ?? emptyExample(user.translationLanguage);

                  const editingThisExample =
                    editingExampleWordId === word.id &&
                    Boolean(editingExampleId);
                  const editable = canEditWord(word, user);

                  return (
                    <article
                      className={`word-card ${colorClass(word)} ${organizationStyles.card}`}
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
                        <div className={organizationStyles.cardHeading}>
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
                            aria-label={t("Прослушать слово {0}", { 0: word.german })}
                            title={t("Прослушать слово с артиклем")}
                          >
                            {speakingExampleId === `word-${word.id}`
                              ? t("■ Стоп")
                              : "🔊"}
                          </button>
                        </div>
                      <div className={organizationStyles.toolbar}>
                        {editable && <button type="button" className="small-button secondary-button"
                          disabled={busy || studyMode || studySaving || (studyFinished && !studySaved) || exampleBusyWordId !== null}
                          aria-label={t("Переводы: {0}", { 0: word.german })} onClick={() => openTranslations(word)}>{t("Переводы")}</button>}
                        {editable && (
<button
                          type="button"
                          className="small-button"
                          disabled={busy}
                          onClick={() => startEditing(word)}
                        >{t("Изменить")}</button>
)}

                        <button
                          type="button"
                          className="small-button delete-button"
                          disabled={busy || studyMode || studySaving || (studyFinished && !studySaved)}
                          title={studyMode || (studyFinished && !studySaved) ? t("Сначала завершите и сохраните тренировку") : t("Убрать из личного словаря")}
                          onClick={() => void deleteWord(word)}
                        >{t("Убрать из словаря")}</button>
                      </div>
                        </div>
                        <p dir="auto">{displayTranslation(word, t("Перевод отсутствует"))}</p>
                        {word.selectedTranslation.source === "personal" && <small>{t("Ваш личный перевод")}</small>}
                        <button type="button" disabled={busy || libraryBusy || moderationBusy || translationTarget !== null || studyMode || studySaving || (studyFinished && !studySaved)} onClick={() => { stopSpeech(); setPersonalTranslationTarget(word); }}>{t("Мой перевод")}</button>

                        {word.pluralForm && (
                          <p className="word-extra">
                            <strong>{t("Мн. число:")}</strong> {word.pluralForm}
                          </p>
                        )}

                        {word.notes && (
                          <p className="word-extra">
                            <strong>{t("Общая заметка:")}</strong> {word.notes}
                          </p>
                        )}

                        <div className="word-meta">
                          <span>{t(publicationLabel(word.publicationStatus))}</span>
                          <WordBookSources word={word} />
                          {(word.personalBooks ?? []).map(title => <span key={title}>{t("Моя книга")}: {title}</span>)}
                          {word.level && <span>{word.level}</span>}

                        </div>

                        {word.dictionaryEntry?.isArchived && <p className="hint">{t("В архиве")}</p>}
                        <div className={organizationStyles.actions}>
                          <button type="button" className="small-button secondary-button" disabled={!word.dictionaryEntry || busy || dictionarySettingsBlocked || studyMode || studySaving || (studyFinished && !studySaved) || dueLoading || newWordsLoading}
                            aria-pressed={word.dictionaryEntry?.isFavorite ?? false} aria-label={t(word.dictionaryEntry?.isFavorite ? "Убрать {0} из избранного" : "Добавить {0} в избранное", { 0: word.german })}
                            onClick={() => void changeDictionaryEntry(word, { isFavorite: !word.dictionaryEntry?.isFavorite })}>{word.dictionaryEntry?.isFavorite ? t("★ В избранном") : t("☆ В избранное")}</button>
                          <button type="button" className="small-button secondary-button" disabled={!word.dictionaryEntry || busy || dictionarySettingsBlocked || studyMode || studySaving || (studyFinished && !studySaved) || dueLoading || newWordsLoading}
                            aria-label={t(word.dictionaryEntry?.isArchived ? "Вернуть {0} из архива" : "Перенести {0} в архив", { 0: word.german })}
                            onClick={() => void changeDictionaryEntry(word, { isArchived: !word.dictionaryEntry?.isArchived })}>{word.dictionaryEntry?.isArchived ? t("Вернуть из архива") : t("В архив")}</button>
                        </div>
                        {dictionarySettingsBlocked && dictionarySettingsErrorId === word.id && <div role="alert"><p>{errorText(status)}</p><button type="button" className="small-button secondary-button" disabled={busy || dictionaryLoading} onClick={() => void syncAfterCardChange()}>{t("Обновить словарь")}</button></div>}
                        <PersonalBooks wordId={word.id} userId={user.id} suggestions={bookSuggestions} disabled={busy || trainingLocked} onSaved={titles => setWords(current => current.map(card => card.id === word.id ? { ...card, personalBooks: titles } : card))} />
                        <PersonalNote wordId={word.id} userId={user.id} disabled={busy} />
                        {correctionsEnabled && word.publicationStatus === "PUBLISHED" && <ProposeCorrection wordId={word.id} german={word.german} disabled={busy || trainingLocked} onBusyChange={setCorrectionsBusy} />}

                        <section className="examples-section">
                          <h4 className="examples-title">{t("Примеры употребления")}{" "}<span>{examples.length}</span>
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
                                              ? t("Остановить озвучивание")
                                              : t("Прослушать немецкое предложение")
                                          }
                                          title={
                                            !speechSupported
                                              ? t("Озвучивание не поддерживается браузером")
                                              : isSpeaking
                                                ? t("Остановить")
                                                : t("Прослушать")
                                          }
                                        >
                                          {isSpeaking ? t("■ Стоп") : t("🔊 Слушать")}
                                        </button>
                                      </div>

                                      <p>{displayTranslation(example, t("Перевод отсутствует"))}</p>
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
                                      >{t("Изменить")}</button>

                                      <button
                                        type="button"
                                        className="small-button delete-button"
                                        disabled={
                                          exampleBusyWordId === word.id || busy
                                        }
                                        onClick={() =>
                                          void deleteExample(word.id, example)
                                        }
                                      >{t("Удалить")}</button>
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
                            <label>{t("Предложение на немецком")}{" "}<textarea
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
                                placeholder={t("Например: Ich esse einen Apfel.")}
                              />
                            </label>

                            <TranslationDraftFields language={exampleInput.language} values={exampleInput.translations} disabled={exampleBusyWordId === word.id || busy}
                              onLanguage={(value) => updateExampleInput(word.id, "language", value)}
                              onText={(_language, text) => updateExampleInput(word.id, "translation", text)} />

                            <div className="example-form-actions">
                              <button
                                type="submit"
                                className="small-button"
                                disabled={exampleBusyWordId === word.id || busy}
                              >
                                {exampleBusyWordId === word.id
                                  ? t("Сохраняем…")
                                  : editingThisExample
                                    ? t("Сохранить пример")
                                    : t("Добавить пример")}
                              </button>

                              {editingThisExample && (
                                <button
                                  type="button"
                                  className="small-button secondary-button"
                                  onClick={() => cancelExampleEdit(word.id)}
                                  disabled={exampleBusyWordId === word.id}
                                >{t("Отмена")}</button>
                              )}
                            </div>
                          </form>
)}
                        </section>
                        <RelatedWords wordId={word.id} language={user.translationLanguage} />
                      </div>


                    </article>
                  );
                })}
                {visibleWordCount < filteredWords.length && <button type="button" className="small-button secondary-button" onClick={() => setVisibleWordCount(value => value + 30)}>{t("Показать ещё 30 карточек")}</button>}
              </div>
            ))}
          </section>}
        </section>
        </>
      )}

      <footer>{t("Учись небольшими шагами. Повторяй регулярно.")}</footer>
      </div>
      {personalTranslationTarget && <PersonalTranslationsEditor key={`${user.id}-${personalTranslationTarget.id}-${user.translationLanguage}`} word={words.find(word => word.id === personalTranslationTarget.id) ?? personalTranslationTarget}
        language={user.translationLanguage} onClose={() => { setPersonalTranslationTarget(null); void loadWords(); }} onSaved={async () => { setHistoryVersion(value => value + 1); await syncAfterCardChange(); }} />}
      {translationTarget && <WordTranslationsEditor key={translationTarget.id} word={translationTarget}
        initialLanguage={user.translationLanguage} onClose={() => setTranslationTarget(null)} onSaved={syncAfterTranslation} />}
    </main>
  );
}
