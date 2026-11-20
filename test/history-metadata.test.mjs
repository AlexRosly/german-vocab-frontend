import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveTrainingAnswers } from '../src/lib/dictionary-training.ts';
import { StudyHistoryClient, historyModeLabel } from '../src/lib/study-history-client.ts';
const summary={id:'history-a',userId:'owner',totalWords:1,knownCount:1,needsReviewCount:0,startedAt:'2026-11-20T12:00:00.000Z',completedAt:'2026-11-20T12:00:00.000Z'};
const row={id:'answer-a',sessionId:'history-a',wordId:'w',answer:'KNOWN',answeredAt:summary.startedAt,word:{id:'w',german:'Haus',article:'das',grammaticalNumber:'singular',selectedTranslation:{language:'ru',text:'дом'}}};
test('all modes travel in every chunk and retries keep the exact metadata and key',async()=>{
 for(const mode of ['forward','reverse','article','plural','spelling']){
  const calls=[],fetcher=async(p,init)=>{calls.push({path:p,key:init.headers['Idempotency-Key'],body:JSON.parse(init.body)});return Response.json({})};
  const words=Array.from({length:501},(_,n)=>({wordId:'w-'+n,answer:'KNOWN'}));
  await saveTrainingAnswers(fetcher,words,'stable-key',mode);await saveTrainingAnswers(fetcher,words,'stable-key',mode);
  assert.equal(calls.length,4);assert.equal(calls[0].body.mode,mode);assert.equal(calls[1].body.mode,mode);assert.deepEqual(calls.slice(0,2),calls.slice(2));
 }
});
test('legacy save omits mode; invalid mode never sends a request',async()=>{
 let calls=0;await saveTrainingAnswers(async(p,init)=>{calls++;assert.equal(Object.hasOwn(JSON.parse(init.body),'mode'),false);return Response.json({})},[{wordId:'w',answer:'KNOWN'}],'legacy-key');
 await assert.rejects(saveTrainingAnswers(async()=>{calls++;return Response.json({})},[{wordId:'w',answer:'KNOWN'}],'key','bad'));
 assert.equal(calls,1);assert.equal(historyModeLabel(null),'Режим не сохранён');assert.equal(historyModeLabel('spelling'),'Написание слов');
});
test('history accepts legacy unknown metadata and new snapshots, rejecting invalid metadata',async()=>{
 for(const data of [{...summary,words:[row]},{...summary,mode:null,words:[{...row,nextReviewAt:null}]},{...summary,mode:'plural',words:[{...row,nextReviewAt:'2026-11-21T12:00:00.000Z'}]}])assert.equal((await new StudyHistoryClient(async()=>Response.json(data)).detail('history-a','owner','ru')).id,'history-a');
 for(const data of [{...summary,mode:'bad',words:[row]},{...summary,words:[{...row,nextReviewAt:'not-a-date'}]},{...summary,words:[{...row,nextReviewAt:'2026-11-19T00:00:00.000Z'}]}])await assert.rejects(new StudyHistoryClient(async()=>Response.json(data)).detail('history-a','owner','ru'));
});
