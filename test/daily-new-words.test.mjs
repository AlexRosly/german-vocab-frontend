import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyNewWordsPlan, plannedNewWords } from '../src/lib/daily-new-words.ts';
import { StudySettingsClient, validSettings } from '../src/lib/study-settings-client.ts';
const progress={newWordsDailyGoal:3,newWordsStudiedToday:1,timeZone:'Europe/Berlin',studyDate:'2026-11-20'};
test('new word plan is separate from the overall goal and tolerates exceeding it',()=>{
 assert.deepEqual(dailyNewWordsPlan({...progress,dailyGoal:100,studiedToday:99}),{goal:3,done:1,remaining:2,timeZone:'Europe/Berlin',studyDate:'2026-11-20'});
 assert.equal(dailyNewWordsPlan({...progress,newWordsStudiedToday:8}).remaining,0);
});
test('planned batch respects remaining daily and session sizes without changing the free queue',()=>{
 const words=['a','b','c','d'],plan=dailyNewWordsPlan(progress);
 assert.deepEqual(plannedNewWords(words,0,plan),['a','b']);assert.deepEqual(plannedNewWords(words,1,plan),['a']);
 assert.deepEqual(plannedNewWords(words,20,dailyNewWordsPlan({...progress,newWordsStudiedToday:9})),[]);
 assert.deepEqual(words,['a','b','c','d']);
});
test('old API or malformed counters never fabricate a new word plan',()=>{
 for(const row of [null,{}, {dailyGoal:20,studiedToday:10}, {...progress,newWordsDailyGoal:0},{...progress,newWordsDailyGoal:'3'},{...progress,newWordsDailyGoal:501},{...progress,newWordsStudiedToday:-1},{...progress,newWordsStudiedToday:1.5},{...progress,timeZone:'bad/zone'}])assert.equal(dailyNewWordsPlan(row),null);
});
test('new goal is validated, saved explicitly and cannot silently disappear or change in confirmation',async()=>{
 const settings={timeZone:'Europe/Berlin',dailyGoal:20,newWordsDailyGoal:7};let calls=0;
 const client=new StudySettingsClient(async(p,init)=>{calls++;assert.deepEqual(JSON.parse(init.body),settings);return Response.json(settings)});
 assert.deepEqual(await client.save(settings),settings);assert.equal(calls,1);
 for(const value of [null,0,501,1.5,'7'])assert.equal(validSettings({...settings,newWordsDailyGoal:value}),false);
 for(const result of [{timeZone:settings.timeZone,dailyGoal:20},{...settings,newWordsDailyGoal:8}])await assert.rejects(new StudySettingsClient(async()=>Response.json(result)).save(settings));
});
