export type PracticeMode = "forward" | "reverse" | "article" | "plural";
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
  return words.filter(word => mode === "reverse" ? hasPracticeTranslation(word) : mode === "article" ? hasPracticeArticle(word) : mode === "plural" ? practicePlurals(word).length > 0 : true);
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

type PluralWord = { article: string; grammaticalNumber: string; pluralForm?: string | null };

const clean = (text: string) => text.normalize("NFC").trim().replace(/\s+/gu, " ");
const withoutArticle = (text: string) => clean(text).replace(/^die\s+/iu, "");
const placeholders = /^(?:kein(?:e|en)? (?:plural|mehrzahl|pluralform)|ohne (?:plural|mehrzahl|pluralform)|nur (?:singular|einzahl)|singular|einzahl|unbekannt|unknown|none|no plural|uncountable|nicht vorhanden|plural unbekannt|nicht (?:bekannt|gebräuchlich)|keine angabe|n\/?a|e|en|n|er|s|es)$/iu;

// Only explicit, complete forms are trainable. Never expand suffix shorthand or
// silently turn annotations into another accepted answer.
export function practicePlurals(word: PluralWord): string[] {
  if (word.grammaticalNumber !== "singular" || !["der", "die", "das"].includes(word.article) || !word.pluralForm?.trim()) return [];
  const variants = clean(word.pluralForm).split(/\s*(?:[,;/]|\s+oder\s+)\s*/iu).map(withoutArticle);
  if (variants.some(form => !form || placeholders.test(form) || !/^[\p{Script=Latin}][\p{Script=Latin}\p{M}]*(?:[- ][\p{Script=Latin}][\p{Script=Latin}\p{M}]*)*$/u.test(form))) return [];
  const unique = new Map<string, string>();
  for (const form of variants) if (!unique.has(form.toLocaleLowerCase("de"))) unique.set(form.toLocaleLowerCase("de"), form);
  return [...unique.values()];
}

export function correctPracticePlural(word: PluralWord, answer: string): boolean {
  const actual = withoutArticle(answer).toLocaleLowerCase("de");
  return !!actual && practicePlurals(word).some(form => form.toLocaleLowerCase("de") === actual);
}
