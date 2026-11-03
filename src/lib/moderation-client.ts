import type { StudyWord } from "./api";

export type PublicationStatus = "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
export type ModerationWord = Omit<StudyWord, "selectedTranslation"> & {
  translations: { language: string; text: string }[];
};
export type ReviewCard = ModerationWord & {
  revision: string;
  examples: { id: string; german: string; translation: string; translations: { language: string; text: string }[] }[];
};
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
const statuses: PublicationStatus[] = ["PENDING_REVIEW", "PUBLISHED", "REJECTED"];

export class ModerationError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly wordId?: string;
  constructor(status: number, message: string, code?: string, wordId?: string) {
    super(message); this.name = "ModerationError";
    this.status = status; this.code = code; this.wordId = wordId;
  }
}

function isWord(value: unknown): value is ModerationWord {
  if (!value || typeof value !== "object") return false;
  const word = value as ModerationWord;
  return typeof word.id === "string" && !!word.id && typeof word.german === "string" && !!word.german &&
    ["der", "die", "das", "none"].includes(word.article) &&
    ["singular", "plural", "not_applicable"].includes(word.grammaticalNumber) &&
    typeof word.translation === "string" && (word.level === null || typeof word.level === "string") &&
    (word.lessonNumber === null || (typeof word.lessonNumber === "number" && Number.isFinite(word.lessonNumber))) &&
    (word.createdByUserId === null || typeof word.createdByUserId === "string") &&
    (word.pluralForm == null || typeof word.pluralForm === "string") && (word.notes == null || typeof word.notes === "string") &&
    statuses.includes(word.publicationStatus) && Array.isArray(word.translations) &&
    word.translations.every((row) => row && typeof row.language === "string" && typeof row.text === "string");
}

function isReview(value: unknown): value is ReviewCard {
  if (!isWord(value)) return false;
  const card = value as ReviewCard;
  return typeof card.revision === "string" && /^[a-f0-9]{64}$/.test(card.revision) &&
    Array.isArray(card.examples) && card.examples.every((row) => row && typeof row.id === "string" &&
      typeof row.german === "string" && typeof row.translation === "string" &&
      Array.isArray(row.translations) && row.translations.every((entry) => entry && typeof entry.language === "string" && typeof entry.text === "string"));
}

async function read(response: Response): Promise<unknown> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message :
      Array.isArray(data?.message) ? data.message.filter((item: unknown) => typeof item === "string").join(", ") : "Не удалось выполнить запрос модерации";
    throw new ModerationError(response.status, message, typeof data?.code === "string" ? data.code : undefined,
      typeof data?.wordId === "string" ? data.wordId : undefined);
  }
  return data;
}

function validStatus(status: PublicationStatus) {
  if (!statuses.includes(status)) throw new ModerationError(400, "Неизвестный статус публикации");
}

export class ModerationClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }

  async list(status: PublicationStatus, signal?: AbortSignal): Promise<ModerationWord[]> {
    validStatus(status);
    const data = await read(await this.request(`/moderation/words?status=${status}`, { signal }));
    if (!Array.isArray(data) || !data.every(isWord) || data.some(word => word.publicationStatus !== status) || new Set(data.map(word => word.id)).size !== data.length) throw new ModerationError(502, "Некорректный список модерации");
    return data;
  }

  async detail(id: string, signal?: AbortSignal): Promise<ReviewCard> {
    const data = await read(await this.request(`/moderation/words/${encodeURIComponent(id)}`, { signal }));
    if (!isReview(data) || data.id !== id) throw new ModerationError(502, "Некорректная карточка модерации");
    return data;
  }

  async changeStatus(card: ReviewCard, status: PublicationStatus): Promise<ReviewCard> {
    validStatus(status);
    if (!isReview(card)) throw new ModerationError(400, "Откройте актуальную карточку перед решением");
    const data = await read(await this.request(`/moderation/words/${encodeURIComponent(card.id)}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicationStatus: status, expectedRevision: card.revision }),
    }));
    if (!isReview(data) || data.id !== card.id || data.publicationStatus !== status) {
      throw new ModerationError(502, "Не удалось подтвердить результат модерации. Откройте карточку заново.");
    }
    return data;
  }
}
