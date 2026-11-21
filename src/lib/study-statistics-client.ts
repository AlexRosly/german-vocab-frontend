export const STATISTICS_MODES = ["forward", "reverse", "article", "plural", "spelling", null] as const;
type Mode = typeof STATISTICS_MODES[number];
export type StatisticsCounts = { sessions: number; answers: number; known: number; needsReview: number };
export type StudyStatistics = {
  days: number; from: string; to: string; totals: StatisticsCounts;
  byMode: (StatisticsCounts & { mode: Mode })[];
};
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
const fields = ["sessions", "answers", "known", "needsReview"] as const;
const counts = (value: unknown): value is StatisticsCounts => {
  if (!value || typeof value !== "object") return false;
  const row = value as StatisticsCounts;
  return fields.every(k => Number.isSafeInteger(row[k]) && row[k] >= 0) && row.known + row.needsReview === row.answers &&
    (row.sessions === 0 ? row.answers === 0 : row.answers >= row.sessions);
};
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export class StudyStatisticsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = "StudyStatisticsError"; this.status = status; }
}
export async function loadStudyStatistics(request: Requester, days: number, signal?: AbortSignal): Promise<StudyStatistics> {
  if (![7, 30, 90].includes(days)) throw new StudyStatisticsError(400, "Некорректный период статистики");
  const response = await request(`/study/statistics?days=${days}`, { cache: "no-store", signal });
  if (response.status === 404 || response.status === 501) throw new StudyStatisticsError(response.status, "Статистика пока недоступна");
  if (!response.ok) throw new StudyStatisticsError(response.status, "Не удалось загрузить статистику обучения");
  const data = await response.json().catch(() => null) as StudyStatistics | null;
  if (!data || data.days !== days || !validDate(data.from) || !validDate(data.to) ||
      Date.parse(data.to) - Date.parse(data.from) !== days * 86400000 || !counts(data.totals) || !Array.isArray(data.byMode) ||
      data.byMode.length !== STATISTICS_MODES.length || data.byMode.some((row, i) => !row || row.mode !== STATISTICS_MODES[i] || !counts(row)) ||
      fields.some(k => data.byMode.reduce((sum, row) => sum + row[k], 0) !== data.totals[k])) {
    throw new StudyStatisticsError(502, "Некорректный ответ статистики обучения");
  }
  return data;
}
