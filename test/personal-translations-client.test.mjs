import { test } from "node:test";
import assert from "node:assert/strict";
import { PersonalTranslationsClient } from "../src/lib/personal-translations-client.ts";

test("personal translations target only one word/locale and carry an optimistic revision", async () => {
  const controller = new AbortController(); const calls = [];
  const client = new PersonalTranslationsClient(async (path, init) => {
    calls.push([path, init]); assert.equal(path, "/words/word-a/personal-translations/pl");
    assert.equal(init.cache, "no-store"); assert.equal(init.signal, controller.signal);
    return Response.json({ wordId: "word-a", language: "pl", text: init.method ? "café\nnext" : null, revision: init.method ? "revision-new" : null });
  });
  assert.equal((await client.get("word-a", "pl", controller.signal)).text, null);
  assert.equal((await client.save("word-a", "pl", "  cafe\u0301\r\nnext  ", null, controller.signal)).text, "café\nnext");
  assert.equal(calls.length, 2); assert.deepEqual(JSON.parse(calls[1][1].body), { text: "café\nnext", revision: null });
});
test("empty text clears a private translation without writing to shared translations", async () => {
  const client = new PersonalTranslationsClient(async (path, init) => {
    assert.match(path, /\/personal-translations\/ar$/); assert.deepEqual(JSON.parse(init.body), { text: "", revision: "old" });
    return Response.json({ wordId: "a", language: "ar", text: null, revision: null });
  });
  assert.equal((await client.save("a", "ar", "  ", "old")).text, null);
});
test("rejects unsafe paths, oversized Unicode and invalid revisions before sending", async () => {
  let calls=0; const client = new PersonalTranslationsClient(async () => { calls++; throw Error(); });
  for (const [id,lang,text,revision] of [["../a","pl","x",null],["a","../pl","x",null],["a","pl","🌳".repeat(1001),null],["a","pl","x","../bad"]]) await assert.rejects(client.save(id,lang,text,revision),e=>e.status===400);
  assert.equal(calls,0);
});
test("uncertain responses and server failures are rejected with no automatic write retry", async () => {
  for (const response of [Response.json({wordId:"b",language:"pl",text:"x",revision:"r"}),Response.json({wordId:"a",language:"en",text:"x",revision:"r"}),Response.json({wordId:"a",language:"pl",text:null,revision:"r"}),Response.json({wordId:"a",language:"pl",text:"different",revision:"r"}),new Response(null,{status:409}),new Response(null,{status:500})]) {
    let calls=0; const client = new PersonalTranslationsClient(async()=>{calls++;return response;});
    await assert.rejects(client.save("a","pl","x",null)); assert.equal(calls,1);
  }
});
