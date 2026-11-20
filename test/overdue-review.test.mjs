import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewDay, overdueReviewWords } from '../src/lib/overdue-review.ts';
import { practiceWords } from '../src/lib/practice-modes.ts';
import { activeTrainingWords } from '../src/lib/dictionary-entry-client.ts';
const now=new Date('2026-11-20T12:00:00Z');
const due=(id,date)=>({id,progress:{nextReviewAt:date}});
test('overdue means before the account calendar day, not merely earlier than now',()=>{
 const words=['old','edge','today','later','unknown'].map(id=>({id}));
 const pool=[due('old','2026-11-18T16:00:00Z'),due('edge','2026-11-19T22:59:59Z'),due('today','2026-11-19T23:00:00Z'),due('later','2026-11-20T11:00:00Z'),due('unknown',null)];
 assert.deepEqual(overdueReviewWords(words,pool,'Europe/Berlin',now).map(w=>w.id),['old','edge']);
 assert.equal(reviewDay(new Date('2026-11-19T23:00:00Z'),'Europe/Berlin'),'2026-11-20');
});
test('DST boundaries and extreme account timezones use calendar days',()=>{
 const words=[{id:'a'}],pool=[due('a','2026-10-24T21:59:59Z')];
 assert.deepEqual(overdueReviewWords(words,pool,'Europe/Berlin',new Date('2026-10-25T02:30:00Z')),words);
 assert.equal(reviewDay(new Date('2026-03-29T22:30:00Z'),'Europe/Berlin'),'2026-03-30');
 const utc=[due('a','2026-11-19T23:30:00Z')],n=new Date('2026-11-20T10:00:00Z');
 assert.equal(overdueReviewWords(words,utc,'Pacific/Kiritimati',n).length,1);
 assert.equal(overdueReviewWords(words,utc,'America/Los_Angeles',n).length,1);
 assert.equal(overdueReviewWords(words,utc,'Europe/Berlin',n).length,0);
});
test('unknown timezone, absent metadata and invalid dates never guess an overdue card',()=>{
 const words=[{id:'a'}];
 for(const zone of [undefined,'','Not/AZone'])assert.deepEqual(overdueReviewWords(words,[due('a','2026-01-01T00:00:00Z')],zone,now),[]);
 for(const row of [{id:'a'},due('a',null),due('a',42),due('a','not-a-date'),due('a','2026-11-19'),due('a','2026-11-21T00:00:00Z')])assert.deepEqual(overdueReviewWords(words,[row],'UTC',now),[]);
 assert.equal(reviewDay(new Date(NaN),'UTC'),null);
});
test('oldest first, deterministic ties, no duplicates, and current personal content retained',()=>{
 const current=[{id:'a',selectedTranslation:{text:'мой перевод'}},{id:'c'},{id:'b'}];
 const pool=[due('a','2026-11-19T09:00:00Z'),due('b','2026-11-18T09:00:00Z'),due('c','2026-11-18T09:00:00Z'),due('a','2026-11-19T08:00:00Z'),due('foreign','2026-01-01T00:00:00Z')];
 const selected=overdueReviewWords(current,pool,'UTC',now);
 assert.deepEqual(selected.map(w=>w.id),['b','c','a']);assert.equal(selected[2],current[0]);assert.equal(selected[2].selectedTranslation.text,'мой перевод');
});
test('current archive, filters and mode intersect the due metadata, fresh schedules can empty the queue',()=>{
 const card=(id,patch={})=>({id,german:'Haus',article:'das',grammaticalNumber:'singular',pluralForm:'Häuser',selectedTranslation:{language:'ru',text:'дом'},...patch});
 const words=[card('active'),card('archive',{dictionaryEntry:{isArchived:true}}),card('verb',{article:'none',grammaticalNumber:'not_applicable'})];
 const pool=words.map(w=>due(w.id,'2026-11-18T00:00:00Z'));
 const eligible=practiceWords(activeTrainingWords(words),'plural');
 assert.deepEqual(overdueReviewWords(eligible,pool,'UTC',now).map(w=>w.id),['active']);
 assert.deepEqual(overdueReviewWords(eligible,[],'UTC',now),[]);
 assert.deepEqual(overdueReviewWords(eligible,[due('active','2026-11-21T00:00:00Z')],'UTC',now),[]);
});
