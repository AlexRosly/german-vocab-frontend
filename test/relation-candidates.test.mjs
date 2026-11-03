import { test } from "node:test";
import assert from "node:assert/strict";
import { relationCandidates } from "../src/lib/relation-candidates.ts";
const word=(id,german="Lohn")=>({id,german,article:"der",grammaticalNumber:"singular",translations:[{language:"uk",text:"зарплата"}],notes:null,lessonNumber:null});
test("relation search excludes self and existing links, deduplicates statuses and searches all languages",()=>{
 const words=[word("self"),word("linked"),word("a"),word("a"),word("b","Gehalt")];
 assert.deepEqual(relationCandidates(words,"self",new Set(["linked"]),"зарплата").map(row=>row.id),["a","b"]);
 assert.deepEqual(relationCandidates(words,"self",new Set(),"der Lohn").map(row=>row.id),["linked","a"]);
 assert.deepEqual(relationCandidates(words,"self",new Set()," "),[]);
});
test("the editor limits results without changing the source catalog",()=>{
 const words=Array.from({length:50},(_,i)=>word(String(i)));
 assert.equal(relationCandidates(words,"source",new Set(),"Lohn").length,10);assert.equal(words.length,50);
});
