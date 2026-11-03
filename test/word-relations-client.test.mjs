import { test } from "node:test";
import assert from "node:assert/strict";
import { WordRelationsClient } from "../src/lib/word-relations-client.ts";
const word = { id: "b", german: "sicher sein", article: "none", translation: "русский не выбран", selectedTranslation: { language: "uk", text: null } };
const response = data => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
test("reads with no-store and passes abort signal, preserving a missing selected translation", async () => {
  const abort = new AbortController(); let call;
  const client = new WordRelationsClient(async (...args) => { call = args; return response([word]); });
  assert.equal((await client.list("a/b", abort.signal))[0].selectedTranslation.text, null);
  assert.equal(call[0], "/words/a%2Fb/relations"); assert.equal(call[1].cache, "no-store"); assert.equal(call[1].signal, abort.signal);
});
test("rejects malformed, self, or duplicate related cards", async () => {
  for (const data of [[word, word], [{ ...word, selectedTranslation: undefined }], [null], { words: [word] }]) await assert.rejects(new WordRelationsClient(async () => response(data)).list("a"));
  await assert.rejects(new WordRelationsClient(async () => response([word])).list("b"));
});
test("detail loads the actual card and examples, checks identity and never repeats a failed request", async () => {
  const paths = [];
  const client = new WordRelationsClient(async path => { paths.push(path); return response(path.endsWith("/examples") ? [{ id: "ex", german: "Ich bin sicher.", selectedTranslation: { language: "uk", text: null } }] : word); });
  const result = await client.detail("b"); assert.equal(result.word.id, "b"); assert.equal(result.examples[0].selectedTranslation.text, null);
  assert.deepEqual(paths, ["/words/b", "/words/b/examples"]);
  await assert.rejects(client.detail("wrong"));
  let n = 0; const failed = new WordRelationsClient(async () => { n++; return new Response("", { status: 404 }); });
  await assert.rejects(failed.list("b"), error => error.status === 404); assert.equal(n, 1);
});
test("aborted and network failures are left for an explicit retry", async () => {
  const failure = new DOMException("Canceled", "AbortError");
  await assert.rejects(new WordRelationsClient(async () => { throw failure; }).list("b"), error => error === failure);
});

test("relation writes use idempotent methods and never retry an uncertain response",async()=>{
 const calls=[];const client=new WordRelationsClient(async(path,init)=>{calls.push({path,method:init.method});return response(init.method==="PUT"?{linked:true}:{deleted:true});});
 await client.set("source","target",true);await client.set("source","target",false);
 assert.deepEqual(calls,[{path:"/words/source/relations/target",method:"PUT"},{path:"/words/source/relations/target",method:"DELETE"}]);
 let count=0;const failed=new WordRelationsClient(async()=>{count++;return new Response("",{status:500});});
 await assert.rejects(failed.set("source","target",true));assert.equal(count,1);
 await assert.rejects(new WordRelationsClient(async()=>response({})).set("source","target",true));
 await assert.rejects(client.set("source","source",true));await assert.rejects(client.set("..","target",true));
});
