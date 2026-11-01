export type TranslationEntry = { language: string; text: string };
export type ExampleDraft = { german: string; language: string; translations: Record<string, string> };
export type WordExample = { id: string; wordId: string; german: string; translation: string;
  translations: TranslationEntry[]; selectedTranslation: { language: string; text: string | null } };

export function emptyExample(language: string): ExampleDraft { return { german: "", language, translations: {} }; }
export function translationDraft(entries: TranslationEntry[]): Record<string, string> {
  return Object.fromEntries(entries.map((entry) => [entry.language, entry.text]));
}
export function translationPatch(values: Record<string, string>) {
  return Object.entries(values).map(([language, input]) => ({ language, text: input.normalize("NFC").trim() || null }));
}
export function examplePayload(draft: ExampleDraft) {
  const german = draft.german.normalize("NFC").trim();
  if (!german) throw new Error("Укажите немецкое предложение для примера.");
  return { german, translations: translationPatch(draft.translations) };
}
export function initialExamples(drafts: ExampleDraft[]) {
  return drafts.filter((draft) => draft.german.trim() || Object.values(draft.translations).some((text) => text.trim())).map(examplePayload);
}
