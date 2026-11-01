import { ApiClient } from "./api-client";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export const AUTH_MUTATION_EVENT = "wortkarten-auth-mutation";
export const apiClient = new ApiClient({
  baseUrl: API_URL,
  authLock: async <T>(work: () => Promise<T>): Promise<T> => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request("wortkarten-auth", work);
    }
    return work();
  },
  onAuthMutation: () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_MUTATION_EVENT));
  },
});

export const apiFetch = (path: string, init?: RequestInit): Promise<Response> => apiClient.request(path, init);

export type StudyWord = {
  id: string;
  german: string;
  article: "der" | "das" | "die" | "none";
  grammaticalNumber: "singular" | "plural" | "not_applicable";
  translation: string;
  translations: { language: string; text: string }[];
  selectedTranslation: { language: string; text: string | null };
  publicationStatus: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
  createdByUserId: string | null;
  level: string | null;
  lessonNumber: number | null;
  pluralForm?: string | null;
  notes?: string | null;
};

export type NewWordsResponse = {
  count: number;
  words: StudyWord[];
};

export type DueWordsResponse = {
  dueCount: number;
  words: StudyWord[];
};

export async function fetchDueWords(): Promise<DueWordsResponse> {
  const response = await apiFetch("/study/due", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить слова для повторения");
  }

  return response.json();
}

export async function fetchNewWords(): Promise<NewWordsResponse> {
  const response = await apiFetch("/study/new", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить новые слова");
  }

  return response.json();
}
