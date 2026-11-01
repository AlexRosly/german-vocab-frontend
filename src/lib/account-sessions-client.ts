export type AccountSession = { id: string; createdAt: string; updatedAt: string; refreshExpiresAt: string; current: boolean };
export type AccountSessions = { sessions: AccountSession[]; hasMore: boolean };
type Requester = (path: string, init?: RequestInit) => Promise<Response>;
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export class AccountSessionsClient {
  private readonly request: Requester;
  constructor(request: Requester) { this.request = request; }
  async list(signal?: AbortSignal): Promise<AccountSessions> {
    const response = await this.request("/auth/sessions", { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить активные входы");
    const data = await response.json().catch(() => null);
    if (!data || typeof data.hasMore !== "boolean" || !Array.isArray(data.sessions) || data.sessions.length < 1 || data.sessions.length > 101 ||
      data.sessions.filter((row: AccountSession) => row?.current === true).length !== 1 ||
      new Set(data.sessions.map((row: AccountSession) => row?.id)).size !== data.sessions.length ||
      !data.sessions.every((row: AccountSession) => row && typeof row.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(row.id) &&
        typeof row.current === "boolean" && date(row.createdAt) && date(row.updatedAt) && date(row.refreshExpiresAt))) throw new Error("Некорректный ответ активных входов");
    return { hasMore: data.hasMore, sessions: data.sessions.map((row: AccountSession) => ({ id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, refreshExpiresAt: row.refreshExpiresAt, current: row.current })) };
  }
  async revoke(id: string, signal?: AbortSignal): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Некорректный идентификатор входа");
    const response = await this.request(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE", signal });
    if (response.status !== 204) throw new Error("Не удалось завершить вход");
  }
}
