import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditWord, displayTranslation, publicationLabel } from "../src/lib/word-view.ts";

test("authors can edit their own pending/rejected cards, not published or foreign cards", () => {
  const user = { id: "a", role: "USER" };
  assert.equal(canEditWord({ createdByUserId: "a", publicationStatus: "PENDING_REVIEW" }, user), true);
  assert.equal(canEditWord({ createdByUserId: "a", publicationStatus: "REJECTED" }, user), true);
  assert.equal(canEditWord({ createdByUserId: "a", publicationStatus: "PUBLISHED" }, user), false);
  assert.equal(canEditWord({ createdByUserId: "b", publicationStatus: "PENDING_REVIEW" }, user), false);
});

test("administrators can edit a shared published card", () => {
  assert.equal(canEditWord({ createdByUserId: null, publicationStatus: "PUBLISHED" }, { id: "admin", role: "ADMIN" }), true);
});

test("the selected translation is displayed without silently substituting Russian", () => {
  assert.equal(displayTranslation({ translation: "стол", selectedTranslation: { text: "table" } }), "table");
  assert.equal(displayTranslation({ translation: "стол", selectedTranslation: { text: null } }), "Перевод отсутствует");
});

test("publication statuses have readable labels", () => {
  assert.equal(publicationLabel("PENDING_REVIEW"), "На проверке");
  assert.equal(publicationLabel("PUBLISHED"), "Опубликовано");
  assert.equal(publicationLabel("REJECTED"), "Отклонено");
});
