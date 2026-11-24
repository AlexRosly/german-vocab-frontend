import test from 'node:test';import assert from 'node:assert/strict';
import {PersonalExampleTranslationsClient} from '../src/lib/personal-example-translations-client.ts';
const empty=()=>({wordId:'w',exampleId:'e',language:'ru',german:'Das Haus ist groß.',commonText:null,text:null,revision:null,sourceGerman:null,stale:false});
test('example translations use fixed own-account URLs, language and cancellation',async()=>{
 const abort=new AbortController(),calls=[];const client=new PersonalExampleTranslationsClient(async(p,i)=>{calls.push([p,i]);return Response.json(empty())});
 assert.equal((await client.get('w','e','ru',abort.signal)).text,null);assert.equal(calls[0][0],'/words/w/examples/e/personal-translations/ru');assert.equal(calls[0][1].cache,'no-store');assert.equal(calls[0][1].signal,abort.signal);
});
test('save sends normalized text, explicit revision and source sentence; clearing remains private',async()=>{
 const calls=[];const client=new PersonalExampleTranslationsClient(async(p,i)=>{const data=JSON.parse(i.body);calls.push(data);return Response.json({...empty(),text:data.text||null,revision:data.text?'rev-1':null,sourceGerman:data.text?data.sourceGerman:null})});
 assert.equal((await client.save('w','e','ru','  Мой\r\nдом  ',null,'Das Haus ist groß.')).text,'Мой\nдом');assert.deepEqual(calls[0],{text:'Мой\nдом',revision:null,sourceGerman:'Das Haus ist groß.'});
 assert.equal((await client.save('w','e','ru',' ','rev-1','Das Haus ist groß.')).text,null);
});
test('stale stored translations are readable but malformed identities and states are rejected',async()=>{
 const old={...empty(),text:'Мой дом',revision:'rev-1',sourceGerman:'Old sentence',stale:true};assert.equal((await new PersonalExampleTranslationsClient(async()=>Response.json(old)).get('w','e','ru')).stale,true);
 for(const patch of [{wordId:'other'},{exampleId:'other'},{language:'en'},{german:''},{revision:'x'},{stale:true},{text:'x',revision:'r',sourceGerman:null},{text:'x',revision:'r',sourceGerman:'old',stale:false}])await assert.rejects(new PersonalExampleTranslationsClient(async()=>Response.json({...empty(),...patch})).get('w','e','ru'),e=>e.status===502);
});
test('invalid writes are rejected before a request and concurrent/server failures preserve status',async()=>{
 let calls=0;const client=new PersonalExampleTranslationsClient(async()=>{calls++;throw Error('not reached')});
 for(const [w,e,l,text,rev,g]of [['../w','e','ru','x',null,'sentence'],['w','../e','ru','x',null,'sentence'],['w','e','RU','x',null,'sentence'],['w','e','ru','x'.repeat(1001),null,'sentence'],['w','e','ru','x','bad revision','sentence'],['w','e','ru','x',null,'']])await assert.rejects(client.save(w,e,l,text,rev,g),e=>e.status===400);
 assert.equal(calls,0);for(const status of [401,404,409,503])await assert.rejects(new PersonalExampleTranslationsClient(async()=>new Response(null,{status})).get('w','e','ru'),e=>e.status===status);
});
