type Requester = (path: string, init?: RequestInit) => Promise<Response>;
export type TranslationLanguage = { code: string; label: string };
export type WordTranslation = { wordId: string; language: string; text: string | null };
export type SavedTranslation = WordTranslation & { text: string };

export class TranslationError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = "TranslationError"; this.status = status; }
}

async function read(response: Response): Promise<unknown> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : Array.isArray(data?.message)
      ? data.message.filter((item: unknown) => typeof item === "string").join(", ") : "Не удалось выполнить запрос перевода";
    throw new TranslationError(response.status, message);
  }
  return data;
}

function path(wordId: string, language: string): string {
  if (!wordId || !language) throw new TranslationError(400, "Укажите карточку и язык перевода");
  return `/words/${encodeURIComponent(wordId)}/translations/${encodeURIComponent(language)}`;
}

function isTranslation(data: unknown, wordId: string, language: string): data is WordTranslation {
  if (!data || typeof data !== "object") return false;
  const value = data as WordTranslation;
  return value.wordId === wordId && value.language === language && (value.text === null || typeof value.text === "string");
}

export function normalizeTranslation(text: string): string { return text.normalize("NFC").trim(); }

export class WordTranslationsClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }

  async languages(signal?: AbortSignal): Promise<TranslationLanguage[]> {
    const data = await read(await this.request("/languages", { signal }));
    const languages = data && typeof data === "object" && "translationLanguages" in data ? data.translationLanguages : null;
    if (!Array.isArray(languages) || !languages.length || !languages.every((item) => item && typeof item.code === "string" &&
      !!item.code && typeof item.label === "string" && !!item.label) || new Set(languages.map((item) => item.code)).size !== languages.length) {
      throw new TranslationError(502, "Не удалось получить список языков перевода");
    }
    return languages;
  }

  async get(wordId: string, language: string, signal?: AbortSignal): Promise<WordTranslation> {
    const data = await read(await this.request(path(wordId, language), { signal }));
    if (!isTranslation(data, wordId, language)) throw new TranslationError(502, "Некорректный ответ перевода");
    return data;
  }

  async save(wordId: string, language: string, input: string): Promise<SavedTranslation> {
    const text = normalizeTranslation(input);
    if (!text || [...text].length > 1000) throw new TranslationError(400, "Перевод должен содержать от 1 до 1000 символов");
    const data = await read(await this.request(path(wordId, language), {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    }));
    if (!isTranslation(data, wordId, language) || data.text !== text) {
      throw new TranslationError(502, "Результат сохранения не подтверждён. Перечитайте перевод перед следующим изменением.");
    }
    return data as SavedTranslation;
  }
}
