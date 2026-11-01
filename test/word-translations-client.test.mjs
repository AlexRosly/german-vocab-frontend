import { test } from "node:test";
import assert from "node:assert/strict";
import { TranslationError, WordTranslationsClient } from "../src/lib/word-translations-client.ts";

test("the editor uses the server catalog and rejects incomplete or ambiguous languages", async () => {
  const languages = [{ code: "ru", label: "Русский" }, { code: "en", label: "English" }];
  const client = new WordTranslationsClient(async (path) => {
    assert.equal(path, "/languages"); return Response.json({ translationLanguages: languages });
  });
  assert.deepEqual(await client.languages(), languages);
  for (const value of [null, {}, { translationLanguages: [] }, { translationLanguages: [languages[0], languages[0]] }, { translationLanguages: [{ code: "en" }] }]) {
    const broken = new WordTranslationsClient(async () => Response.json(value));
    await assert.rejects(broken.languages(), (error) => error.status === 502);
  }
});

test("a missing translation remains null without a Russian fallback or an implicit write", async () => {
  let calls = 0;
  const client = new WordTranslationsClient(async (path, init) => {
    calls++; assert.equal(path, "/words/word-a/translations/en"); assert.equal(init.method, undefined);
    return Response.json({ wordId: "word-a", language: "en", text: null, translation: "дерево" });
  });
  assert.equal((await client.get("word-a", "en")).text, null); assert.equal(calls, 1);
});

test("saving targets one translation and sends only normalized text", async () => {
  let calls = 0;
  const client = new WordTranslationsClient(async (path, init) => {
    calls++; assert.equal(path, "/words/word-a/translations/en"); assert.equal(init.method, "PUT");
    assert.equal(new Headers(init.headers).get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(init.body), { text: "café" });
    return Response.json({ wordId: "word-a", language: "en", text: "café" });
  });
  assert.deepEqual(await client.save("word-a", "en", "  cafe\u0301  "), { wordId: "word-a", language: "en", text: "café" });
  assert.equal(calls, 1);
});

test("the length limit counts Unicode characters rather than UTF-16 units", async () => {
  const text = "🌳".repeat(1000);
  const client = new WordTranslationsClient(async (_path, init) => {
    assert.equal(JSON.parse(init.body).text, text);
    return Response.json({ wordId: "word-a", language: "en", text });
  });
  assert.equal((await client.save("word-a", "en", text)).text, text);
});

test("empty and oversized translations are rejected before a request", async () => {
  let calls = 0;
  const client = new WordTranslationsClient(async () => { calls++; throw new Error("Must not send"); });
  for (const text of ["", " \n ", "a".repeat(1001), "🌳".repeat(1001)]) {
    await assert.rejects(client.save("word-a", "en", text), (error) => error.status === 400);
  }
  await assert.rejects(client.get("", "en")); await assert.rejects(client.get("word-a", ""));
  assert.equal(calls, 0);
});

test("mismatched or malformed responses cannot confirm another card or language", async () => {
  for (const value of [null, {}, { wordId: "other", language: "en", text: "tree" }, { wordId: "word-a", language: "ru", text: "tree" }, { wordId: "word-a", language: "en", text: 7 }]) {
    const client = new WordTranslationsClient(async () => Response.json(value));
    await assert.rejects(client.get("word-a", "en"), (error) => error.status === 502);
    await assert.rejects(client.save("word-a", "en", "tree"), (error) => error.status === 502);
  }
  const client = new WordTranslationsClient(async () => Response.json({ wordId: "word-a", language: "en", text: null }));
  await assert.rejects(client.save("word-a", "en", "tree"), (error) => error.status === 502);
});

test("server permission and duplicate errors remain errors and do not cause fallback writes", async () => {
  for (const status of [401, 403, 404, 409]) {
    let calls = 0;
    const client = new WordTranslationsClient(async () => { calls++; return Response.json({ message: "Denied" }, { status }); });
    await assert.rejects(client.save("word-a", "ru", "дерево"), (error) => error instanceof TranslationError && error.status === status);
    assert.equal(calls, 1);
  }
});

test("failed writes and uncertain successful responses are not automatically repeated", async () => {
  for (const response of [() => Response.json({}, { status: 500 }), () => Response.json({ wordId: "word-a", language: "en", text: "different" })]) {
    let calls = 0;
    const client = new WordTranslationsClient(async () => { calls++; return response(); });
    await assert.rejects(client.save("word-a", "en", "tree"), TranslationError); assert.equal(calls, 1);
  }
});

test("read cancellation is forwarded and identifiers stay within their path segments", async () => {
  const signal = new AbortController().signal; const wordId = "word/other?x"; const language = "en?x=y";
  const client = new WordTranslationsClient(async (path, init) => {
    assert.equal(path, "/words/word%2Fother%3Fx/translations/en%3Fx%3Dy"); assert.equal(init.signal, signal);
    return Response.json({ wordId, language, text: "tree" });
  });
  assert.equal((await client.get(wordId, language, signal)).text, "tree");
});
