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

const {loadStudyBookStatistics} = await import('../src/lib/study-statistics-client.ts');
const bookFixture = (selection=null, page=1) => ({ days:30, from:'2026-10-24T12:00:00.000Z',to:'2026-11-23T12:00:00.000Z',
  scope:selection?'lessons':'books',book:selection?.book??null,page,pageSize:10,totalGroups:1,
  rows:[{sourceBook:selection?selection.book:'Book A',lessonNumber:selection?2:null,sessions:2,answers:3,known:1,needsReview:2,words:2}] });
test('book client requests private paginated statistics with safely encoded titles and optional cancellation',async()=>{
 const controller=new AbortController(),selected={book:'B1+ & A2'};
 await loadStudyBookStatistics(async(path,init)=>{assert.equal(path,'/study/statistics/books?days=30&page=1&book=B1%2B+%26+A2');assert.equal(init.cache,'no-store');assert.equal(init.signal,controller.signal);return Response.json(bookFixture(selected))},30,1,selected,controller.signal);
 await loadStudyBookStatistics(async(path)=>{assert.match(path,/unassigned=true/);return Response.json(bookFixture({book:null}))},30,1,{book:null});
 assert.equal((await loadStudyBookStatistics(async()=>Response.json(bookFixture()),30,1,null)).totalGroups,1);
});
test('book client rejects invalid scope, counts, titles, duplicates and pagination',async()=>{
 for(const mutate of [d=>d.days=7,d=>d.scope='lessons',d=>d.book='wrong',d=>d.page=2,d=>d.pageSize=100,d=>d.totalGroups=-1,d=>d.rows=[],
   d=>d.rows[0].words=4,d=>d.rows[0].words=0,d=>d.rows[0].known=9,d=>d.rows[0].sourceBook=' ',d=>d.rows[0].lessonNumber=1,
   d=>{d.totalGroups=2;d.rows.push({...d.rows[0],sourceBook:'BOOK A'})},d=>d.to='invalid']){
  const data=bookFixture();mutate(data);await assert.rejects(loadStudyBookStatistics(async()=>Response.json(data),30,1,null),e=>e.status===502);
 }
 for(const lessonNumber of [0,10001,1.5]){const d=bookFixture({book:'Book A'});d.rows[0].lessonNumber=lessonNumber;await assert.rejects(loadStudyBookStatistics(async()=>Response.json(d),30,1,{book:'Book A'}),e=>e.status===502)}
 const d=bookFixture({book:'Book A'});d.rows[0].sourceBook='Foreign private book';await assert.rejects(loadStudyBookStatistics(async()=>Response.json(d),30,1,{book:'Book A'}),e=>e.status===502);
});
test('book client accepts empty and out-of-range pages and distinguishes old API and failures',async()=>{
 const d={...bookFixture(),totalGroups:0,rows:[]};assert.deepEqual((await loadStudyBookStatistics(async()=>Response.json(d),30,1,null)).rows,[]);
 const out={...d,page:3,totalGroups:11};assert.equal((await loadStudyBookStatistics(async()=>Response.json(out),30,3,null)).totalGroups,11);
 for(const status of [401,404,501,503])await assert.rejects(loadStudyBookStatistics(async()=>new Response(null,{status}),30,1,null),e=>e.status===status);
 for(const [days,page,selection]of [[8,1,null],[30,0,null],[30,1,{book:' '}],[30,1,{book:'a'.repeat(121)}]])await assert.rejects(loadStudyBookStatistics(async()=>{throw Error('not reached')},days,page,selection),e=>e.status===400);
});
