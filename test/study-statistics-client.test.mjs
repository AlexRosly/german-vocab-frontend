import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStudyStatistics, STATISTICS_MODES } from '../src/lib/study-statistics-client.ts';
const fixture = () => ({ days: 30, from: '2026-10-22T12:00:00.000Z', to: '2026-11-21T12:00:00.000Z', totals: { sessions: 2, answers: 4, known: 3, needsReview: 1 },
  byMode: STATISTICS_MODES.map(mode => ({ mode, sessions: mode === null ? 2 : 0, answers: mode === null ? 4 : 0, known: mode === null ? 3 : 0, needsReview: mode === null ? 1 : 0 })) });
test('requests only aggregate personal statistics, forwards cancellation and accepts old unknown modes', async () => {
  const controller = new AbortController();
  const data = await loadStudyStatistics(async (url, options) => {
    assert.equal(url, '/study/statistics?days=30'); assert.equal(options.cache, 'no-store'); assert.equal(options.signal, controller.signal);
    return Response.json(fixture());
  }, 30, controller.signal);
  assert.equal(data.byMode.at(-1).mode, null); assert.equal(data.totals.answers, 4);
});
test('rejects bad totals, mode duplication, malformed dates, changed periods and impossible counts', async () => {
  for (const mutate of [x => x.totals.known++, x => x.byMode[1].mode = 'forward', x => x.from = 'bad', x => x.days = 7,
    x => x.totals.answers = -1, x => x.byMode.pop(), x => { x.totals.sessions = x.byMode[5].sessions = 5; }]) {
    const data = fixture(); mutate(data); await assert.rejects(loadStudyStatistics(async () => Response.json(data), 30), e => e.status === 502);
  }
});
test('supports no data and old servers, and preserves cancellation and retryable errors', async () => {
  const data = fixture(); data.totals = { sessions: 0, answers: 0, known: 0, needsReview: 0 }; data.byMode = STATISTICS_MODES.map(mode => ({ mode, ...data.totals }));
  assert.equal((await loadStudyStatistics(async () => Response.json(data), 30)).totals.answers, 0);
  for (const status of [401, 404, 501, 503]) await assert.rejects(loadStudyStatistics(async () => new Response('', { status }), 30), e => e.status === status);
  const reason = new DOMException('cancelled', 'AbortError'); await assert.rejects(loadStudyStatistics(async () => { throw reason; }, 7), e => e === reason);
  await assert.rejects(loadStudyStatistics(async () => { throw Error('must not fetch'); }, 31), e => e.status === 400);
});
