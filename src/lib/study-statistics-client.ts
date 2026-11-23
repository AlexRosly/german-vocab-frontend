export const STATISTICS_MODES = ["forward", "reverse", "article", "plural", "spelling", null] as const;
type Mode = typeof STATISTICS_MODES[number];
export type StatisticsCounts = { sessions: number; answers: number; known: number; needsReview: number };
export type StudyActivity = { timeZone: string; activeDays: number; days: (StatisticsCounts & { date: string })[] };
export type StudyStatistics = {
  activity?: StudyActivity;
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
  if (data.activity !== undefined && !validActivity(data.activity, data)) throw new StudyStatisticsError(502, "Некорректный ответ статистики обучения");
  return data;
}

/** Calendar keys stay in the account timezone; display never reparses them in the browser's timezone. */
export function statisticsDates(timeZone: string, from: string, to: string): string[] {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit" });
  const local = (value: string) => {
    const parts = formatter.formatToParts(new Date(value));
    return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
  };
  const cursor = new Date(`${local(from)}T00:00:00Z`), last = local(to), result: string[] = [];
  for (let date = cursor.toISOString().slice(0, 10); date <= last && result.length < 93; date = cursor.toISOString().slice(0, 10)) {
    result.push(date); cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function validActivity(value: unknown, data: StudyStatistics): value is StudyActivity {
  if (!value || typeof value !== "object") return false;
  const activity = value as StudyActivity;
  if (typeof activity.timeZone !== "string" || activity.timeZone.length > 100 || !Number.isSafeInteger(activity.activeDays) || activity.activeDays < 0 || !Array.isArray(activity.days)) return false;
  try {
    const expected = statisticsDates(activity.timeZone, data.from, data.to);
    return activity.days.length === expected.length && activity.days.every((row, i) => row && row.date === expected[i] && counts(row)) &&
      activity.activeDays === activity.days.filter(row => row.sessions > 0).length &&
      fields.every(k => activity.days.reduce((sum, row) => sum + row[k], 0) === data.totals[k]);
  } catch { return false; }
}

export function statisticsDayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}

export function dailyActivityLevel(answers: number, maximum: number): number {
  return answers === 0 ? 0 : Math.max(1, Math.min(3, Math.ceil(3 * answers / Math.max(1, maximum))));
}

export type StudyBookRow = StatisticsCounts & { sourceBook: string | null; lessonNumber: number | null; words: number };
export type StudyBookStatistics = {
  days: number; from: string; to: string; scope: "books" | "lessons"; book: string | null;
  page: number; pageSize: number; totalGroups: number; rows: StudyBookRow[];
};
export type StudyBookSelection = { book: string | null } | null;
const normalizeStatisticsBook = (title: string) => title.normalize("NFC").trim().replace(/\s+/gu, " ");
const statisticsBookKey = (title: string | null) => title === null ? null : normalizeStatisticsBook(title).toLocaleLowerCase("de");
export async function loadStudyBookStatistics(request: Requester, days: number, page: number, selection: StudyBookSelection, signal?: AbortSignal): Promise<StudyBookStatistics> {
  if (![7, 30, 90].includes(days) || !Number.isInteger(page) || page < 1 || page > 100000 ||
      (selection?.book !== undefined && selection.book !== null && (typeof selection.book !== "string" || !normalizeStatisticsBook(selection.book) || [...selection.book].length > 120 || /\p{Cc}/u.test(selection.book)))) {
    throw new StudyStatisticsError(400, "Некорректный запрос статистики книг");
  }
  const query = new URLSearchParams({ days: String(days), page: String(page) });
  if (selection) { if (selection.book === null) query.set("unassigned", "true"); else query.set("book", normalizeStatisticsBook(selection.book)); }
  const response = await request(`/study/statistics/books?${query}`, { cache: "no-store", signal });
  if (response.status === 404 || response.status === 501) throw new StudyStatisticsError(response.status, "Статистика книг пока недоступна");
  if (!response.ok) throw new StudyStatisticsError(response.status, "Не удалось загрузить статистику книг");
  const data = await response.json().catch(() => null) as StudyBookStatistics | null;
  const validBook = (value: unknown): value is string | null => value === null || (typeof value === "string" && !!value && [...value].length <= 120 && normalizeStatisticsBook(value) === value && !/\p{Cc}/u.test(value));
  if (!data || data.days !== days || !validDate(data.from) || !validDate(data.to) || Date.parse(data.to) - Date.parse(data.from) !== days * 86400000 ||
      data.scope !== (selection ? "lessons" : "books") || data.book !== (selection?.book == null ? null : normalizeStatisticsBook(selection.book)) || data.page !== page || data.pageSize !== 10 ||
      !Number.isSafeInteger(data.totalGroups) || data.totalGroups < 0 || !Array.isArray(data.rows) ||
      data.rows.length !== Math.max(0, Math.min(10, data.totalGroups - (page - 1) * 10)) ||
      data.rows.some(row => !row || !counts(row) || row.answers === 0 || !Number.isSafeInteger(row.words) || row.words < 1 || row.words > row.answers ||
        !validBook(row.sourceBook) || (selection && statisticsBookKey(row.sourceBook) !== statisticsBookKey(selection.book)) ||
        (selection ? row.lessonNumber !== null && (!Number.isInteger(row.lessonNumber) || row.lessonNumber < 1 || row.lessonNumber > 10000) : row.lessonNumber !== null)) ||
      new Set(data.rows.map(row => selection ? row.lessonNumber : statisticsBookKey(row.sourceBook))).size !== data.rows.length) {
    throw new StudyStatisticsError(502, "Некорректный ответ статистики книг");
  }
  return data;
}
