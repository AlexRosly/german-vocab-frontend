import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CollocationsClient,collocationPayload} from '../src/lib/collocations-client.ts';
const row={id:'pair',nounWordId:'noun',verbWordId:'verb',german:'einen Arbeitgeber suchen',grammarNote:'Akkusativ',revision:'revision-1',translations:[{language:'ru',text:'искать работодателя'}],selectedTranslation:{language:'en',text:null},noun:{id:'noun',german:'Arbeitgeber',article:'der',grammaticalNumber:'singular'},verb:{id:'verb',german:'suchen'}};
const page={kind:'noun',items:[row],total:1,page:1,pageSize:20,hasNext:false};
const response=data=>new Response(JSON.stringify(data));

test('collocations keep missing selected translations and support noun and inverse verb pages',async()=>{
 const calls=[],controller=new AbortController();const client=new CollocationsClient(async(path,init)=>{calls.push({path,init});return response(path.startsWith('/words/verb/')?{...page,kind:'verb'}:page)});
 assert.equal((await client.list('noun',1,controller.signal)).items[0].selectedTranslation.text,null);
 assert.equal((await client.list('verb')).kind,'verb');assert.equal(calls[0].path,'/words/noun/collocations?page=1');assert.equal(calls[0].init.signal,controller.signal);assert.equal(calls[0].init.cache,'no-store');
});
test('old API hides capability while temporary errors and abort remain recoverable',async()=>{
 assert.equal(await new CollocationsClient(async()=>new Response('{}',{status:404})).config(),false);
 for(const body of [{enabled:true,version:1},{enabled:true,version:2},{enabled:false,version:1}])assert.equal(await new CollocationsClient(async()=>response(body)).config(),body.enabled&&body.version===1);
 await assert.rejects(new CollocationsClient(async()=>new Response('{}',{status:503})).config(),e=>e.status===503);
 await assert.rejects(new CollocationsClient(async()=>{throw new DOMException('aborted','AbortError')}).list('noun'),e=>e.name==='AbortError');
});
test('invalid IDs and pages are rejected before credentials can be sent',async()=>{
 let calls=0;const client=new CollocationsClient(async()=>{calls++;return response(page)});
 for(const id of [undefined,'../auth/me','https://example.test','a/b'])await assert.rejects(client.list(id));
 for(const number of [0,-1,1.5,1000001])await assert.rejects(client.list('noun',number));
 await assert.rejects(client.detail('noun','../auth'));assert.equal(calls,0);
});
test('rejects foreign pairs, duplicated records, inconsistent pages and Russian substitution',async()=>{
 for(const bad of [{...page,page:2},{...page,pageSize:100},{...page,hasNext:true},{...page,total:0},{...page,total:2,items:[row,row]},
  {...page,items:[{...row,nounWordId:'other',noun:{...row.noun,id:'other'}}]},
  {...page,items:[{...row,verbWordId:'noun',verb:{id:'noun',german:'suchen'}}]},
  {...page,items:[{...row,selectedTranslation:{language:'en',text:'искать работодателя'}}]},
  {...page,items:[{...row,translations:[...row.translations,...row.translations]}]},
  {...page,items:[{...row,verbWordId:undefined,verb:{german:'suchen'}}]}])await assert.rejects(new CollocationsClient(async()=>response(bad)).list('noun'));
 await assert.rejects(new CollocationsClient(async()=>response({...row,id:'another'})).detail('noun','pair'));
 await assert.rejects(new CollocationsClient(async()=>response(row)).detail('foreign','pair'));
});
test('phrase payload accepts German only and retains explicit translation removals',()=>{
 assert.deepEqual(collocationPayload('verb','  einen  Arbeitgeber\n suchen  ','  Akkusativ  ',{ru:'',uk:' шукати роботодавця '}),{verbWordId:'verb',german:'einen Arbeitgeber suchen',grammarNote:'Akkusativ',translations:[{language:'ru',text:null},{language:'uk',text:'шукати роботодавця'}]});
 assert.deepEqual(collocationPayload('verb','Arbeit finden','','').translations,[]);
 for(const text of ['','  ','a'.repeat(501),'ein\0Wort'])assert.throws(()=>collocationPayload('verb',text,'',{}));
});
test('mutations use exact revisions and deletion requires a server acknowledgement',async()=>{
 const calls=[],client=new CollocationsClient(async(path,init)=>{calls.push({path,init});return response(init.method==='DELETE'?{deleted:true}:row)});
 const input=collocationPayload('verb',row.german,'',{});await client.save('noun',input);await client.save('noun',input,row);await client.remove('noun','pair',row.revision);
 assert.deepEqual(calls.map(c=>c.init.method),['POST','PATCH','DELETE']);assert.equal(calls[1].path,'/words/noun/collocations/pair');assert.equal(JSON.parse(calls[1].init.body).revision,'revision-1');assert.deepEqual(JSON.parse(calls[2].init.body),{revision:'revision-1'});
 await assert.rejects(new CollocationsClient(async()=>response({deleted:false})).remove('noun','pair','revision-1'));
 await assert.rejects(new CollocationsClient(async()=>new Response(JSON.stringify({message:'stale revision'}),{status:409})).save('noun',input,row),e=>e.status===409&&e.message==='stale revision');
});
