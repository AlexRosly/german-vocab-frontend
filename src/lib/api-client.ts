const INTERFACE_LANGUAGE_CODES = ["ru", "de", "en", "uk"];
export const TRANSLATION_LANGUAGE_CODES = ["ru", "de", "en", "uk", "pl", "tr", "ar", "fr", "es", "it", "pt"];

export type AuthUser = {
  id: string;
  email: string | null;
  emailVerified: string | null;
  role: "USER" | "ADMIN";
  interfaceLanguage: string;
  translationLanguage: string;
};

export type AuthSnapshot = { ready: boolean; user: AuthUser | null };
export const INITIAL_AUTH: AuthSnapshot = { ready: false, user: null };
type AuthResponse = { accessToken: string; user: AuthUser };
type ClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  authLock?: <T>(work: () => Promise<T>) => Promise<T>;
  onAuthMutation?: () => void;
};

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

class SessionChangedError extends ApiError {
  constructor() { super(401, "Сессия изменилась. Повторите действие после входа."); }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly authLock: ClientOptions["authLock"];
  private readonly onAuthMutation: ClientOptions["onAuthMutation"];
  private accessToken: string | null = null;
  private snapshot: AuthSnapshot = INITIAL_AUTH;
  private generation = 0;
  private preferencesVersion = 0;
  private preferencesQueue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private authQueue: Promise<void> = Promise.resolve();
  private refreshPromise: Promise<AuthUser | null> | null = null;
  private logoutPromise: Promise<void> | null = null;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.authLock = options.authLock;
    this.onAuthMutation = options.onAuthMutation;
  }

  getSnapshot = (): AuthSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  invalidateSession(): void {
    this.generation += 1;
    this.accessToken = null;
    this.publish(null);
  }

  restoreSession(): Promise<AuthUser | null> {
    if (this.accessToken && this.snapshot.user) return Promise.resolve(this.snapshot.user);
    return this.refreshSession();
  }

  signIn(email: string, password: string): Promise<AuthUser> {
    return this.authenticate("/auth/login", email, password);
  }

  register(email: string, password: string): Promise<AuthUser> {
    return this.authenticate("/auth/register", email, password);
  }

  updateTranslationLanguage(language: string): Promise<void> {
    return this.updateLanguage("translationLanguage", language);
  }

  updateInterfaceLanguage(language: string): Promise<void> {
    return this.updateLanguage("interfaceLanguage", language);
  }

  private updateLanguage(field: "interfaceLanguage" | "translationLanguage", language: string): Promise<void> {
    if (!(field === "interfaceLanguage" ? INTERFACE_LANGUAGE_CODES : TRANSLATION_LANGUAGE_CODES).includes(language)) return Promise.reject(new ApiError(400, "Проверьте введённые данные."));
    const generation = this.generation;
    const work = this.preferencesQueue.then(async () => {
      this.checkGeneration(generation);
      const response = await this.request("/users/me/preferences", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: language }),
      });
      if (!response.ok) throw await this.errorFrom(response);
      const value: unknown = await response.json();
      this.checkGeneration(generation);
      if (!value || typeof value !== "object" || !("interfaceLanguage" in value) || !("translationLanguage" in value) ||
        typeof value.interfaceLanguage !== "string" || !INTERFACE_LANGUAGE_CODES.includes(value.interfaceLanguage) ||
        typeof value.translationLanguage !== "string" || !TRANSLATION_LANGUAGE_CODES.includes(value.translationLanguage) || value[field] !== language) {
        throw new ApiError(502, "Некорректный ответ языковых настроек");
      }
      if (!this.snapshot.user) throw new SessionChangedError();
      this.preferencesVersion += 1;
      // One preference save cannot replace identity, role or the other language.
      this.publish({ ...this.snapshot.user, [field]: language });
    });
    this.preferencesQueue = work.then(() => undefined, () => undefined);
    return work;
  }

  logout(): Promise<void> {
    if (this.logoutPromise) return this.logoutPromise;
    const generation = ++this.generation;
    const work = this.enqueueAuth(async () => {
      const response = await this.raw("/auth/logout", { method: "POST" });
      if (!response.ok) throw await this.errorFrom(response);
      this.onAuthMutation?.();
      if (this.generation === generation) {
        this.accessToken = null;
        this.publish(null);
      }
    });
    this.logoutPromise = work;
    void work.finally(() => { if (this.logoutPromise === work) this.logoutPromise = null; }).catch(() => {});
    return work;
  }

  logoutAll(): Promise<void> {
    if (this.logoutPromise) return this.logoutPromise;
    const owner = this.snapshot.user?.id;
    if (!owner) return Promise.reject(new SessionChangedError());
    const generation = ++this.generation;
    const work = this.enqueueAuth(async () => {
      this.checkGeneration(generation);
      const send = () => this.raw("/auth/logout-all", { method: "POST", headers: { Authorization: `Bearer ${this.accessToken ?? ""}` } });
      let response = await send();
      if (response.status === 401) {
        // Refresh inside the same auth lock; never queue another lock recursively.
        const refresh = await this.raw("/auth/refresh", { method: "POST" });
        this.checkGeneration(generation);
        if (!refresh.ok) {
          if (refresh.status === 401) { this.accessToken = null; this.publish(null); this.onAuthMutation?.(); }
          throw await this.errorFrom(refresh);
        }
        const result = await this.readAuth(refresh);
        this.checkGeneration(generation);
        if (result.user.id !== owner) { this.accessToken = null; this.publish(null); this.onAuthMutation?.(); throw new SessionChangedError(); }
        this.accessToken = result.accessToken;
        response = await send();
      }
      if (response.status !== 204) {
        if (response.status === 401 && this.generation === generation) { this.accessToken = null; this.publish(null); this.onAuthMutation?.(); }
        throw await this.errorFrom(response);
      }
      this.onAuthMutation?.();
      if (this.generation === generation) { this.accessToken = null; this.publish(null); }
    });
    this.logoutPromise = work;
    void work.finally(() => { if (this.logoutPromise === work) this.logoutPromise = null; }).catch(() => {});
    return work;
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    this.url(path);
    if (this.logoutPromise) throw new SessionChangedError();
    const generation = this.generation;
    if (!this.accessToken) await this.refreshSession();
    this.checkGeneration(generation);
    if (!this.accessToken) throw new ApiError(401, "Войдите в аккаунт");
    const usedToken = this.accessToken;
    let response = await this.authorized(path, init, usedToken);
    this.checkGeneration(generation);
    if (response.status === 401) {
      // A slower 401 may arrive after another request has already refreshed the token.
      if (this.accessToken === usedToken) await this.refreshSession();
      this.checkGeneration(generation);
      if (!this.accessToken) throw new ApiError(401, "Сессия завершена. Войдите снова.");
      response = await this.authorized(path, init, this.accessToken);
      this.checkGeneration(generation);
      if (response.status === 401) {
        this.invalidateSession();
        throw new ApiError(401, "Сессия завершена. Войдите снова.");
      }
    }
    return response;
  }

  private async authenticate(path: string, email: string, password: string): Promise<AuthUser> {
    const generation = ++this.generation;
    this.accessToken = null;
    this.publish(null);
    return this.enqueueAuth(async () => {
      this.checkGeneration(generation);
      const response = await this.raw(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) throw await this.errorFrom(response);
      this.onAuthMutation?.();
      const result = await this.readAuth(response);
      this.checkGeneration(generation);
      this.acceptAuth(result);
      return result.user;
    });
  }

  private refreshSession(): Promise<AuthUser | null> {
    if (this.refreshPromise) return this.refreshPromise;
    const generation = this.generation;
    const work = this.enqueueAuth(async () => {
      if (this.generation !== generation) return null;
      const preferencesVersion = this.preferencesVersion;
      const response = await this.raw("/auth/refresh", { method: "POST" });
      if (this.generation !== generation) return null;
      if (response.status === 401) {
        this.invalidateSession();
        return null;
      }
      if (!response.ok) throw await this.errorFrom(response);
      const result = await this.readAuth(response);
      if (this.generation !== generation) return null;
      if (this.preferencesVersion !== preferencesVersion && this.snapshot.user?.id === result.user.id) {
        result.user = { ...result.user, interfaceLanguage: this.snapshot.user.interfaceLanguage,
          translationLanguage: this.snapshot.user.translationLanguage };
      }
      if (this.snapshot.user && this.snapshot.user.id !== result.user.id) this.generation += 1;
      this.acceptAuth(result);
      return result.user;
    });
    this.refreshPromise = work;
    void work.finally(() => { if (this.refreshPromise === work) this.refreshPromise = null; }).catch(() => {});
    return work;
  }

  private acceptAuth(result: AuthResponse): void {
    this.accessToken = result.accessToken;
    this.publish(result.user);
  }

  private publish(user: AuthUser | null): void {
    this.snapshot = { ready: true, user };
    this.listeners.forEach((listener) => listener());
  }

  private checkGeneration(generation: number): void {
    if (this.generation !== generation) throw new SessionChangedError();
  }

  private enqueueAuth<T>(work: () => Promise<T>): Promise<T> {
    const next = this.authQueue.then(() => this.authLock ? this.authLock(work) : work());
    this.authQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private url(path: string): string {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("API path must be relative");
    return this.baseUrl + path;
  }

  private async raw(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(this.url(path), { ...init, credentials: "include", cache: "no-store" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiError(0, "Не удалось подключиться к серверу. Повторите попытку.");
    }
  }

  private authorized(path: string, init: RequestInit, token: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return this.raw(path, { ...init, headers });
  }

  private async readAuth(response: Response): Promise<AuthResponse> {
    const result: unknown = await response.json();
    if (!result || typeof result !== "object") throw new ApiError(502, "Некорректный ответ авторизации");
    const value = result as Partial<AuthResponse>;
    if (typeof value.accessToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.accessToken) ||
      !value.user || typeof value.user.id !== "string" || !value.user.id ||
      (value.user.email !== null && typeof value.user.email !== "string") ||
      (value.user.emailVerified !== null && typeof value.user.emailVerified !== "string") ||
      typeof value.user.interfaceLanguage !== "string" || typeof value.user.translationLanguage !== "string" ||
      (value.user.role !== "USER" && value.user.role !== "ADMIN")) {
      throw new ApiError(502, "Некорректный ответ авторизации");
    }
    return value as AuthResponse;
  }

  private async errorFrom(response: Response): Promise<ApiError> {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.filter((item: unknown) => typeof item === "string").join(", ") : body?.message;
    return new ApiError(response.status, typeof message === "string" && message ? message : "Не удалось выполнить запрос");
  }
}
