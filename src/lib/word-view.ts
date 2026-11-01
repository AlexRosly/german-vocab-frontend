type EditableWord = { createdByUserId: string | null; publicationStatus: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" };

export function canEditWord(word: EditableWord, user: { id: string; role: "USER" | "ADMIN" }): boolean {
  return user.role === "ADMIN" || (word.createdByUserId === user.id && word.publicationStatus !== "PUBLISHED");
}

export function displayTranslation(word: { selectedTranslation?: { text: string | null } }, missing = "Перевод отсутствует"): string {
  return word.selectedTranslation?.text ?? missing;
}

export function publicationLabel(status: EditableWord["publicationStatus"]): string {
  return { PENDING_REVIEW: "На проверке", PUBLISHED: "Опубликовано", REJECTED: "Отклонено" }[status];
}
