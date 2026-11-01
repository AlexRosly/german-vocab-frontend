import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyExample, examplePayload, initialExamples, translationDraft, translationPatch } from "../src/lib/card-draft.ts";

test("a German-only example has no invented Russian translation", () => {
  assert.deepEqual(examplePayload({ ...emptyExample("uk"), german: "  Ein Baum. " }), { german: "Ein Baum.", translations: [] });
});
test("empty rows are ignored, but translations without German text are rejected", () => {
  assert.deepEqual(initialExamples([emptyExample("en")]), []);
  assert.throws(() => initialExamples([{ ...emptyExample("en"), translations: { en: "A tree." } }]), /немецкое/);
});
test("all language drafts survive selection changes and blank values explicitly remove only their language", () => {
  const values = translationDraft([{ language: "ru", text: "дерево" }, { language: "en", text: "tree" }]);
  values.uk = " дерево "; values.ru = " ";
  assert.deepEqual(translationPatch(values), [{ language: "ru", text: null }, { language: "en", text: "tree" }, { language: "uk", text: "дерево" }]);
});
test("initial examples are submitted together and normalize each translation without changing German meaning", () => {
  assert.deepEqual(initialExamples([{ german: "  Schön. ", language: "en", translations: { en: " Nice. ", uk: " Гарно. " } }]),
    [{ german: "Schön.", translations: [{ language: "en", text: "Nice." }, { language: "uk", text: "Гарно." }] }]);
});
