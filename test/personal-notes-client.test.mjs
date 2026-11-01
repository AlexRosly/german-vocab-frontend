import { test } from "node:test";
import assert from "node:assert/strict";
import { PersonalNoteError, PersonalNotesClient, normalizeNote } from "../src/lib/personal-notes-client.ts";
const note = { wordId: "tree", text: "My hint", revision: "revision-1" };
test("reads only a private note for the requested word and forwards cancellation", async () => {
  const controller = new AbortController(); const client = new PersonalNotesClient(async (path, init) => {
    assert.equal(path, "/words/tree/personal-note"); assert.equal(init.signal, controller.signal); assert.equal(init.cache, "no-store");
    return Response.json({ ...note, userId: "ignored", role: "ADMIN" });
  });
  assert.deepEqual(await client.get("tree", controller.signal), note);
});
test("saves only normalized text and expected revision, preserving literal user content", async () => {
  const value = "<b>My hint</b>\nnext"; const client = new PersonalNotesClient(async (path, init) => {
    assert.equal(init.method, "PUT"); assert.equal(path, "/words/tree/personal-note"); assert.deepEqual(JSON.parse(init.body), { text: value, revision: null });
    return Response.json({ ...note, text: value });
  });
  assert.equal((await client.save("tree", `  <b>My hint</b>\r\nnext  `, null)).text, value);
  assert.equal(normalizeNote(" a\rb "), "a\nb");
});
test("an empty note clears only through an explicit versioned save", async () => {
  const client = new PersonalNotesClient(async (_path, init) => { assert.deepEqual(JSON.parse(init.body), { text: "", revision: "revision-1" }); return Response.json({ wordId: "tree", text: null, revision: null }); });
  assert.deepEqual(await client.save("tree", "   ", "revision-1"), { wordId: "tree", text: null, revision: null });
});
test("invalid IDs, oversized Unicode notes and absent revisions are rejected before requests", async () => {
  let calls = 0; const client = new PersonalNotesClient(async () => { calls++; return Response.json(note); });
  for (const id of ["../tree", "a/b", "", "x".repeat(192)]) await assert.rejects(client.get(id));
  for (const [text, revision] of [["x".repeat(2001), null], ["🙂".repeat(2001), null], ["x", undefined], ["x", 2], ["x", "bad/key"]]) await assert.rejects(client.save("tree", text, revision));
  assert.equal(calls, 0);
});
test("mismatched or malformed note responses cannot confirm another word or revision", async () => {
  for (const value of [null, {}, { ...note, wordId: "other" }, { ...note, text: null }, { ...note, revision: null }, { ...note, text: "" }, { ...note, text: "x".repeat(2001) }]) {
    await assert.rejects(new PersonalNotesClient(async () => Response.json(value)).get("tree"));
  }
  await assert.rejects(new PersonalNotesClient(async () => Response.json(note)).save("tree", "Another text", null));
});
test("conflicts and failures remain errors without automatic mutation retries", async () => {
  for (const status of [401, 404, 409, 500]) { let calls = 0; const client = new PersonalNotesClient(async () => { calls++; return new Response(null, { status }); });
    await assert.rejects(client.save("tree", "Hint", "revision-1"), (error) => error instanceof PersonalNoteError && error.status === status); assert.equal(calls, 1);
  }
});
