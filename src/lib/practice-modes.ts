export type PracticeMode = "forward" | "reverse" | "article";
export type NounArticle = "der" | "die" | "das";
export type PracticeWord = {
  id: string; german: string; article: "der" | "die" | "das" | "none";
  grammaticalNumber: "singular" | "plural" | "not_applicable";
  selectedTranslation: { language: string; text: string | null };
  level?: string | null; pluralForm?: string | null; notes?: string | null;
};

export function hasPracticeTranslation(word: PracticeWord): boolean {
  return typeof word.selectedTranslation?.text === "string" && word.selectedTranslation.text.trim().length > 0;
}

export function hasPracticeArticle(word: PracticeWord): boolean {
  return word.grammaticalNumber === "singular" && ["der", "die", "das"].includes(word.article);
}

export function practiceWords<T extends PracticeWord>(words: readonly T[], mode: PracticeMode): T[] {
  return words.filter(word => mode === "reverse" ? hasPracticeTranslation(word) : mode === "article" ? hasPracticeArticle(word) : true);
}

export function barePracticeGerman(word: PracticeWord): string {
  // Old imported cards may already contain an article in the German text.
  if (!hasPracticeArticle(word) && word.grammaticalNumber !== "plural") return word.german.trim();
  return word.german.trim().replace(/^(?:der|die|das)\s+/iu, "");
}

export function fullPracticeGerman(word: PracticeWord): string {
  const article = word.grammaticalNumber === "plural" ? "die" : word.article === "none" ? "" : word.article;
  return `${article ? article + " " : ""}${barePracticeGerman(word)}`;
}

export function correctPracticeArticle(word: PracticeWord, selected: NounArticle): boolean {
  return hasPracticeArticle(word) && word.article === selected;
}
