import { activeTrainingWords, matchesDictionaryView, type DictionaryEntry } from './dictionary-entry-client';
import { matchesLesson, type BookWord } from './word-books';
import { matchesArticleCategory, matchesPersonalTag, type LessonName } from './organization-client';

export type DictionaryArea = 'search' | 'learn' | 'training' | 'add';
export type LessonSelection = { book: string; lesson: string };
export type TrainingSelection = LessonSelection & {
  view: 'active' | 'favorites' | 'difficult'; tag: string; level: string; article: string;
};
export const DEFAULT_TRAINING_SELECTION: TrainingSelection = {
  book: '', lesson: 'all', view: 'active', tag: '', level: 'all', article: 'all',
};
export type WorkspaceWord = BookWord & {
  dictionaryEntry?: DictionaryEntry; level?: string | null;
  article: string; grammaticalNumber: string; personalTags?: readonly string[];
  personalLessonNames?: readonly LessonName[];
};

// Search query and search filters are deliberately not accepted here.
export function trainingSelectionWords<T extends WorkspaceWord>(words: readonly T[], selection: TrainingSelection): T[] {
  return activeTrainingWords(words).filter(word =>
    matchesDictionaryView(word, selection.view) && matchesLesson(word, selection.book, selection.lesson) &&
    matchesPersonalTag(word, selection.tag) && (selection.level === 'all' || word.level === selection.level) &&
    matchesArticleCategory(word, selection.article));
}

export function learningLessonWords<T extends WorkspaceWord>(words: readonly T[], selection: LessonSelection): T[] {
  if (!selection.book || !selection.lesson) return [];
  return activeTrainingWords(words).filter(word => matchesLesson(word, selection.book, selection.lesson));
}

export function trainingFromLesson(selection: LessonSelection): TrainingSelection {
  return { ...DEFAULT_TRAINING_SELECTION, book: selection.book, lesson: selection.lesson };
}

export function learningPosition(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}
