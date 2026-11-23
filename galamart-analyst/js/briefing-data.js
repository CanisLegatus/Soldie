/* Adapt the already loaded Vision, Meeting and 3SKU datasets. */
(() => {
  const R = BriefingRules;
  const keyOf = VisionMeeting.storeKey;
  const covers = (source, date) => source?.period && source.period.start <= date && date <= source.period.end;
  const exact = (source, start, end) => source?.period?.start === start && source?.period?.end === end;
  const near = (a, b, tolerance) => R.consistent(a, b, tolerance);
  const storeNames = name => [name, name.replace(/\s*\([^)]*\)\s*$/, ''), name.match(/\(([^)]*)\)\s*$/)?.[1]].map(keyOf);

  function sources() {
    const vision = VisionMeeting.current();
    return [...(window.MeetingReport?.briefingSources() || []), {
      stats: vision.stores, plan: vision.plan, statsSource: vision.statsSource, planSource: vision.planSource
    }];
  }

  function storesFrom(imports) {
    const stores = new Map();
    function add(name, region) {
      const key = keyOf(name);
      if (!key) return;
      const previous = stores.get(key);
      stores.set(key, { key, name: previous?.name || name, region: previous?.region || region || '' });
    }
    for (const source of imports) {
      for (const row of source.stats || []) add(row.name, row.region);
      for (const group of [source.plan?.dailyTO, source.plan?.dailyChk]) {
        for (const [key, row] of Object.entries(group || {})) add(row.name || key, row.region);
      }
      for (const key of Object.keys(source.plan?.rating || {})) add(key);
      for (const key of Object.keys(source.plan?.tn || {})) add(key);
      for (const key of Object.keys(source.planSource?.daily || {})) add(key);
    }
    const sku = window.sku3Api?.getSettings();
    if (keyOf(sku?.storeName) !== 'магазин' && sku?.skus?.some(row => row.enabled !== false && row.articles?.length)) add(sku.storeName);
    return [...stores.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  function build({ imports, stores, store, end, today, mode, order, thresholds, skuMetrics, skuImports }) {
    const range = R.period(end, mode);
    const { start, monthStart, monthEnd } = range;
    const closed = end < today;
    const notes = new Set();
    const used = new Map();
    const remember = (label, source) => used.set(JSON.stringify([label, source.name, source.period, source.importedAt]), { ...source, label });
    const use = (label, source, value) => {
      if (R.valid(value) && source) remember(label, source);
      return value ?? null;
    };
    const stats = imports.filter(entry => entry.stats?.some(row => keyOf(row.name) === store.key));
    const plans = imports.filter(entry => entry.plan);
    const series = (entry, metric) => entry.plan[metric === 'to' ? 'dailyTO' : 'dailyChk']?.[store.key];
    const statsAt = (first, last) => stats.find(entry => exact(entry.statsSource, first, last));
    const planAt = (first, last) => plans.find(entry => exact(entry.planSource, first, last) &&
      (entry.plan.rating?.[store.key] || series(entry, 'to') || series(entry, 'checks') || entry.plan.tn?.[store.key]));
    const statsFor = (entry, field) => entry?.stats.find(row => keyOf(row.name) === store.key)?.[field] ?? null;

    function dayInput(date, metric, kind, track = true, onSource) {
      const calendar = metric !== 'vp';
      const byDate = (a, b) => {
        const score = entry => entry.planSource?.period?.end === date ? 0 : 1;
        return score(a) - score(b);
      };
      for (const entry of [...plans].sort(byDate)) {
        const source = entry.planSource;
        if (kind === 'fact' && !covers(source, date)) continue;
        if (!calendar && !covers(source, date)) continue;
        const value = calendar ? R.point(series(entry, metric), date, kind)
          : entry.planSource?.daily[store.key]?.[date]?.[kind === 'plan' ? 'planVP' : 'vp'];
        if (!R.valid(value)) continue;
        onSource?.(source);
        const converted = metric === 'checks' ? value : R.rubles(value);
        const label = kind === 'plan' ? 'Календарь' : calendar ? 'План-факт' : 'Продажи';
        return track ? use(label, source, converted) : converted;
      }
      return null;
    }
    function statsDay(date, field, track = true, onSource) {
      for (const entry of stats) {
        const source = entry.statsSource;
        if (!covers(source, date)) continue;
        const row = source.daily[store.key]?.[date];
        const value = field === 'checks' ? row?.checks : R.rubles(row?.[field]);
        if (R.valid(value)) {
          onSource?.(source);
          return track ? use('Статистика', source, value) : value;
        }
      }
      return null;
    }

    function dayValues(date, track = true) {
      const plan = {};
      const fact = {};
      const factSources = {};
      for (const metric of ['to', 'checks', 'vp']) {
        const primary = dayInput(date, metric, 'fact', false);
        const alternate = statsDay(date, metric, false);
        plan[metric] = dayInput(date, metric, 'plan', track)
          ?? (metric === 'vp' ? statsDay(date, 'planVP', track) : null);
        if (track && !near(primary, alternate, metric === 'checks' ? 0 : 1)) {
          notes.add('Дневные факты выгрузок расходятся.');
        }
        const trackSource = source => { factSources[metric] = source; };
        fact[metric] = metric === 'vp'
          ? statsDay(date, metric, track, trackSource) ?? dayInput(date, metric, 'fact', track, trackSource)
          : dayInput(date, metric, 'fact', track, trackSource) ?? statsDay(date, metric, track, trackSource);
      }
      return { plan, fact, factSources };
    }

    const monthStats = statsAt(monthStart, end);
    const monthPlan = planAt(monthStart, end);
    const monthDays = R.days(monthStart, monthEnd);
    const elapsed = R.days(monthStart, end);
    const completed = closed ? elapsed : elapsed.slice(0, -1);
    const monthId = monthStart.slice(0, 7);
    function fullPlan(metric) {
      const field = { to: 'planTO', vp: 'planVP', checks: 'planChecks' }[metric];
      const candidate = monthStats || stats.find(entry => entry.statsSource?.period?.start === monthStart &&
        entry.statsSource.period.end <= monthEnd);
      const fromStats = statsFor(candidate, field);
      const fromSheet = metric === 'vp' ? null : plans.find(entry => series(entry, metric)?.monthly?.[monthId]?.plan != null);
      const workbookPlan = R.sum(monthDays.map(date => dayInput(date, metric, 'plan', false)));
      const scaled = metric === 'checks' ? fromStats : R.rubles(fromStats);
      const stated = series(fromSheet || { plan: {} }, metric)?.monthly?.[monthId]?.plan;
      const fromCalendarTotal = metric === 'checks' ? stated : R.rubles(stated);
      if (!near(scaled, fromCalendarTotal, metric === 'checks' ? 1 : 100)) notes.add('Месячные планы выгрузок расходятся.');
      if (R.valid(scaled)) return use('План месяца', candidate?.statsSource, scaled);
      if (R.valid(fromCalendarTotal) && metric !== 'vp') return use('Календарь', fromSheet.planSource, fromCalendarTotal);
      const ratingField = metric === 'to' ? 'forecastPlanTO' : 'forecastPlanVP';
      const ratingEntry = metric === 'checks' ? null : plans.find(entry => entry.planSource?.period?.start === monthStart &&
        entry.planSource.period.end <= monthEnd && R.valid(entry.plan.rating?.[store.key]?.[ratingField]));
      const official = R.rubles(ratingEntry?.plan.rating?.[store.key]?.[ratingField]);
      if (R.valid(official)) return use('План месяца', ratingEntry.planSource, official);
      if (R.valid(workbookPlan)) monthDays.forEach(date => dayInput(date, metric, 'plan'));
      return workbookPlan;
    }

    function totals(first, last, includeCost = false) {
      if (first > last) return {};
      const entry = statsAt(first, last);
      const ratingEntry = first === monthStart ? planAt(first, last) : null;
      const dates = R.days(first, last);
      const calendar = dates.map(date => dayValues(date, false));
      const total = {};
      for (const metric of includeCost ? ['to', 'vp', 'checks', 'cost'] : ['to', 'vp', 'checks']) {
        const value = statsFor(entry, metric === 'cost' ? 'ss' : metric);
        const stated = metric === 'checks' ? value : R.rubles(value);
        const fromCalendar = R.sum(metric === 'cost'
          ? dates.map(date => statsDay(date, 'cost', false)) : calendar.map(day => day.fact[metric]));
        if (!near(stated, fromCalendar, metric === 'checks' ? 0 : dates.length + 1)) notes.add('Итоги и дневные суммы выгрузок расходятся.');
        if (R.valid(stated)) {
          total[metric] = use('Статистика', entry.statsSource, stated);
        } else if (R.valid(fromCalendar)) {
          total[metric] = fromCalendar;
          if (metric === 'cost') dates.forEach(date => statsDay(date, 'cost'));
          else dates.forEach(date => dayValues(date));
        } else {
          const rating = ratingEntry?.plan.rating?.[store.key];
          total[metric] = use('Рейтинг', ratingEntry?.planSource,
            R.rubles(metric === 'to' ? rating?.monthRevenue : metric === 'vp' ? rating?.monthProfit : null));
        }
      }
      if (!near(total.vp, R.delta(total.to, total.cost), dates.length + 1)) notes.add('ТО, ВП и себестоимость не сходятся.');
      return total;
    }

    const monthly = totals(monthStart, end, true);
    const previousDay = R.shift(end, -1);
    const completedFact = closed ? monthly : totals(monthStart, previousDay, true);
    const hasFacts = totals => ['to', 'vp', 'checks'].some(metric => R.valid(totals[metric]));
    const displayMonthly = !hasFacts(monthly) && hasFacts(completedFact) ? completedFact : monthly;
    const factDate = displayMonthly === monthly ? end : previousDay;
    if (factDate !== end) notes.add('Месячный факт приведён по последний закрытый день.');
    const monthlyPlan = Object.fromEntries(['to', 'vp', 'checks'].map(metric => [metric, fullPlan(metric)]));
    const calendarPlan = (dates, metric) => R.sum(dates.map(date => dayInput(date, metric, 'plan')));
    const periodDates = R.days(start, end);
    const kpiFact = mode === 'month' ? displayMonthly : totals(start, end, true);
    const kpiPlan = mode === 'month' ? monthlyPlan
      : Object.fromEntries(['to', 'vp', 'checks'].map(metric => [metric, calendarPlan(periodDates, metric)]));
    if (monthStats && !near(
      statsFor(monthStats, 'avgCheck'), R.ratio(monthly.to, monthly.checks), 1)) notes.add('Средний чек выгрузки расходится с ТО / чеками.');
    const actualCost = kpiFact.cost ?? R.delta(kpiFact.to, kpiFact.vp);
    const planCost = R.delta(kpiPlan.to, kpiPlan.vp);
    const kpi = {
      to: R.metric(kpiPlan.to, kpiFact.to),
      vp: R.metric(kpiPlan.vp, kpiFact.vp),
      markup: R.metric(R.markup(kpiPlan.vp, planCost), R.markup(kpiFact.vp, actualCost)),
      checks: R.metric(kpiPlan.checks, kpiFact.checks)
    };
    const elapsedPlan = calendarPlan(completed, 'to');
    const pace = {
      to: R.percent(completedFact.to, elapsedPlan),
      checks: R.percent(completedFact.checks, calendarPlan(completed, 'checks'))
    };
    const official = R.rubles(monthPlan?.plan.rating?.[store.key]?.progTO);
    const monthlyForecast = R.rubles(series(monthPlan || { plan: {} }, 'to')?.monthly?.[monthId]?.prog);
    const estimate = use('Прогноз', monthPlan?.planSource, official ?? monthlyForecast);
    const month = {
      ...R.metric(monthlyPlan.to, displayMonthly.to),
      factDate,
      forecast: R.forecast({ monthEnd, end, today, fact: monthly.to, plan: monthlyPlan.to, elapsedPlan,
        official: estimate, completedFact: completedFact.to }),
      paceGap: R.delta(completedFact.to, elapsedPlan)
    };
    const now = dayValues(end);
    const day = R.dayMetrics(now.plan, now.fact, closed);
    const mismatched = new Set((skuImports || []).filter(item =>
      item.storeName && !storeNames(item.storeName).includes(store.key)).map(item => item.date));
    const sku = R.skuReport(skuMetrics, start, end, mismatched);
    for (const item of sku ? skuImports || [] : []) {
      if (item.date < sku.first || item.date > sku.last) continue;
      if (mismatched.has(item.date)) {
        notes.add('В 3SKU есть выгрузка другого магазина.');
      } else {
        remember('3SKU', { name: item.file || 'Продажи по кассирам', importedAt: item.at,
          period: { start: item.date, end: item.date } });
      }
    }

    const deptSource = plans.find(entry => exact(entry.planSource, start, end) && entry.plan.tn?.[store.key]?.length);
    const departments = R.departments({ rows: deptSource?.plan.tn, store: store.key, region: store.region, stores, keyOf, order });
    if (deptSource) remember('Товарные группы', deptSource.planSource);

    const dataSources = [...used.values()].filter(source => ['Статистика', 'Рейтинг', 'План-факт', 'Продажи', 'Товарные группы', '3SKU'].includes(source.label));
    const cutoffs = new Set(dataSources.filter(source => source.label !== '3SKU').map(source => source.period?.end).filter(Boolean));
    const skuDates = dataSources.filter(source => source.label === '3SKU').map(source => source.period.end).sort();
    if (skuDates.length) cutoffs.add(skuDates.at(-1));
    if (cutoffs.size > 1) notes.add('Даты выгрузок различаются. Факты отобраны по периоду.');
    const currentSources = [...new Set(Object.values(now.factSources))];
    const times = [...new Set(currentSources.map(source => source.time || null))];
    if (!closed && currentSources.length > 1 && (times.length > 1 || times[0] === null)) {
      notes.add('Время среза дневных источников не совпадает или не указано.');
      const a = now.factSources.to;
      const b = now.factSources.checks;
      if (a !== b && (!a?.time || a.time !== b?.time)) {
        day.avg.fact = day.avg.achieved = day.avg.difference = day.avg.left = null;
      }
    }
    const time = !closed && times.length === 1 ? times[0] : null;
    const view = { range, month, kpi, day, sku, departments, closed, pace, time, notes: [...notes], used: [...used.values()] };
    view.focus = R.priorities(view, thresholds);
    return view;
  }

  window.BriefingData = { sources, storesFrom, build };
})();
