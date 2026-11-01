import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { MESSAGES, UI_LANGUAGES, UI_LOCALES, counted, createI18n, formatDate, safeErrorMessage, translate, uiLanguage } from "../src/lib/i18n.ts";
import { displayTranslation } from "../src/lib/word-view.ts";

test("every UI message has all locales and exactly matching placeholders", () => {
  const parameters = (text) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
  for (const [key, entry] of Object.entries(MESSAGES)) {
    for (const language of ["de", "en", "uk"]) {
      assert.equal(typeof entry[language], "string", `${language}: ${key}`);
      assert.ok(entry[language].trim(), `${language}: ${key}`);
      assert.deepEqual(parameters(entry[language]), parameters(key), `${language}: ${key}`);
      if (language !== "uk") assert.doesNotMatch(entry[language], /[А-Яа-яЁёІіЇїЄє]/u, `${language}: ${key}`);
    }
  }
  assert.deepEqual(UI_LANGUAGES.map((entry) => entry.code).sort(), ["de", "en", "ru", "uk"]);
});

test("component text and accessible labels cannot silently bypass localization", () => {
  const dir = new URL("../src/components/", import.meta.url);
  const violations = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx"))) {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, dir), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && /^(?:t|i18n\.t)$/.test(node.expression.getText(source)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        if (!Object.hasOwn(MESSAGES, node.arguments[0].text)) violations.push(`${file}: missing catalog key ${node.arguments[0].text}`);
      }
      if (ts.isJsxText(node) && /[А-Яа-яЁёІіЇїЄє]/u.test(node.text)) violations.push(`${file}: ${node.text.trim()}`);
      if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && /[А-Яа-яЁёІіЇїЄє]/u.test(node.initializer.text)) violations.push(`${file}: ${node.initializer.text}`);
      if (ts.isJsxAttribute(node) && ["key", "value", "id"].includes(node.name.getText(source)) && node.initializer && ts.isJsxExpression(node.initializer)) {
        const expression = node.initializer.expression;
        if (expression && ts.isCallExpression(expression) && /^(?:t|errorText)$/.test(expression.expression.getText(source))) violations.push(`${file}: localized technical identifier ${node.name.getText(source)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(violations, []);
});

test("stored messages and their counters retranslate when the interface changes", () => {
  const status = "Редактирование: Gabelstapler";
  assert.equal(translate("de", status), "Bearbeiten: Gabelstapler");
  assert.equal(translate("en", status), "Editing: Gabelstapler");
  assert.equal(translate("uk", status), "Редагування: Gabelstapler");
  assert.equal(translate("ru", status), status);
  assert.equal(translate("de", "Начинаем тренировку: 1 новых слов."), "Training startet: 1 Wort.");
});

test("interpolation preserves literal user content and replacement metacharacters", () => {
  const text = '<b>Baum $& ${value}</b>';
  assert.equal(translate("de", "Прослушать слово {0}", { 0: text }), `Wort ${text} anhören`);
  assert.equal(translate("en", `Редактирование: ${text}`), `Editing: ${text}`);
});

test("word, card and day counts use the locale's plural rules", () => {
  const counts = [0, 1, 2, 5, 11, 21, 22, 25];
  assert.deepEqual(counts.map((n) => counted("ru", n)), ["0 слов", "1 слово", "2 слова", "5 слов", "11 слов", "21 слово", "22 слова", "25 слов"]);
  assert.deepEqual(counts.map((n) => counted("uk", n)), ["0 слів", "1 слово", "2 слова", "5 слів", "11 слів", "21 слово", "22 слова", "25 слів"]);
  assert.equal(counted("de", 1, "day"), "1 Tag"); assert.equal(counted("de", 2, "day"), "2 Tage");
  assert.equal(counted("en", 1, "card"), "1 card"); assert.equal(counted("en", 2, "card"), "2 cards");
});

test("date formatting follows the UI locale without changing stored timestamps", () => {
  const value = "2026-11-01T14:06:00.000Z";
  for (const language of UI_LANGUAGES.map((entry) => entry.code)) {
    assert.equal(formatDate(language, value), new Intl.DateTimeFormat(UI_LOCALES[language], { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)));
  }
  assert.equal(formatDate("de", "invalid"), "Keine Daten");
});

test("server and validation errors are translated without exposing unknown server details", () => {
  assert.equal(createI18n("de").errorText(new Error("Неверный email или пароль")), "E-Mail-Adresse oder Passwort falsch");
  assert.equal(createI18n("en").errorText({ status: 429, message: "Too Many Requests" }), "Too many requests. Wait and try again.");
  assert.equal(createI18n("uk").errorText(new Error("german must be longer than or equal to 1 characters")), "Перевір введені дані.");
  assert.equal(safeErrorMessage(new Error("SQL credentials and internal stack details")), "Не удалось выполнить запрос. Повторите попытку.");
  assert.equal(createI18n("en").errorText("Не удалось сохранить: Неверный email или пароль"), "Could not save: Incorrect email or password");
});

test("interface translation never translates word or example content or substitutes Russian", () => {
  assert.equal(displayTranslation({ selectedTranslation: { text: "Повторить" } }, translate("de", "Перевод отсутствует")), "Повторить");
  assert.equal(displayTranslation({ translation: "русский текст", selectedTranslation: { text: null } }, translate("de", "Перевод отсутствует")), "Keine Übersetzung");
});

test("invalid saved locales safely use Russian without accepting stored account data", () => {
  for (const value of [null, "", "fr", '{"role":"ADMIN"}', { language: "de" }]) assert.equal(uiLanguage(value), "ru");
  assert.equal(uiLanguage("de"), "de");
});
