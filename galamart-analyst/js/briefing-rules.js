/* Calculations use rubles, checks, units, percentages and percentage points. */
((root) => {
  'use strict';
  const valid = Number.isFinite;
  const ratio = (a, b) => valid(a) && valid(b) && b > 0 ? a / b : null;
  const percent = (a, b) => ratio(valid(a) ? a * 100 : null, b);
  const sum = values => values.length && values.every(valid) ? values.reduce((a, b) => a + b, 0) : null;
  const delta = (fact, plan) => valid(fact) && valid(plan) ? fact - plan : null;
  const remaining = (fact, plan) => valid(delta(fact, plan)) ? Math.max(0, plan - fact) : null;
  const rubles = n => valid(n) ? n * 1000 : null;
  const markup = (profit, cost) => percent(profit, cost);
  const point = (series, day, kind) => series?.[kind]?.d[series.isoDates.indexOf(day)] ?? null;

  function shift(day, offset) {
    return new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  }
  function days(start, end) {
    const range = [];
    for (let day = start; day <= end; day = shift(day, 1)) range.push(day);
    return range;
  }
  function period(end, mode) {
    const monthStart = end.slice(0, 7) + '-01';
    const next = shift(monthStart, 32).slice(0, 7) + '-01';
    return { start: mode === 'week' ? shift(end, -6) : monthStart, end, monthStart, monthEnd: shift(next, -1) };
  }
  function metric(plan, fact) {
    return { plan, fact, achieved: percent(fact, plan), difference: delta(fact, plan), left: remaining(fact, plan) };
  }
  function dayMetrics(plan, fact, closed) {
    const to = metric(plan.to, fact.to);
    const checks = metric(plan.checks, fact.checks);
    const avg = metric(ratio(plan.to, plan.checks), ratio(fact.to, fact.checks));
    avg.left = !closed && checks.left > 0 ? ratio(to.left, checks.left) : null;
    return { to, checks, avg, vp: metric(plan.vp, fact.vp) };
  }
  function forecast({ monthEnd, end, today, fact, plan, elapsedPlan, official, completedFact }) {
    if (!(plan > 0)) return null;
    if (end === monthEnd && end < today) return percent(fact, plan);
    if (valid(official)) return percent(official, plan);
    return percent(end < today ? fact : completedFact, elapsedPlan);
  }
  function competition(rows, storeKey) {
    const comparable = [...new Map(rows.filter(row => valid(percent(row.result, row.plan)))
      .map(row => [row.key, row])).values()];
    const own = comparable.find(row => row.key === storeKey);
    if (!own || comparable.length < 2) return null;
    const score = row => percent(row.result, row.plan);
    const rankScore = row => Math.round(score(row) * 10);
    const reference = group => group.length > 1
      ? percent(sum(group.map(row => row.result)), sum(group.map(row => row.plan))) : null;
    const region = comparable.filter(row => own.region && row.region === own.region);
    return {
      rank: 1 + comparable.filter(row => rankScore(row) > rankScore(own)).length,
      count: comparable.length,
      own: score(own),
      network: reference(comparable),
      regional: reference(region),
      regionCount: region.length
    };
  }
  function consistent(a, b, tolerance) {
    return !valid(a) || !valid(b) || Math.abs(a - b) <= tolerance;
  }
  function skuReport(metrics, start, end, excludedDates = new Set()) {
    if (!metrics?.skuMetrics.length) return null;
    const first = start > metrics.startDate ? start : metrics.startDate;
    const last = end < metrics.endDate ? end : metrics.endDate;
    const dates = days(first, last);
    if (!dates.length) return null;
    const byDay = new Map(metrics.dailySeries.map(row => [row.date, row]));
    const covered = dates.every(day => !excludedDates.has(day) && byDay.get(day)?.imported && metrics.storeChecksByDate[day] > 0);
    const factPenetration = covered
      ? percent(sum(dates.map(day => byDay.get(day).units)), sum(dates.map(day => metrics.storeChecksByDate[day]))) : null;
    const target = metrics.totals.targetPenetration;
    const items = metrics.skuMetrics.filter(sku => sku.skuDates.includes(end)).map(sku => ({
      name: sku.name, units: excludedDates.has(end) ? null : sku.skuDailySeries.find(row => row.date === end)?.units ?? null,
      plan: sku.plan > 0 ? sku.plan / sku.skuDates.length : null
    }));
    const budget = sum(items.map(row => row.plan));
    return {
      target, factPenetration, gap: delta(factPenetration, target), first, last, items,
      day: metric(valid(budget) ? Math.ceil(budget - 1e-9) : null, sum(items.map(row => row.units)))
    };
  }

  function status(value, good, watch) {
    if (!valid(value)) return 'unknown';
    return value >= good ? 'good' : value >= watch ? 'watch' : 'bad';
  }
  function priorities({ pace, day, closed, kpi, sku }, thresholds) {
    const cutoff = thresholds.watch;
    const items = [];
    const suggest = (score, text) => items.push({ score, text });
    const least = values => values.some(valid) ? Math.min(...values.filter(valid)) : null;
    const checks = least([closed ? day.checks.achieved : null, pace.checks]);
    const to = least([closed ? day.to.achieved : null, pace.to]);
    const vp = closed && valid(day.vp.achieved) ? day.vp.achieved : null;
    if (valid(checks) && checks < cutoff) suggest(100 - checks, 'Отстаём по чекам. Усиливаем конверсию покупателей.');
    const profitGap = delta(kpi?.to.achieved, kpi?.vp.achieved);
    if (valid(vp) && vp < cutoff && day.to.achieved >= thresholds.good) {
      suggest(100 - vp, 'ТО на уровне цели, ВП отстаёт. Контролируем структуру продаж.');
    } else if (pace.to >= thresholds.good && valid(profitGap) && profitGap > 100 - cutoff && kpi.vp.achieved < cutoff) {
      suggest(profitGap, 'ВП отстаёт от темпа ТО. Контролируем структуру продаж.');
    }
    if (valid(to) && to < cutoff) suggest(100 - to, 'ТО отстаёт. Усиливаем допродажи и работу со средним чеком.');
    const penetration = percent(sku?.factPenetration, sku?.target);
    if (valid(penetration) && penetration < cutoff) suggest(100 - penetration, '3SKU ниже цели. Предлагаем акционные товары каждому покупателю.');
    return items.sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.text);
  }

  const rules = { valid, percent, ratio, sum, delta, rubles, markup, point, days, shift, period,
    metric, dayMetrics, forecast, competition, consistent, skuReport, status, priorities };
  if (typeof module === 'object') module.exports = rules;
  else root.BriefingRules = rules;
})(typeof window === 'object' ? window : globalThis);
