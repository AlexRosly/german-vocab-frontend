import { test } from "node:test";
import assert from "node:assert/strict";
import { moderationQueue, adjacentModerationWord } from "../src/lib/moderation-queue.ts";
const card = (id, extra={}) => ({ id, german: "Baum", article: "der", grammaticalNumber: "singular", translations: [{language:"ru",text:"дерево"},{language:"en",text:"tree"}], pluralForm:"Bäume", notes:null, lessonNumber:1, ...extra });
test("search covers all translations, plurals and shared notes without mutating server order",()=>{
 const words=[card("a"),card("b",{german:"Haus",translations:[{language:"uk",text:"будинок"}],pluralForm:"Häuser",notes:"Zu Hause",lessonNumber:2})];
 for(const q of [" TREE ","ДЕРЕВО","Bäume"])assert.deepEqual(moderationQueue(words,q,"all",0).items.map(x=>x.id),["a"]);
 assert.deepEqual(moderationQueue(words,"будинок","all",0).items.map(x=>x.id),["b"]);
 assert.deepEqual(moderationQueue(words,"zu Hause","all",0).items.map(x=>x.id),["b"]);
 assert.deepEqual(words.map(x=>x.id),["a","b"]);
});
test("lesson and text filters intersect and unsupported searches stay empty",()=>{
 const words=[card("a"),card("b",{lessonNumber:2}),card("c",{lessonNumber:null})];
 assert.deepEqual(moderationQueue(words,"tree","2",0).items.map(x=>x.id),["b"]);
 assert.equal(moderationQueue(words,"[tree]","all",0).matches.length,0);
 assert.equal(moderationQueue(words,"tree","3",0).matches.length,0);
});
test("pages keep all 785 results searchable and clamp after the last page shrinks",()=>{
 const words=Array.from({length:785},(_,i)=>card(String(i),{german:"Wort "+i}));
 const last=moderationQueue(words,"","all",26);assert.equal(last.pages,27);assert.equal(last.items.length,5);assert.equal(last.items[0].id,"780");
 const filtered=moderationQueue(words,"Wort 784","all",26);assert.equal(filtered.page,0);assert.equal(filtered.items.length,1);assert.equal(filtered.items[0].id,"784");
 assert.equal(moderationQueue(words.slice(0,780),"","all",26).page,25);
});
test("navigation crosses page boundaries but never wraps or invents a missing selection",()=>{
 const words=Array.from({length:32},(_,i)=>card(String(i)));
 assert.equal(adjacentModerationWord(words,"29",1),"30");assert.equal(adjacentModerationWord(words,"30",-1),"29");
 assert.equal(adjacentModerationWord(words,"0",-1),null);assert.equal(adjacentModerationWord(words,"31",1),null);assert.equal(adjacentModerationWord(words,"missing",1),null);
});
