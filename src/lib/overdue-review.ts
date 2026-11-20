export type ReviewSchedule = { id: string; progress?: { nextReviewAt?: unknown } | null };

// Calendar days belong to the account timezone, never the device's timezone.
export function reviewDay(now: Date, timeZone?: string): string | null {
  if (!timeZone || !Number.isFinite(now.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone, calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (key: string) => parts.find(value => value.type === key)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch { return null; }
}

export function overdueReviewWords<T extends { id: string }>(filtered: readonly T[], due: readonly ReviewSchedule[], timeZone?: string, now = new Date()): T[] {
  const today = reviewDay(now, timeZone);
  if (!today) return [];
  const dates = new Map<string, number>();
  for (const row of due) {
    const raw = row.progress?.nextReviewAt;
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u.test(raw)) continue;
    const date = new Date(raw), timestamp = date.getTime(), day = reviewDay(date, timeZone);
    if (!day || !Number.isFinite(timestamp) || timestamp > now.getTime() || day >= today) continue;
    if (!dates.has(row.id) || dates.get(row.id)! > timestamp) dates.set(row.id, timestamp);
  }
  // Keep the current personal card, not the shared representation in /study/due.
  const unique = new Map(filtered.filter(row => dates.has(row.id)).map(row => [row.id, row]));
  return [...unique.values()].sort((a, b) => dates.get(a.id)! - dates.get(b.id)! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
