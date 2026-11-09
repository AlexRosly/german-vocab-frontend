import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CorrectionsClient,CorrectionsError} from '../src/lib/corrections-client.ts';
const snapshot={id:'word-1',german:'Baum',translation:'дерево',article:'der',grammaticalNumber:'singular',pluralForm:'Bäume',notes:null,sourceBook:null,level:'A1',lessonNumber:1,publicationStatus:'PUBLISHED',translations:[{language:'en',text:'tree'}],examples:[],relatedWords:[]};
const report={id:'report-1',wordId:'word-1',category:'WORD',description:'Please check the plural form',suggestion:null,snapshot,status:'OPEN',revision:'revision-1',reviewComment:null,reviewedAt:null,createdAt:'2026-11-09T10:00:00.000Z',updatedAt:'2026-11-09T10:00:00.000Z'};
const ok=data=>new Response(JSON.stringify(data),{status:200});
test('correction capabilities stay hidden on old or not migrated backends',async()=>{
 for(const status of [404,503])assert.equal(await new CorrectionsClient(async()=>new Response(null,{status})).enabled(),false);
 assert.equal(await new CorrectionsClient(async()=>ok({enabled:false})).enabled(),false);assert.equal(await new CorrectionsClient(async()=>ok({enabled:true})).enabled(),true);
});
test('submission normalizes only the explanation and never sends ownership, publication or private content',async()=>{
 let call;const client=new CorrectionsClient(async(path,init)=>{call={path,init};return ok(report);});
 await client.create('word-1','WORD','  Please check the plural form  ','  ');
 assert.equal(call.path,'/words/word-1/corrections');assert.deepEqual(JSON.parse(call.init.body),{category:'WORD',description:report.description});
 await assert.rejects(()=>client.create('word/1','WORD',report.description,''),CorrectionsError);
 await assert.rejects(()=>client.create('word-1','WORD','short',''),CorrectionsError);
});
test('lists use separate personal and admin endpoints and validate returned status and identity',async()=>{
 const calls=[];const client=new CorrectionsClient(async path=>{calls.push(path);return ok({items:[report],total:1,page:0,pageSize:30});});
 await client.list(false,'OPEN',0);await client.list(true,'OPEN',0);assert.deepEqual(calls,['/corrections/mine?status=OPEN&page=0','/moderation/corrections?status=OPEN&page=0']);
 await assert.rejects(()=>new CorrectionsClient(async()=>ok({items:[report,report],total:2,page:0,pageSize:30})).list(false,'OPEN',0),CorrectionsError);
 await assert.rejects(()=>new CorrectionsClient(async()=>ok({...report,id:'other',current:snapshot,cardChanged:false})).detail('report-1',false),CorrectionsError);
});
test('review sends only a manual decision, comment and expected revision; conflicts are not retried',async()=>{
 let calls=0,body;const client=new CorrectionsClient(async(path,init)=>{calls++;body=JSON.parse(init.body);return new Response(JSON.stringify({message:'stale'}),{status:409});});
 await assert.rejects(()=>client.review(report,'RESOLVED','  Fixed the typo  '),e=>e instanceof CorrectionsError&&e.status===409);assert.equal(calls,1);assert.deepEqual(body,{status:'RESOLVED',expectedRevision:'revision-1',comment:'Fixed the typo'});
 await assert.rejects(()=>client.review(report,'RESOLVED','x'),CorrectionsError);assert.equal(calls,1);
});
test('a removed shared card does not remove the reporter history or imply access to current data',async()=>{
 const detail=await new CorrectionsClient(async()=>ok({...report,current:null,cardChanged:true})).detail('report-1',false);assert.equal(detail.current,null);assert.equal(detail.snapshot.german,'Baum');
});
