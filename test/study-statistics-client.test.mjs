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

import { statisticsDates, statisticsDayLabel, dailyActivityLevel } from '../src/lib/study-statistics-client.ts';
const activityFixture = () => {
  const data = fixture(), dates = statisticsDates('Europe/Berlin', data.from, data.to);
  data.activity = { timeZone: 'Europe/Berlin', activeDays: 1, days: dates.map((date, i) => ({ date, ...(i === 0 ? data.totals : { sessions: 0, answers: 0, known: 0, needsReview: 0 }) })) };
  return data;
};
test('daily activity accepts zero-filled dates, keeps old summaries compatible, and reconciles all counters', async () => {
  const data = activityFixture();
  const received = await loadStudyStatistics(async () => Response.json(data), 30);
  assert.equal(received.activity.activeDays, 1); assert.equal(received.activity.days.length, 31);
  assert.equal(received.activity.days.at(-1).answers, 0);
  assert.equal((await loadStudyStatistics(async () => Response.json(fixture()), 30)).activity, undefined);
});
test('rejects malformed activity without silently converting missing data to zeros', async () => {
  for (const mutate of [d => d.activity = null, d => d.activity.timeZone = 'Mars/Test', d => d.activity.activeDays++,
    d => d.activity.days.pop(), d => d.activity.days.reverse(), d => d.activity.days[0].date = '2026-02-31',
    d => d.activity.days[0].sessions = -1, d => { d.activity.days[0].answers++; d.activity.days[0].known++; },
    d => { d.activity.days[0].date = d.activity.days[1].date; }]) {
    const data = activityFixture(); mutate(data);
    await assert.rejects(loadStudyStatistics(async () => Response.json(data), 30), e => e.status === 502);
  }
});
test('calendar labels remain on the stored date and DST windows can contain nine dates for seven elapsed days', () => {
  const to = '2026-03-29T22:30:00.000Z', from = new Date(Date.parse(to) - 7 * 86400000).toISOString();
  assert.equal(statisticsDates('Europe/Berlin', from, to).length, 9);
  assert.deepEqual(statisticsDates('Asia/Kathmandu', '2026-11-01T18:14:59.000Z', '2026-11-01T18:15:00.000Z'), ['2026-11-01', '2026-11-02']);
  assert.deepEqual(statisticsDates('Europe/Berlin', '2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'), ['2026-10-25']);
  assert.equal(statisticsDayLabel('2026-11-21', 'en-GB'), '21 Nov 2026');
  assert.equal(dailyActivityLevel(0, 10), 0); assert.equal(dailyActivityLevel(1, 10), 1); assert.equal(dailyActivityLevel(5, 10), 2); assert.equal(dailyActivityLevel(10, 10), 3);
});
