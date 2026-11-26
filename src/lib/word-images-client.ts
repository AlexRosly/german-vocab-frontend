export type WordImageInfo = { revision: string; width: number; height: number; bytes: number };
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
export class WordImagesError extends Error { readonly status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
export function readImageInfo(value: unknown): WordImageInfo | null {
  const image = (value as { image?: unknown } | null)?.image;
  if (image === null) return null;
  if (!image || typeof image !== "object") throw new Error("Некорректный ответ изображений");
  const row = image as WordImageInfo;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.revision) || ![row.width, row.height, row.bytes].every(Number.isInteger) || row.width < 1 || row.width > 720 || row.height < 1 || row.height > 720 || row.bytes < 1 || row.bytes > 98304) throw new Error("Некорректный ответ изображений");
  return { revision: row.revision, width: row.width, height: row.height, bytes: row.bytes };
}
export class WordImagesClient {
  private readonly fetch: Fetcher;
  constructor(fetch: Fetcher) { this.fetch = fetch; }
  private path(id: string) { if (!/^[A-Za-z0-9_-]{1,191}$/.test(id)) throw new WordImagesError("Не удалось загрузить или сохранить изображение", 400); return `/words/${encodeURIComponent(id)}/image`; }
  private async checked(response: Response) {
    if (!response.ok) { const data = await response.json().catch(() => null); throw new WordImagesError(typeof data?.message === "string" ? data.message : "Не удалось загрузить или сохранить изображение", response.status); }
    return response;
  }
  async config(signal?: AbortSignal) { const r = await this.fetch("/word-images/config", { cache: "no-store", signal }); if (!r.ok) return false; const data = await r.json(); return data.enabled === true && data.version === 1; }
  async get(id: string, signal?: AbortSignal) { return readImageInfo(await (await this.checked(await this.fetch(this.path(id), { cache: "no-store", signal }))).json()); }
  async blob(id: string, image: WordImageInfo, signal?: AbortSignal) {
    const response = await this.checked(await this.fetch(this.path(id) + "/content?revision=" + encodeURIComponent(image.revision), { cache: "no-store", signal }));
    if (response.headers.get("Content-Type")?.split(";")[0] !== "image/webp") throw new Error("Некорректный ответ изображений");
    const blob = await response.blob(); if (blob.size !== image.bytes || blob.size > 98304) throw new Error("Некорректный ответ изображений"); return blob;
  }
  async save(id: string, revision: string | null, file: File, signal?: AbortSignal) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 4 * 1024 * 1024) throw new WordImagesError("Выберите JPEG, PNG или WebP до 4 МБ", 400);
    const body = new FormData(); body.append("revision", revision ?? ""); body.append("file", file);
    return readImageInfo(await (await this.checked(await this.fetch(this.path(id), { method: "PUT", body, signal }))).json());
  }
  async remove(id: string, revision: string, signal?: AbortSignal) { return readImageInfo(await (await this.checked(await this.fetch(this.path(id), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }), signal }))).json()); }
}
