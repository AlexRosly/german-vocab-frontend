import {test} from "node:test";
import assert from "node:assert/strict";
import {DictionaryEntryClient,matchesDictionaryView,activeTrainingWords,supportsDifficultWords,difficultTrainingWords} from "../src/lib/dictionary-entry-client.ts";
const entry={isFavorite:false,isArchived:false,revision:"initial"};
test("dictionary views keep archived favorites out of active training",()=>{
 const words=[{id:"active",dictionaryEntry:entry},{id:"star",dictionaryEntry:{...entry,isFavorite:true}},{id:"archived",dictionaryEntry:{...entry,isFavorite:true,isArchived:true}}];
 assert.deepEqual(words.filter(w=>matchesDictionaryView(w,"favorites")).map(w=>w.id),["star"]);
 assert.deepEqual(words.filter(w=>matchesDictionaryView(w,"archive")).map(w=>w.id),["archived"]);
 assert.equal(words.filter(w=>matchesDictionaryView(w,"all")).length,3);
 assert.deepEqual(activeTrainingWords(words).map(w=>w.id),["active","star"]);
 assert.deepEqual(activeTrainingWords(words.filter(w=>matchesDictionaryView(w,"archive"))),[]);
 assert.equal(words[2].dictionaryEntry.isArchived,true);
});
test("writes only requested personal flags with the exact revision",async()=>{
 const client=new DictionaryEntryClient(async(path,init)=>{
  assert.equal(path,"/words/word-a/dictionary-settings");assert.equal(init.method,"PUT");assert.equal(init.cache,"no-store");
  assert.deepEqual(JSON.parse(init.body),{isFavorite:true,revision:"initial"});
  return Response.json({wordId:"word-a",isFavorite:true,isArchived:false,revision:"fresh"});
 });
 assert.deepEqual(await client.save("word-a",entry,{isFavorite:true}),{isFavorite:true,isArchived:false,revision:"fresh"});
});
test("unsafe paths, missing revisions and nonboolean flags cannot be sent",async()=>{
 let calls=0;const client=new DictionaryEntryClient(async()=>{calls++;throw Error();});
 for(const [id,state,patch]of [["../x",entry,{isArchived:true}],["word",{...entry,revision:undefined},{isFavorite:true}],["word",entry,{}],["word",entry,{isArchived:"false"}],["word",entry,{isFavorite:true,userId:"other"}]])await assert.rejects(client.save(id,state,patch),e=>e.status===400);
 assert.equal(calls,0);
});
test("failed or ambiguous saves are never automatically retried",async()=>{
 for(const response of [new Response(null,{status:500}),new Response(null,{status:409}),Response.json({wordId:"other",...entry,revision:"fresh"}),Response.json({wordId:"word-a",...entry}),Response.json({wordId:"word-a",...entry,revision:"fresh"})]){
  let calls=0;const client=new DictionaryEntryClient(async()=>{calls++;return response;});await assert.rejects(client.save("word-a",entry,{isFavorite:true}));assert.equal(calls,1);
 }
});

test("difficult words stay separate from favorites and archive and old API never pretends to support them",()=>{
 const hard={...entry,isDifficult:true};
 const words=[{id:"old",dictionaryEntry:entry},{id:"plain",dictionaryEntry:{...entry,isDifficult:false}},{id:"hard",dictionaryEntry:hard},{id:"star",dictionaryEntry:{...entry,isDifficult:false,isFavorite:true}},{id:"archived",dictionaryEntry:{...hard,isArchived:true}}];
 assert.equal(supportsDifficultWords([]),false);assert.equal(supportsDifficultWords(words.slice(0,1)),false);assert.equal(supportsDifficultWords(words),true);
 assert.deepEqual(difficultTrainingWords(words).map(w=>w.id),["hard"]);
 assert.deepEqual(words.filter(w=>matchesDictionaryView(w,"difficult")).map(w=>w.id),["hard"]);
 assert.equal(words[4].dictionaryEntry.isDifficult,true);assert.equal(words[3].dictionaryEntry.isFavorite,true);
});
test("updates a difficult marker only through the private revisioned endpoint",async()=>{
 let calls=0;
 const client=new DictionaryEntryClient(async(path,init)=>{calls++;assert.equal(path,"/words/word-a/dictionary-settings");assert.deepEqual(JSON.parse(init.body),{isDifficult:true,revision:"initial"});return Response.json({wordId:"word-a",...entry,isDifficult:true,revision:"fresh"});});
 const saved=await client.save("word-a",{...entry,isDifficult:false},{isDifficult:true});
 assert.deepEqual(saved,{...entry,isDifficult:true,revision:"fresh"});assert.equal(calls,1);
});
test("unsupported or malformed difficult changes never send credentials or guess a new personal flag",async()=>{
 let calls=0;const client=new DictionaryEntryClient(async()=>{calls++;throw Error();});
 await assert.rejects(client.save("word-a",entry,{isDifficult:true}),e=>e.status===400);
 await assert.rejects(client.save("word-a",{...entry,isDifficult:false},{isDifficult:"false"}),e=>e.status===400);
 assert.equal(calls,0);
 for(const result of [{wordId:"word-a",...entry,revision:"fresh"},{wordId:"word-a",...entry,isDifficult:"true",revision:"fresh"},{wordId:"word-a",...entry,isDifficult:true,revision:"fresh"}]){
  await assert.rejects(new DictionaryEntryClient(async()=>Response.json(result)).save("word-a",{...entry,isDifficult:false},{isFavorite:false}),e=>e.status===502);
 }
});
test("ordinary flag saves retain the known difficult marker and server conflicts are not retried",async()=>{
 const current={...entry,isDifficult:true};
 const client=new DictionaryEntryClient(async()=>Response.json({wordId:"word-a",...current,isArchived:true,revision:"fresh"}));
 assert.deepEqual(await client.save("word-a",current,{isArchived:true}),{...current,isArchived:true,revision:"fresh"});
 let calls=0;await assert.rejects(new DictionaryEntryClient(async()=>{calls++;return new Response(null,{status:409})}).save("word-a",current,{isDifficult:false}),e=>e.status===409);assert.equal(calls,1);
});
