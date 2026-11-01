export type StudySettings = { timeZone: string; dailyGoal: number };
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
export function validSettings(value: unknown): value is StudySettings {
  if (!value || typeof value !== "object") return false;
  const row = value as StudySettings;
  if (typeof row.timeZone !== "string" || row.timeZone.length > 100 || !/^[A-Za-z][A-Za-z0-9_+./-]*$/.test(row.timeZone) ||
    !Number.isInteger(row.dailyGoal) || row.dailyGoal < 1 || row.dailyGoal > 500) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: row.timeZone }); return true; } catch { return false; }
}
export class StudySettingsClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }
  private async read(response: Response): Promise<StudySettings> {
    if (!response.ok) throw new Error("Не удалось сохранить или загрузить настройки обучения");
    const value: unknown = await response.json().catch(() => null);
    if (!validSettings(value)) throw new Error("Некорректный ответ настроек обучения");
    return { timeZone: value.timeZone, dailyGoal: value.dailyGoal };
  }
  async get(signal?: AbortSignal): Promise<StudySettings> {
    return this.read(await this.request("/users/me/preferences", { cache: "no-store", signal }));
  }
  async save(settings: StudySettings, signal?: AbortSignal): Promise<StudySettings> {
    if (!validSettings(settings)) throw new Error("Проверьте часовой пояс и цель от 1 до 500");
    const result = await this.read(await this.request("/users/me/preferences", { method: "PATCH", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeZone: settings.timeZone, dailyGoal: settings.dailyGoal }) }));
    const canonical = new Intl.DateTimeFormat("en", { timeZone: settings.timeZone }).resolvedOptions().timeZone;
    if (new Intl.DateTimeFormat("en", { timeZone: result.timeZone }).resolvedOptions().timeZone !== canonical || result.dailyGoal !== settings.dailyGoal) {
      throw new Error("Некорректный ответ настроек обучения");
    }
    return result;
  }
}
