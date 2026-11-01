import { test } from "node:test";
import assert from "node:assert/strict";
import { StudyHistoryClient, HistoryError } from "../src/lib/study-history-client.ts";
const summary = (id = "session-a") => ({ id, totalWords: 2, knownCount: 1, needsReviewCount: 1, startedAt: "2026-11-01T12:00:00.000Z", completedAt: "2026-11-01T12:00:01.000Z" });
const answer = (id = "word-a", value = "KNOWN") => ({ id: `answer-${id}`, wordId: id, sessionId: "session-a", answer: value, answeredAt: "2026-11-01T12:00:00.000Z", word: { id, german: "Baum", article: "der", grammaticalNumber: "singular", selectedTranslation: { language: "en", text: "tree" } } });
const detail = () => ({ ...summary(), userId: "user-a", words: [answer(), answer("word-b", "NEEDS_REVIEW")] });

test("history page reads use bounded relative URLs and forward cancellation without mutations", async () => {
  const signal = new AbortController().signal;
  const client = new StudyHistoryClient(async (path, init) => {
    assert.equal(path, "/study/history?limit=20&cursor=Y3Vyc29y"); assert.equal(init.signal, signal); assert.equal(init.cache, "no-store");
    assert.equal(init.method, undefined); assert.equal(init.body, undefined);
    return Response.json({ sessions: [summary()], nextCursor: null });
  });
  assert.deepEqual(await client.page("Y3Vyc29y", signal), { sessions: [summary()], nextCursor: null });
});

test("invalid pagination inputs fail before any credentialed request", async () => {
  let calls = 0; const client = new StudyHistoryClient(async () => { calls++; throw Error("unexpected"); });
  for (const limit of [0, 51, 1.5, NaN]) await assert.rejects(client.page(undefined, undefined, limit), HistoryError);
  for (const cursor of ["", "https://other.test", "x".repeat(513)]) await assert.rejects(client.page(cursor), HistoryError);
  assert.equal(calls, 0);
});

test("empty history is valid and a hidden-card detail retains the original totals", async () => {
  const client = new StudyHistoryClient(async (path) => Response.json(path.includes("?") ? { sessions: [], nextCursor: null } : { ...detail(), words: [] }));
  assert.deepEqual(await client.page(), { sessions: [], nextCursor: null });
  const result = await client.detail("session-a", "user-a", "en");
  assert.equal(result.totalWords, 2); assert.deepEqual(result.words, []);
});

test("malformed page counters, duplicates and nonadvancing cursors cannot render misleading history", async () => {
  const invalid = [null, [], { sessions: [summary()], nextCursor: "bad cursor" }, { sessions: [], nextCursor: "Y3Vyc29y" },
    { sessions: [summary(), summary()], nextCursor: null }, { sessions: [{ ...summary(), knownCount: 5 }], nextCursor: null },
    { sessions: [{ ...summary(), startedAt: "invalid" }], nextCursor: null }, { sessions: [summary()] },
    { sessions: [{ ...summary(), startedAt: "1" }], nextCursor: null },
  ];
  for (const data of invalid) await assert.rejects(new StudyHistoryClient(async () => Response.json(data)).page(), HistoryError);
  await assert.rejects(new StudyHistoryClient(async () => Response.json({ sessions: [summary()], nextCursor: "Y3Vyc29y" })).page("Y3Vyc29y"), HistoryError);
});

test("details validate the requested session, owner, language and saved answer enum", async () => {
  const invalid = [
    { ...detail(), id: "other-session" }, { ...detail(), userId: "other-user" },
    { ...detail(), words: [answer(), answer()] }, { ...detail(), words: [{ ...answer(), answer: "UNKNOWN" }] },
    { ...detail(), words: [{ ...answer(), sessionId: "other-session" }] },
    { ...detail(), words: [{ ...answer(), word: { ...answer().word, selectedTranslation: { language: "ru", text: "дерево" } } }] },
    { ...detail(), words: [{ ...answer(), word: null }] },
  ];
  for (const data of invalid) await assert.rejects(new StudyHistoryClient(async () => Response.json(data)).detail("session-a", "user-a", "en"), HistoryError);
});

test("a missing selected translation remains null with no Russian substitution", async () => {
  const data = detail(); data.words[0].word.translation = "дерево"; data.words[0].word.selectedTranslation.text = null;
  const client = new StudyHistoryClient(async (path) => { assert.equal(path, "/study/history/session-a"); return Response.json(data); });
  assert.equal((await client.detail("session-a", "user-a", "en")).words[0].word.selectedTranslation.text, null);
});

test("detail identifiers remain inside one path segment and cancellation reaches the request", async () => {
  const signal = new AbortController().signal;
  const id = "session/with?query#fragment";
  const client = new StudyHistoryClient(async (path, init) => {
    assert.equal(path, "/study/history/session%2Fwith%3Fquery%23fragment"); assert.equal(init.signal, signal);
    return Response.json({ ...summary(id), userId: "user-a", words: [] });
  });
  assert.equal((await client.detail(id, "user-a", "en", signal)).id, id);
});

test("HTTP failures are surfaced once and are never automatically repeated", async () => {
  for (const status of [401, 403, 404, 500]) {
    let calls = 0;
    const client = new StudyHistoryClient(async () => { calls++; return Response.json({ message: "Сессия не найдена" }, { status }); });
    await assert.rejects(client.page(), (error) => error.status === status); assert.equal(calls, 1);
  }
});
