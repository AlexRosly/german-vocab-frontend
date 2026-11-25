import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Use the same production helper with direct file URLs for Node's TS module resolver.
const source = readFileSync(new URL('../src/lib/dictionary-workspace.ts',import.meta.url),'utf8')
  .replace(/from '(\.\/[^']+)'/g,(_,name)=>`from '${new URL('../src/lib/'+name.slice(2)+'.ts',import.meta.url).href}'`);
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { DEFAULT_TRAINING_SELECTION, trainingSelectionWords, learningLessonWords, trainingFromLesson, learningPosition } = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const card=(id,patch={})=>({id,german:id,article:'der',grammaticalNumber:'singular',level:'A1',sourceBook:'A',lessonNumber:1,dictionaryEntry:{isArchived:false,isFavorite:false,isDifficult:false,revision:'r'},...patch});
const words=[card('a'),card('b',{sourceBook:'B',lessonNumber:2}),card('shared',{bookSources:[{sourceBook:'B',lessonNumbers:[9]}]}),card('private',{personalBooks:['Private'],personalBookLessons:{Private:[4]}}),card('unfiled',{sourceBook:null,lessonNumber:null}),card('archived',{dictionaryEntry:{isArchived:true,isFavorite:true,isDifficult:true,revision:'r'}})];
const ids=rows=>rows.map(row=>row.id);

test('search fields cannot silently constrain the separate training selection',()=>{
  assert.deepEqual(ids(trainingSelectionWords(words,{...DEFAULT_TRAINING_SELECTION,query:'no match',sort:'za'})),['a','b','shared','private','unfiled']);
  assert.deepEqual(ids(trainingSelectionWords(words,{...DEFAULT_TRAINING_SELECTION,book:'book:b',lesson:'2'})),['b']);
});
test('book and lesson are matched as one source, including multiple shared sources',()=>{
  assert.deepEqual(ids(learningLessonWords(words,{book:'book:b',lesson:'9'})),['shared']);
  assert.deepEqual(ids(learningLessonWords(words,{book:'book:b',lesson:'1'})),[]);
  assert.deepEqual(ids(learningLessonWords(words,{book:'book:b',lesson:'all'})),['b','shared']);
});
test('learning requires an explicit book and lesson; private and unfiled words remain accessible',()=>{
  assert.deepEqual(learningLessonWords(words,{book:'',lesson:'all'}),[]);
  assert.deepEqual(learningLessonWords(words,{book:'book:a',lesson:''}),[]);
  assert.deepEqual(ids(learningLessonWords(words,{book:'book:private',lesson:'4'})),['private']);
  assert.deepEqual(ids(learningLessonWords(words,{book:'none',lesson:'none'})),['unfiled']);
});
test('training from a lesson clears unrelated old training constraints',()=>{
  const next=trainingFromLesson({book:'book:b',lesson:'9',view:'favorites',tag:'tag:old',level:'C2',article:'die'});
  assert.deepEqual(next,{...DEFAULT_TRAINING_SELECTION,book:'book:b',lesson:'9'});
  assert.deepEqual(ids(trainingSelectionWords(words,next)),['shared']);
});
test('personal advanced training filters retain difficult, favourite, tag, level and grammar support',()=>{
  const selected=card('selected',{personalTags:['Exam'],level:'B2',dictionaryEntry:{isArchived:false,isFavorite:true,isDifficult:true,revision:'r'}});
  const set=[...words,selected];
  assert.deepEqual(ids(trainingSelectionWords(set,{...DEFAULT_TRAINING_SELECTION,view:'difficult',tag:'tag:exam',level:'B2',article:'der'})),['selected']);
  assert.deepEqual(ids(trainingSelectionWords(set,{...DEFAULT_TRAINING_SELECTION,view:'favorites'})),['selected']);
});
test('lesson previews preserve personal card content, selected order, and all progress fields',()=>{
  const set=[card('z',{selectedTranslation:{language:'uk',text:'мій переклад'},knownCount:8,nextReviewAt:'2030-01-01'}),card('a')];
  const before=structuredClone(set),preview=learningLessonWords(set,{book:'book:a',lesson:'1'});
  assert.deepEqual(ids(preview),['z','a']);assert.equal(preview[0],set[0]);assert.deepEqual(set,before);
});
test('lesson navigation remains in range when cards are removed or archived',()=>{
  assert.equal(learningPosition(4,2),1);assert.equal(learningPosition(-1,2),0);assert.equal(learningPosition(2,0),0);
});
