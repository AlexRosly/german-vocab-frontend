export type DailyNewWordsPlan = { goal: number; done: number; remaining: number; timeZone: string; studyDate: string };
export function dailyNewWordsPlan(value: unknown): DailyNewWordsPlan | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const goal = row.newWordsDailyGoal, done = row.newWordsStudiedToday;
  if (typeof goal !== "number" || !Number.isInteger(goal) || goal < 1 || goal > 500 || typeof done !== "number" || !Number.isInteger(done) || done < 0 ||
    typeof row.studyDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(row.studyDate) || typeof row.timeZone !== "string") return null;
  try { new Intl.DateTimeFormat("en", { timeZone: row.timeZone }); } catch { return null; }
  return { goal, done, remaining: Math.max(0, goal - done), studyDate: row.studyDate, timeZone: row.timeZone };
}
export function plannedNewWords<T>(words: readonly T[], sessionLimit: number, plan: DailyNewWordsPlan): T[] {
  const size = sessionLimit === 0 ? words.length : sessionLimit;
  if (!Number.isInteger(size) || size < 0) return [];
  return words.slice(0, Math.min(size, plan.remaining));
}
