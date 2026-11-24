import test from 'node:test';import assert from 'node:assert/strict';
import {OrganizationClient,organizationBooks,organizationTags,lessonNumbers,personalTagOptions,matchesPersonalTag,wordLessonNames,lessonDisplayName,articleCategory,matchesArticleCategory,neutralCardStyle} from '../src/lib/organization-client.ts';
const empty=()=>({wordId:'w',books:[],tags:[],bookRevision:null,tagsRevision:null,lessonNames:[],settingsRevision:null});
test('personal organization normalizes books, lesson numbers and tags without silently duplicating them',()=>{
 assert.deepEqual(lessonNumbers('4, 2; 2 1'),[1,2,4]);assert.deepEqual(organizationBooks([{title:'  My  book ',lessonNumbers:[3,1]}]),[{title:'My book',lessonNumbers:[1,3]}]);assert.deepEqual(organizationTags(['  Работа  и\tучеба ']),['Работа и учеба']);
 for(const value of ['0','10001','1.5','1-3'])assert.throws(()=>lessonNumbers(value));assert.throws(()=>organizationTags(['Exam','exam']));assert.throws(()=>organizationTags(['x'.repeat(41)]));assert.throws(()=>organizationBooks([{title:'Book',lessonNumbers:[1]},{title:' BOOK ',lessonNumbers:[2]}]));
});
test('organization uses private fixed endpoints, explicit revisions and normalized lesson names',async()=>{
 const controller=new AbortController(),calls=[];const result={...empty(),books:[{title:'My book',lessonNumbers:[1,3]}],tags:['Exam'],bookRevision:'b1',tagsRevision:'t1',lessonNames:[{book:'My book',lessonNumber:1,name:'Arbeit'}],settingsRevision:'s1'};
 const client=new OrganizationClient(async(p,i)=>{calls.push([p,i]);return Response.json(i.method?result:empty())});assert.deepEqual(await client.get('w',controller.signal),empty());
 assert.deepEqual(await client.save('w',empty(),[{title:' My book ',lessonNumbers:[3,1]}],[' Exam '],[{book:'My book',lessonNumber:1,name:' Arbeit '}]),result);
 assert.equal(calls[0][0],'/words/w/organization');assert.equal(calls[0][1].signal,controller.signal);assert.equal(calls[0][1].cache,'no-store');assert.deepEqual(JSON.parse(calls[1][1].body).lessonNameUpdates,[{book:'My book',lessonNumber:1,name:'Arbeit'}]);
});
test('organization rejects mismatched identities, malformed revisions and inconsistent API material',async()=>{
 for(const patch of [{wordId:'other'},{tags:['a','A']},{books:[{title:'B',lessonNumbers:[1,1]}]},{tagsRevision:'invalid revision'},{tags:['Exam']},{bookRevision:'r'},{lessonNames:[{book:'B',lessonNumber:0,name:'wrong'}]}])await assert.rejects(new OrganizationClient(async()=>Response.json({...empty(),...patch})).get('w'),e=>e.status===502);
 for(const status of [401,404,409,503])await assert.rejects(new OrganizationClient(async()=>new Response(null,{status})).get('w'),e=>e.status===status);
 assert.throws(()=>new OrganizationClient(async()=>{throw Error('not reached')}).get('../w'),e=>e.status===400);
});
test('personal names match a selected book and numbered lesson, including shared and private sources',()=>{
 const names=[{book:'Book',lessonNumber:2,name:'Arbeit'},{book:'Other',lessonNumber:2,name:'Reisen'}],word={sourceBook:'Book',lessonNumber:2,personalBooks:['Private'],personalBookLessons:{Private:[3]},personalTags:['Exam'],personalLessonNames:names};
 assert.deepEqual(wordLessonNames(word,names),[names[0]]);assert.equal(lessonDisplayName([word],'book:book',2),'Arbeit');assert.equal(lessonDisplayName([word],'',2),null);
 assert.equal(matchesPersonalTag(word,'tag:exam'),true);assert.equal(matchesPersonalTag(word,'none'),false);assert.equal(matchesPersonalTag({},'none'),true);assert.equal(matchesPersonalTag(word,''),true);assert.equal(matchesPersonalTag(word,'tag:other'),false);
 assert.equal(personalTagOptions([word,{personalTags:['exam']}],'').length,1);assert.equal(personalTagOptions([], 'tag:removed')[0].title,'removed');
});
test('unknown article and not-applicable article are distinct without converting either into a noun article',()=>{
 const unknown={article:'none',grammaticalNumber:'singular'},other={article:'none',grammaticalNumber:'not_applicable'};
 assert.equal(articleCategory(unknown),'unknown');assert.equal(articleCategory(other),'not_applicable');assert.equal(matchesArticleCategory(unknown,'unknown'),true);assert.equal(matchesArticleCategory(other,'unknown'),false);assert.equal(matchesArticleCategory(unknown,'der'),false);assert.equal(articleCategory({article:'die',grammaticalNumber:'plural'}),'plural');
});
test('custom neutral tint does not affect four reserved categories and always keeps a light background',()=>{
 for(const w of [{article:'der',grammaticalNumber:'singular'},{article:'das',grammaticalNumber:'singular'},{article:'die',grammaticalNumber:'singular'},{article:'none',grammaticalNumber:'plural'}])assert.deepEqual(neutralCardStyle(w,'#000000'),{});
 assert.match(neutralCardStyle({article:'none',grammaticalNumber:'singular'},'#000000').backgroundColor,/rgb\(235, 235, 235\)/);assert.deepEqual(neutralCardStyle({article:'none',grammaticalNumber:'singular'},'url(bad)'),{});
});
test('neutral color settings use revisions and permit a private reset to the default',async()=>{
 const calls=[],client=new OrganizationClient(async(p,i)=>{calls.push([p,i]);if(!i.method)return Response.json({neutralColor:null,revision:null});const body=JSON.parse(i.body);return Response.json({neutralColor:body.neutralColor?.toLowerCase()??null,revision:'s1'})});
 assert.equal((await client.settings()).neutralColor,null);assert.equal((await client.color('#12AB34',null)).neutralColor,'#12ab34');assert.equal((await client.color(null,'s1')).neutralColor,null);assert.equal(calls[1][0],'/dictionary-organization/settings');assert.equal(calls[1][1].method,'PATCH');await assert.rejects(client.color('red',null),e=>e.status===400);
});
