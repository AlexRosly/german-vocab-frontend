import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VerbCatalogClient} from '../src/lib/verb-catalog-client.ts';
const word={id:'gehen',german:'gehen',isInDictionary:true,publicationStatus:'PUBLISHED',selectedTranslation:{language:'en',text:null},verbForms:[{praeteritum:'ging',participle2:'gegangen',auxiliary:'SEIN',reflexive:false,usage:null}]};
const query={q:'',scope:'library',auxiliary:'',page:1};
const page={total:1,page:1,pageSize:30,hasNext:false,items:[word]};
const response=data=>new Response(JSON.stringify(data),{status:200});
test('encodes search, scope and auxiliary and forwards AbortSignal on authenticated relative requests',async()=>{
 const controller=new AbortController();let called;
 const client=new VerbCatalogClient(async(path,init)=>{called={path,init};return response(page)});
 const result=await client.list({...query,q:'  ging & gehen  ',scope:'mine',auxiliary:'SEIN'},controller.signal);
 const url=new URL(called.path,'https://example.test');assert.equal(url.pathname,'/verbs');assert.equal(url.searchParams.get('q'),'ging & gehen');assert.equal(url.searchParams.get('scope'),'mine');assert.equal(url.searchParams.get('auxiliary'),'SEIN');assert.equal(called.init.signal,controller.signal);assert.equal(called.init.cache,'no-store');assert.equal(result.items[0].selectedTranslation.text,null);
});
test('invalid request parameters make no HTTP requests',async()=>{
 let calls=0;const client=new VerbCatalogClient(async()=>{calls++;return response(page)});
 for(const patch of [{q:'a'.repeat(101)},{scope:'all'},{page:0},{page:1.5},{auxiliary:'BOTH'}])await assert.rejects(client.list({...query,...patch}));
 await assert.rejects(client.detail('../auth/me'));assert.equal(calls,0);
});
test('rejects mismatched pagination, repeated cards and incomplete or unpaired forms',async()=>{
 for(const bad of [{...page,page:2},{...page,hasNext:true},{...page,pageSize:1000},{...page,total:0},{...page,total:2,items:[word,word]},
  {...page,items:[{...word,verbForms:[]}]},{...page,items:[{...word,verbForms:[{...word.verbForms[0],auxiliary:'BOTH'}]}]},
  {...page,items:[{...word,selectedTranslation:{language:'en',text:42}}]}]){
  await assert.rejects(new VerbCatalogClient(async()=>response(bad)).list(query));
 }
});
test('detail joins the requested verb and examples while preserving missing selected translations',async()=>{
 const paths=[];const client=new VerbCatalogClient(async path=>{paths.push(path);return response(path.endsWith('/examples')?[{id:'example',german:'Er ging.',selectedTranslation:{language:'en',text:null}}]:word)});
 const data=await client.detail('gehen');assert.deepEqual(paths,['/verbs/gehen','/words/gehen/examples']);assert.equal(data.examples[0].selectedTranslation.text,null);
 const wrong=new VerbCatalogClient(async path=>response(path.endsWith('/examples')?[]:{...word,id:'another'}));await assert.rejects(wrong.detail('gehen'));
});
test('HTTP failures retain status for retry UI and aborted reads are not replaced by fabricated data',async()=>{
 const unavailable=new VerbCatalogClient(async()=>new Response('{}',{status:503}));await assert.rejects(unavailable.list(query),error=>error.status===503);
 const aborted=new VerbCatalogClient(async()=>{throw new DOMException('aborted','AbortError')});await assert.rejects(aborted.list(query),error=>error.name==='AbortError');
});
