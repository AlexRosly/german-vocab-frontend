import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookOptions, bookFilterOptions, matchesBook, normalizeTitles, PersonalBooksClient } from '../src/lib/word-books.ts';

test('book filters combine source and private titles without changing CEFR or the filtered order', () => {
  const words = [
    { id:'a',sourceBook:'B1+ Brückenkurs',personalBooks:['A1 Treffpunkt'],level:'B1' },
    { id:'b',sourceBook:' b1+   brückenkurs ',personalBooks:[],level:'A2' },
    { id:'c',sourceBook:null,personalBooks:[],level:'C1' },
  ];
  assert.deepEqual(bookOptions(words).map(b=>b.title),['A1 Treffpunkt','B1+ Brückenkurs']);
  assert.deepEqual(words.filter(w=>matchesBook(w,'book:b1+ brückenkurs')).map(w=>w.id),['a','b']);
  assert.deepEqual(words.filter(w=>matchesBook(w,'book:a1 treffpunkt')).map(w=>w.id),['a']);
  assert.deepEqual(words.filter(w=>matchesBook(w,'none')).map(w=>w.id),['c']);
  assert.equal(words.filter(w=>matchesBook(w,'')).length,3);
  assert.equal(words[0].level,'B1');
});
test('book normalization rejects duplicates, empty rows, oversize titles and control characters', () => {
  assert.deepEqual(normalizeTitles([' A1   Treffpunkt ','B1+ Brückenkurs']),['A1 Treffpunkt','B1+ Brückenkurs']);
  for(const titles of [['A1 Book',' a1  book '],[' '],['x'.repeat(121)],['x\0'],[null],Array.from({length:21},(_,i)=>'Book '+i)]) assert.throws(()=>normalizeTitles(titles));
  assert.deepEqual(normalizeTitles([]),[]);
});
test('personal books client sends only its own relative path, normalized titles and revision; a conflict is not retried', async () => {
  const calls=[];
  const client=new PersonalBooksClient(async(path,init)=>{calls.push({path,init});return calls.length===1 ? Response.json({wordId:'word-1',titles:['A1 Book'],revision:'r1'}) : Response.json({}, {status:409});});
  const abort=new AbortController();
  const saved=await client.save('word-1',[' A1   Book '],null,abort.signal);
  assert.deepEqual(saved,{wordId:'word-1',titles:['A1 Book'],revision:'r1'});
  assert.equal(calls[0].path,'/words/word-1/personal-books');assert.equal(calls[0].init.signal,abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body),{titles:['A1 Book'],revision:null});
  await assert.rejects(client.save('word-1',[],saved.revision),error=>error.status===409);
  assert.equal(calls.length,2);
});
test('personal book responses cannot confirm another card, malformed revision, unexpected clearing or changed titles', async () => {
  for(const body of [null,{wordId:'other',titles:[],revision:null},{wordId:'word-1',titles:['Book'],revision:null},{wordId:'word-1',titles:[],revision:'r1'},{wordId:'word-1',titles:['Book','book'],revision:'r1'}]) {
    const client=new PersonalBooksClient(async()=>Response.json(body)); await assert.rejects(client.get('word-1'));
  }
  const client=new PersonalBooksClient(async()=>Response.json({wordId:'word-1',titles:['Unexpected'],revision:'r1'}));
  await assert.rejects(client.save('word-1',['Requested'],null),error=>error.status===502);
});
test('empty private book associations clear cleanly and invalid paths never reach the transport', async () => {
  let calls=0; const client=new PersonalBooksClient(async()=>{calls++;return Response.json({wordId:'word-1',titles:[],revision:null});});
  assert.deepEqual(await client.save('word-1',[],'old-revision'),{wordId:'word-1',titles:[],revision:null});
  for(const id of ['../other','https://other.example','x?user=other']) await assert.rejects(client.get(id));
  assert.equal(calls,1);
});

test('an emptied selected book remains represented rather than displaying an unfiltered selector', () => {
  const selected='book:a1 treffpunkt';
  assert.deepEqual(bookFilterOptions([],selected),[{key:selected,title:'a1 treffpunkt'}]);
  assert.equal(matchesBook({sourceBook:'B1+ Brückenkurs'},selected),false);
  assert.deepEqual(bookFilterOptions([],''),[]);
});

test("library filters combine book and lesson and retain empty lessons without changing the source", async () => {
 const { filterLibraryWords, libraryLessons } = await import("../src/lib/word-books.ts");
 const words = [
  { id: "a", sourceBook: "A1 Treffpunkt", lessonNumber: 15 },
  { id: "b", sourceBook: "A1 Treffpunkt", lessonNumber: 16 },
  { id: "c", sourceBook: "B1+ Brückenkurs", lessonNumber: 15 },
  { id: "d", sourceBook: null, lessonNumber: null },
 ];
 const before = structuredClone(words);
 assert.deepEqual(filterLibraryWords(words, "book:a1 treffpunkt", "15").map(w => w.id), ["a"]);
 assert.deepEqual(filterLibraryWords(words, "", "15").map(w => w.id), ["a", "c"]);
 assert.deepEqual(filterLibraryWords(words, "none", "none").map(w => w.id), ["d"]);
 assert.deepEqual(filterLibraryWords(words, "book:a1 treffpunkt", "99"), []);
 assert.deepEqual(libraryLessons(words, "book:a1 treffpunkt", "99"), [15, 16, 99]);
 assert.deepEqual(words, before);
});
