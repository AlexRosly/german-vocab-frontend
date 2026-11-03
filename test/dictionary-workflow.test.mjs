import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleTrainingWords, saveTrainingAnswers } from '../src/lib/dictionary-training.ts';
import { DraftRelationsClient } from '../src/lib/draft-relations-client.ts';

const card = (id, text = id) => ({ id, german: text, article: 'none', selectedTranslation: { language: 'en', text: null } });
const answers = count => Array.from({ length: count }, (_, i) => ({ wordId: `word-${i}`, answer: i % 2 ? 'KNOWN' : 'NEEDS_REVIEW' }));
const ok = data => Response.json(data);

test('new/review queues respect all dictionary filters and retain personal translations and selected order', () => {
  const local = [{ ...card('c'), selectedTranslation: { language: 'en', text: 'my meaning' } }, card('a')];
  assert.deepEqual(eligibleTrainingWords(local, [card('a'), card('b'), card('c'), card('foreign')]), local);
  assert.deepEqual(eligibleTrainingWords([], [card('a')]), []);
  assert.deepEqual(eligibleTrainingWords(local, []), []);
});

test('785 selected words are saved completely as 500 and 285 answers with distinct keys', async () => {
  const calls = [];
  await saveTrainingAnswers(async (path, init) => { calls.push({ path, key: init.headers['Idempotency-Key'], body: JSON.parse(init.body) }); return ok({ id: 'session' }); }, answers(785), 'stable-request');
  assert.deepEqual(calls.map(row => row.body.totalWords), [500, 285]);
  assert.deepEqual(calls.flatMap(row => row.body.words), answers(785));
  assert.deepEqual(calls.map(row => row.key), ['stable-request:0', 'stable-request:1']);
  assert.ok(calls.every(row => row.path === '/study/sessions'));
});

test('500 and 501 word boundaries keep every answer and never send an empty session', async () => {
  for (const size of [1, 500, 501, 1000, 1001]) {
    const chunks = [];
    await saveTrainingAnswers(async (_path, init) => { chunks.push(JSON.parse(init.body)); return ok({}); }, answers(size), 'request-key');
    assert.equal(chunks.reduce((n, chunk) => n + chunk.totalWords, 0), size);
    assert.ok(chunks.every(chunk => chunk.totalWords > 0 && chunk.totalWords <= 500));
  }
});

test('a partial failure stops writes; manual retry replays identical keys/bodies without duplicating server progress', async () => {
  const committed = new Map(), calls = []; let fail = true;
  const fetcher = async (_path, init) => {
    const key = init.headers['Idempotency-Key']; calls.push([key, init.body]);
    if (key.endsWith(':1') && fail) { fail = false; return okError(); }
    if (committed.has(key)) assert.equal(committed.get(key), init.body);
    committed.set(key, init.body); return ok({});
  };
  const okError = () => Response.json({ message: 'temporary failure' }, { status: 503 });
  await assert.rejects(saveTrainingAnswers(fetcher, answers(1001), 'same-key'));
  assert.equal(calls.length, 2); assert.equal(committed.size, 1);
  await saveTrainingAnswers(fetcher, answers(1001), 'same-key');
  assert.equal(committed.size, 3);
  assert.deepEqual(calls[0], calls[2]); assert.deepEqual(calls[1], calls[3]);
  assert.equal([...committed.values()].flatMap(body => JSON.parse(body).words).length, 1001);
});

test('network failures do not retry automatically and invalid answer lists never write', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new TypeError('offline'); };
  await assert.rejects(saveTrainingAnswers(fetcher, answers(785), 'request-key'));
  assert.equal(calls, 1);
  await assert.rejects(saveTrainingAnswers(fetcher, [], 'request-key'));
  await assert.rejects(saveTrainingAnswers(fetcher, [answers(1)[0], answers(1)[0]], 'request-key'));
  assert.equal(calls, 1);
});

test('relation search combines published results with own cards and encodes query without duplicate IDs', async () => {
  let call;
  const client = new DraftRelationsClient(async (path, init) => { call = { path, init }; return ok([card('a', 'Gehalt')]); });
  const own = [{ ...card('a', 'Gehalt'), selectedTranslation: { language: 'en', text: 'private meaning' } }, card('b', 'Gehaltserhöhung'), card('c', 'Baum')];
  const abort = new AbortController();
  assert.deepEqual((await client.search(' Gehalt ', own, abort.signal)).map(row => row.id), ['a', 'b']);
  assert.equal(call.path, '/words?q=Gehalt'); assert.equal(call.init.signal, abort.signal);
  assert.equal((await client.search('Gehalt', own))[0].selectedTranslation.text, 'private meaning');
  await client.search('a&b?#', []); assert.equal(call.path, '/words?q=a%26b%3F%23');
});

test('empty relation search skips the API and failed or malformed results remain errors', async () => {
  let calls = 0;
  const empty = new DraftRelationsClient(async () => { calls++; return ok([]); });
  assert.deepEqual(await empty.search(' ', []), []); assert.equal(calls, 0);
  for (const response of [Response.json({}, { status: 500 }), ok([card('bad/id')]), ok([{ ...card('a'), id: undefined }]), ok([{ ...card('a'), selectedTranslation: null }]), ok({ rows: [] })]) {
    const client = new DraftRelationsClient(async () => response);
    await assert.rejects(client.search('a', [card('a')]));
  }
});
