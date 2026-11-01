type EditableWord = { createdByUserId: string | null; publicationStatus: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" };

export function canEditWord(word: EditableWord, user: { id: string; role: "USER" | "ADMIN" }): boolean {
  return user.role === "ADMIN" || (word.createdByUserId === user.id && word.publicationStatus !== "PUBLISHED");
}

export function displayTranslation(word: { selectedTranslation?: { text: string | null } }): string {
  return word.selectedTranslation?.text ?? "Перевод отсутствует";
}

export function publicationLabel(status: EditableWord["publicationStatus"]): string {
  return { PENDING_REVIEW: "На проверке", PUBLISHED: "Опубликовано", REJECTED: "Отклонено" }[status];
}
