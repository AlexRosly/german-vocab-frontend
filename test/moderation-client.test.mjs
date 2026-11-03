import { test } from "node:test";
import assert from "node:assert/strict";
import { ModerationClient, ModerationError } from "../src/lib/moderation-client.ts";

const card = (extra = {}) => ({
  id: "word-a", german: "Baum", article: "der", grammaticalNumber: "singular", translation: "дерево",
  selectedTranslation: { language: "en", text: "tree" }, level: "A1", lessonNumber: 1, notes: null,
  publicationStatus: "PENDING_REVIEW", createdByUserId: "author-a", pluralForm: "Bäume",
  translations: [{ language: "ru", text: "дерево" }, { language: "en", text: "tree" }],
  examples: [{ id: "example-a", german: "Ein Baum.", translation: "Дерево.", translations: [{ language: "ru", text: "Дерево." }] }], revision: "a".repeat(64), ...extra,
});

test("moderation lists use only the requested status and pass cancellation through", async () => {
  const signal = new AbortController().signal;
  const client = new ModerationClient(async (path, init) => {
    assert.equal(path, "/moderation/words?status=REJECTED");
    assert.equal(init.signal, signal);
    assert.equal(init.body, undefined);
    return Response.json([card({ publicationStatus: "REJECTED" })]);
  });
  assert.equal((await client.list("REJECTED", signal))[0].id, "word-a");
});

test("a queue with duplicate IDs or a different publication status is rejected", async () => {
  for (const data of [[card(),card()], [card({publicationStatus:"PUBLISHED"})]]) {
    const client=new ModerationClient(async()=>Response.json(data));
    await assert.rejects(client.list("PENDING_REVIEW"),error=>error.status===502);
  }
});

test("review details retain all translations, examples and the exact revision", async () => {
  const client = new ModerationClient(async (path) => {
    assert.equal(path, "/moderation/words/word-a"); return Response.json(card());
  });
  assert.deepEqual(await client.detail("word-a"), card());
});

test("a decision sends only the selected status and the revision actually reviewed", async () => {
  let requests = 0;
  const client = new ModerationClient(async (path, init) => {
    requests++; assert.equal(path, "/moderation/words/word-a/status"); assert.equal(init.method, "PATCH");
    assert.deepEqual(JSON.parse(init.body), { publicationStatus: "PUBLISHED", expectedRevision: "a".repeat(64) });
    return Response.json(card({ publicationStatus: "PUBLISHED", revision: "b".repeat(64) }));
  });
  const result = await client.changeStatus(card(), "PUBLISHED");
  assert.equal(result.revision, "b".repeat(64)); assert.equal(requests, 1);
});

test("stale reviews and duplicates preserve conflict codes without automatically repeating a decision", async () => {
  for (const code of ["STALE_REVIEW", "DUPLICATE_WORD"]) {
    let calls = 0;
    const client = new ModerationClient(async () => {
      calls++; return Response.json({ code, message: "Open again", wordId: "existing-word" }, { status: 409 });
    });
    await assert.rejects(client.changeStatus(card(), "PUBLISHED"), (error) =>
      error instanceof ModerationError && error.status === 409 && error.code === code && error.wordId === "existing-word");
    assert.equal(calls, 1);
  }
});

test("unknown mutation outcomes are never treated as a successful publication or retried", async () => {
  for (const response of [
    () => Response.json({}, { status: 500 }),
    () => Response.json(card()),
    () => Response.json(card({ id: "other", publicationStatus: "PUBLISHED" })),
    () => Response.json(card({ publicationStatus: "PUBLISHED", revision: "bad" })),
  ]) {
    let calls = 0;
    const client = new ModerationClient(async () => { calls++; return response(); });
    await assert.rejects(client.changeStatus(card(), "PUBLISHED"), ModerationError);
    assert.equal(calls, 1);
  }
});

test("an incomplete or wrong review cannot enable a decision", async () => {
  for (const value of [card({ revision: undefined }), card({ examples: null }), card({ translations: null }), card({ id: "other" }), card({ article: undefined }), card({ grammaticalNumber: "bad" })]) {
    const client = new ModerationClient(async () => Response.json(value));
    await assert.rejects(client.detail("word-a"), (error) => error.status === 502);
  }
  let requests = 0;
  const client = new ModerationClient(async () => { requests++; return Response.json(card()); });
  await assert.rejects(client.changeStatus(card({ revision: "bad" }), "PUBLISHED"));
  await assert.rejects(client.list("unknown"));
  await assert.rejects(client.changeStatus(card(), "unknown"));
  assert.equal(requests, 0);
});

test("authentication/authorization failures are surfaced without fabricating a queue", async () => {
  for (const status of [401, 403]) {
    const client = new ModerationClient(async () => Response.json({ message: "Forbidden" }, { status }));
    await assert.rejects(client.list("PENDING_REVIEW"), (error) => error.status === status);
    await assert.rejects(client.detail("word-a"), (error) => error.status === status);
  }
});

test("card identifiers are encoded as one path segment", async () => {
  const id = "word/with?path";
  const client = new ModerationClient(async (path) => {
    assert.equal(path, "/moderation/words/word%2Fwith%3Fpath"); return Response.json(card({ id }));
  });
  assert.equal((await client.detail(id)).id, id);
});
