import type { StudyWord } from "./api";

export type HistorySummary = {
  id: string; totalWords: number; knownCount: number; needsReviewCount: number;
  startedAt: string; completedAt: string;
};
export type HistoryPage = { sessions: HistorySummary[]; nextCursor: string | null };
type HistoryWord = Pick<StudyWord, "id" | "german" | "article" | "grammaticalNumber" | "selectedTranslation">;
export type HistoryDetail = HistorySummary & {
  userId: string;
  words: { id: string; sessionId: string; wordId: string; answer: "KNOWN" | "NEEDS_REVIEW"; answeredAt: string; word: HistoryWord }[];
};
type Requester = (path: string, init?: RequestInit) => Promise<Response>;

export class HistoryError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = "HistoryError"; this.status = status; }
}
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function summary(value: unknown): value is HistorySummary {
  if (!value || typeof value !== "object") return false;
  const row = value as HistorySummary;
  return typeof row.id === "string" && !!row.id && count(row.totalWords) && count(row.knownCount) && count(row.needsReviewCount) &&
    row.knownCount + row.needsReviewCount === row.totalWords && validDate(row.startedAt) && validDate(row.completedAt);
}
function cursor(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(value); }
async function read(response: Response): Promise<unknown> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : "Не удалось загрузить историю тренировок";
    throw new HistoryError(response.status, message);
  }
  return data;
}

export class StudyHistoryClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }

  async page(after?: string, signal?: AbortSignal, limit = 20): Promise<HistoryPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (after !== undefined && !cursor(after))) throw new HistoryError(400, "Некорректный запрос истории");
    const params = new URLSearchParams({ limit: String(limit) });
    if (after) params.set("cursor", after);
    const data = await read(await this.request(`/study/history?${params}`, { signal, cache: "no-store" }));
    if (!data || typeof data !== "object") throw new HistoryError(502, "Некорректный ответ истории тренировок");
    const page = data as HistoryPage;
    if (!Array.isArray(page.sessions) || page.sessions.length > limit || !page.sessions.every(summary) ||
      new Set(page.sessions.map((row) => row.id)).size !== page.sessions.length ||
      (page.nextCursor !== null && (!cursor(page.nextCursor) || page.nextCursor === after || !page.sessions.length))) {
      throw new HistoryError(502, "Некорректный ответ истории тренировок");
    }
    return page;
  }

  async detail(sessionId: string, userId: string, language: string, signal?: AbortSignal): Promise<HistoryDetail> {
    if (!sessionId || !userId) throw new HistoryError(400, "Некорректный запрос истории");
    const data = await read(await this.request(`/study/history/${encodeURIComponent(sessionId)}`, { signal, cache: "no-store" }));
    if (!summary(data)) throw new HistoryError(502, "Некорректный ответ истории тренировок");
    const detail = data as HistoryDetail;
    if (detail.id !== sessionId || detail.userId !== userId || !Array.isArray(detail.words) || detail.words.length > detail.totalWords ||
      new Set(detail.words.map((row) => row?.wordId)).size !== detail.words.length || !detail.words.every((row) =>
        row && typeof row.id === "string" && row.sessionId === sessionId && typeof row.wordId === "string" && !!row.wordId &&
        ["KNOWN", "NEEDS_REVIEW"].includes(row.answer) && validDate(row.answeredAt) && row.word && row.word.id === row.wordId &&
        typeof row.word.german === "string" && !!row.word.german && ["der", "die", "das", "none"].includes(row.word.article) &&
        ["singular", "plural", "not_applicable"].includes(row.word.grammaticalNumber) && row.word.selectedTranslation?.language === language &&
        (row.word.selectedTranslation.text === null || typeof row.word.selectedTranslation.text === "string")) ||
      detail.words.filter((row) => row.answer === "KNOWN").length > detail.knownCount ||
      detail.words.filter((row) => row.answer === "NEEDS_REVIEW").length > detail.needsReviewCount) {
      throw new HistoryError(502, "Некорректный ответ истории тренировок");
    }
    return detail;
  }
}
