const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../galamart-analyst/js/briefing-rules');

test('daily amounts, markup and average check use consistent bases', () => {
  const plan = { to: 10000, checks: 20, vp: 4000 };
  const fact = { to: 4000, checks: 12, vp: 1800 };
  const active = R.dayMetrics(plan, fact, false);
  assert.equal(active.to.left, 6000);
  assert.equal(active.vp.achieved, 45);
  assert.equal(active.checks.left, 8);
  assert.equal(active.avg.plan, 500);
  assert.equal(active.avg.fact, 4000 / 12);
  assert.equal(active.avg.left, 750);
  assert.equal(R.markup(4000, 6000), 400000 / 6000);
  assert.equal(R.delta(R.markup(1800, 2200), R.markup(4000, 6000)), 180000 / 2200 - 400000 / 6000);
  assert.equal(R.dayMetrics(plan, fact, true).avg.left, null);
  assert.equal(R.dayMetrics(plan, { ...fact, checks: 21 }, false).avg.left, null);
  assert.equal(R.dayMetrics(plan, { ...fact, checks: null }, false).checks.fact, null);
  assert.equal(R.dayMetrics(plan, { to: 0, checks: 0, vp: 0 }, false).to.achieved, 0);
});

test('month balance, nonuniform calendar pace, forecast, and execution above 100%', () => {
  const settings = { monthEnd: '2026-11-30', end: '2026-11-02', today: '2026-11-03', fact: 450, plan: 1200,
    elapsedPlan: R.sum([100, 260]) };
  assert.equal(R.forecast(settings), 125);
  assert.equal(R.forecast({ ...settings, official: 1500 }), 125);
  assert.equal(R.forecast({ ...settings, today: settings.end }), null);
  assert.equal(R.forecast({ ...settings, today: settings.end, completedFact: 324 }), 90);
  assert.equal(R.forecast({ ...settings, end: settings.monthEnd, today: '2026-12-01', fact: 1800, official: 1300 }), 150);
  assert.equal(R.metric(settings.plan, settings.fact).left, 750);
  assert.equal(R.metric(100, 124).achieved, 124);
  assert.equal(R.metric(100, 124).left, 0);
  assert.equal(R.metric(100, null).left, null);
  assert.equal(R.sum([100, null]), null);
  assert.deepEqual(R.period('2024-03-02', 'week'), {
    start: '2024-02-25', end: '2024-03-02', monthStart: '2024-03-01', monthEnd: '2024-03-31'
  });
});

test('3SKU uses units per 100 checks and refuses incomplete numerator or denominator coverage', () => {
  const day1 = '2026-11-01';
  const day2 = '2026-11-02';
  const dailySeries = [{ date: day1, imported: true, units: 4 }, { date: day2, imported: true, units: 3 }];
  const metrics = { startDate: day1, endDate: day2, dailySeries, storeChecksByDate: { [day1]: 30, [day2]: 20 },
    totals: { targetPenetration: 20 }, skuMetrics: [
      { name: 'Товар', skuDates: [day1, day2], plan: 10, skuDailySeries: dailySeries }
    ] };
  const actual = R.skuReport(metrics, day1, day2);
  assert.equal(actual.factPenetration, 14);
  assert.equal(actual.gap, -6);
  assert.deepEqual(actual.day, { plan: 5, fact: 3, achieved: 60, difference: -2, left: 2 });
  assert.equal(R.skuReport({ ...metrics, storeChecksByDate: { [day1]: 30 } }, day1, day2).factPenetration, null);
  assert.equal(R.skuReport(metrics, '2026-11-03', '2026-11-04'), null);
  assert.equal(R.skuReport(metrics, day1, day2, new Set([day2])).day.fact, null);
});

test('priorities use significant, evidenced deviations and configurable thresholds', () => {
  const view = { pace: { to: 99, checks: 98 }, day: R.dayMetrics({}, {}, false), closed: false,
    sku: { factPenetration: 3, target: 10 } };
  assert.match(R.priorities(view, { good: 100, watch: 90 })[0], /3SKU/);
  assert.equal(R.priorities({ ...view, sku: null }, { good: 100, watch: 90 }).length, 0);
  assert.equal(R.priorities({ ...view, sku: null }, { good: 100, watch: 99 }).length, 1);
});

test('store ranking gives equal places and weights network and region by monthly plans', () => {
  const rows = [
    { key: 'a', region: 'x', result: 120, plan: 100 },
    { key: 'b', region: 'x', result: 1080, plan: 1200 },
    { key: 'c', region: 'y', result: 240, plan: 200 },
    { key: 'd', region: 'y', result: 151, plan: 100 },
    { key: 'excluded', result: 500, plan: null }
  ];
  assert.deepEqual(R.competition([...rows, rows[0]], 'a'), {
    rank: 2, count: 4, own: 120, network: 159100 / 1600,
    regional: 120000 / 1300, regionCount: 2
  });
  assert.equal(R.competition(rows, 'c').rank, 2);
  assert.equal(R.competition(rows, 'excluded'), null);
  assert.equal(R.competition(rows.slice(0, 1), 'a'), null);
});
