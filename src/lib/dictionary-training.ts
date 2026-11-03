type Answer = { wordId: string; answer: "KNOWN" | "NEEDS_REVIEW" };
type Fetcher = (path: string, init: RequestInit) => Promise<Response>;

// Preserve the user's filtered order and personal card content from their dictionary.
export function eligibleTrainingWords<T extends { id: string }>(filtered: readonly T[], eligible: readonly { id: string }[]): T[] {
  const ids = new Set(eligible.map(word => word.id));
  return filtered.filter(word => ids.has(word.id));
}

// Each server session accepts at most 500 answers. A retry reuses every chunk's key/body.
export async function saveTrainingAnswers(fetcher: Fetcher, answers: readonly Answer[], requestKey: string): Promise<void> {
  if (!answers.length || new Set(answers.map(row => row.wordId)).size !== answers.length) throw new Error("Не удалось сохранить результаты тренировки");
  for (let offset = 0; offset < answers.length; offset += 500) {
    const words = answers.slice(offset, offset + 500);
    const response = await fetcher("/study/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `${requestKey}:${offset / 500}` },
      body: JSON.stringify({ totalWords: words.length, words }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(Array.isArray(data?.message) ? data.message.join(", ") : data?.message ?? "Не удалось сохранить результаты тренировки");
    }
    await response.json();
  }
}
