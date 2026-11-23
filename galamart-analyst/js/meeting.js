/* Printable meeting report. Period imports are kept separate from the active Vision workbooks. */
(() => {
  const card = document.getElementById('meetingCard');
  const measures = [
    ['to', 'ТО факт', 'тыс. ₽'],
    ['progFul', 'ТО · прогноз выполнения плана', '%'],
    ['growthTO', 'ТО · прирост к 2025', '%'],
    ['vp', 'Валовая прибыль факт', 'тыс. ₽'],
    ['progFulVP', 'ВП · прогноз выполнения плана', '%'],
    ['growthVP', 'ВП · прирост к 2025', '%'],
    ['markup', 'Наценка', '%'],
    ['checks', 'Количество чеков', 'шт.'],
    ['progFulChecks', 'Чеки · прогноз выполнения плана', '%'],
    ['growthChecks', 'Чеки · прирост к 2025', '%'],
    ['avgCheck', 'Средний чек', '₽'],
    ['growthAvgCheck', 'Средний чек · прирост к 2025', '%'],
    ['avgPrice', 'Средняя цена товара', '₽']
  ];
  const scopes = ['Мы', 'Сеть', 'Регион', 'LFL'];
  const benchmarkInputs = {
    progFul: ['progTO', 'planTO'], growthTO: ['to', 'to25'],
    progFulVP: ['progVP', 'planVP'], growthVP: ['vp', 'vp25'], markup: ['vp', 'ss'],
    growthChecks: ['checks', 'checks25'], avgCheck: ['to', 'checks'],
    growthAvgCheck: ['to', 'checks', 'to25', 'checks25'], avgPrice: ['to', 'qty']
  };
  const manualBlocks = ['ТОП-100', 'ПКЗ', '1SKU'];
  const colors = ['#1b518f', '#926322', '#117758', '#644785'];
  const storageKey = 'soldie.meeting.v1';
  const files = new Map();
  const charts = [];
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { saved = {}; }
  const reports = saved.reports || {};
  let store = saved.store || '';
  let mode = 'month';
  let days = 7;
  const iso = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => i ? String(n).padStart(2, '0') : n).join('-');
  function shift(day, offset) {
    const d = SoldieRules.date(day);
    d.setDate(d.getDate() + offset);
    return iso(d);
  }
  const today = iso(new Date());
  const lastComplete = shift(today, -1);
  const monthDefault = today.endsWith('-01') ? today : lastComplete;
  let end = monthDefault;
  let lastView;
  let message = '';
  const esc = escapeHtml;
  const valid = Number.isFinite;
  const showValue = n => valid(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—';
  const sum = values => values.every(valid) ? values.reduce((a, b) => a + b, 0) : null;
  const ratio = (a, b, multiplier) => valid(a) && valid(b) && b > 0 ? a / b * multiplier : null;

  function period() {
    const start = mode === 'month' ? end.slice(0, 7) + '-01' : shift(end, 1 - days);
    const length = SoldieRules.daysBetween(start, end) + 1;
    const month = SoldieRules.date(end);
    return {
      start, end, length, mode,
      dates: Array.from({ length }, (_, i) => shift(start, i)),
      monthEnd: iso(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
      key: [mode, start, end].join('/')
    };
  }

  function point(series, date, kind) {
    const index = series?.isoDates?.indexOf(date) ?? -1;
    return series?.[kind]?.d[index] ?? null;
  }

  function dailyGroup(group, plan, range) {
    const to = group.map(row => plan.dailyTO[VisionMeeting.storeKey(row.name)]);
    const checks = group.map(row => plan.dailyChk[VisionMeeting.storeKey(row.name)]);
    const dayAverage = (series, date, kind) => group.length ? ratio(sum(series.map(row => point(row, date, kind))), group.length, 1) : null;
    const dayForecast = (series, date) => {
      if (!group.length) return null;
      const estimate = series.map(row => forecastPoint(row, date));
      return ratio(sum(estimate), sum(series.map(row => point(row, date, 'plan'))), 100);
    };
    const forecastPoint = (row, date) =>
      (date <= range.end && date < today ? point(row, date, 'fact') : null) ?? point(row, date, 'prog');
    const values = range.dates.map(date => {
      const revenue = dayAverage(to, date, 'fact');
      const count = dayAverage(checks, date, 'fact');
      return {
        to: revenue, checks: count, avgCheck: ratio(revenue, count, 1000),
        progFul: dayForecast(to, date), progFulChecks: dayForecast(checks, date)
      };
    });
    function periodForecast(series) {
      const last = range.mode === 'month' ? range.monthEnd : range.end;
      const dates = Array.from({ length: SoldieRules.daysBetween(range.start, last) + 1 }, (_, i) => shift(range.start, i));
      if (!group.length) return null;
      const forecast = series.flatMap(row => dates.map(date => forecastPoint(row, date)));
      const target = series.flatMap(row => dates.map(date => point(row, date, 'plan')));
      return ratio(sum(forecast), sum(target), 100);
    }
    const revenue = sum(values.map(row => row.to));
    const count = sum(values.map(row => row.checks));
    return {
      values,
      totals: { to: revenue, checks: count, avgCheck: ratio(revenue, count, 1000), progFul: periodForecast(to), progFulChecks: periodForecast(checks) }
    };
  }

  function sourceFor(range) {
    const active = VisionMeeting.current();
    const local = files.get(range.key) || {};
    const matchesMonth = range.mode === 'month' && range.end === monthDefault;
    const stats = local.stats || (matchesMonth ? active.stores : []);
    const stores = local.stats || active.stores;
    const daily = kind => {
      const rows = { ...active.plan[kind] };
      for (const [key, series] of Object.entries(local.plan?.[kind] || {})) {
        rows[key] = VisionMeeting.mergeSeries(rows[key], series);
      }
      return rows;
    };
    const plan = {
      rating: local.plan?.rating || active.plan.rating,
      dailyTO: daily('dailyTO'), dailyChk: daily('dailyChk')
    };
    return { stats, stores, plan, local, matchesMonth };
  }

  function buildView() {
    const range = period();
    const source = sourceFor(range);
    const skuSettings = window.sku3Api?.getSettings();
    const name = store || VisionMeeting.selected() || source.stores[0]?.name || skuSettings?.storeName || '';
    const storeKey = VisionMeeting.storeKey(name);
    const key = JSON.stringify([storeKey, range.key]);
    const record = reports[key] || {};
    const selected = source.stores.find(row => VisionMeeting.storeKey(row.name) === storeKey);
    const comparable = [
      selected ? [selected] : name ? [{ name }] : [],
      source.stores,
      selected?.region ? source.stores.filter(row => row.region === selected.region) : [],
      selected?.lfl2 ? source.stores.filter(row => row.lfl2 === selected.lfl2) : []
    ];
    const statsByStore = new Map(source.stats.map(row => [VisionMeeting.storeKey(row.name), row]));
    const groups = comparable.map((members, index) => {
      const stats = members.map(row => statsByStore.get(VisionMeeting.storeKey(row.name))).filter(Boolean);
      const rows = stats.map(row => ({ ...row, progTO: null, progFul: null, progVP: null, progFulVP: null,
        ...(source.local.plan || source.matchesMonth ? source.plan.rating[VisionMeeting.storeKey(row.name)] : {}) }));
      const complete = rows.length === members.length;
      const summary = complete ? (index === 0 ? rows[0] : VisionMeeting.aggregate(rows)) : null;
      if (summary && index > 0) {
        for (const [id] of measures) {
          if (!rows.every(row => (benchmarkInputs[id] || [id]).every(input => valid(row[input])))) summary[id] = null;
        }
      }
      const daily = dailyGroup(members, source.plan, range);
      return { summary, daily };
    });
    const automatic = measures.map(([id]) => groups.map(({ summary, daily }, col) =>
      summary?.[id] ?? daily.totals[id] ?? record.values?.[id]?.[col] ?? null));
    const values = Object.fromEntries(measures.map(([id], row) => [id, automatic[row].map((v, col) => v ?? record.manual?.[id]?.[col] ?? null)]));
    const sku = skuSettings && (!name || !skuSettings.storeName || VisionMeeting.storeKey(skuSettings.storeName) === storeKey)
      ? window.sku3Api.computeMetrics() : null;
    let previous = null;
    if (mode === 'rolling') {
      const previousRange = {
        ...range,
        start: shift(range.start, -days),
        end: shift(range.start, -1),
        dates: range.dates.map(date => shift(date, -days))
      };
      const previousKey = ['rolling', previousRange.start, previousRange.end].join('/');
      const stored = reports[JSON.stringify([storeKey, previousKey])];
      const previousPlan = sourceFor({ ...previousRange, key: previousKey }).plan;
      const daily = comparable.map(group => dailyGroup(group, previousPlan, previousRange).totals);
      previous = Object.fromEntries(measures.map(([id]) => [id, daily.map((row, col) =>
        stored?.values?.[id]?.[col] ?? stored?.manual?.[id]?.[col] ?? row[id] ?? null)]));
    }
    return { range, source, name, storeKey, key, record, groups, automatic, values, previous, sku, skuSettings };
  }

  function writeStorage() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ store, reports }));
      return true;
    } catch { return false; }
  }

  function updateRecord(view) {
    if (!store && view.name) store = view.name;
    return reports[view.key] ||= { range: view.range, store: view.storeKey, manual: {}, extras: {} };
  }

  function capture(view) {
    const record = updateRecord(view);
    record.values = Object.fromEntries(measures.map(([id], row) => [id, view.automatic[row]]));
    record.captured = true;
    const keys = Object.keys(reports);
    if (keys.length > 80) keys.filter(key => key !== view.key).slice(0, keys.length - 80).forEach(key => delete reports[key]);
    return writeStorage();
  }

  function chart(title, labels, series, unit) {
    const usable = series.filter(item => item.data.filter(valid).length >= 2);
    if (!usable.length || typeof Chart === 'undefined') return;
    const figure = document.createElement('figure');
    figure.className = 'meeting-chart';
    const caption = document.createElement('figcaption');
    caption.textContent = title + ' · ' + unit;
    const holder = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', caption.textContent);
    holder.append(canvas);
    figure.append(caption, holder);
    card.querySelector('#meetingCharts').append(figure);
    charts.push(new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: usable.map((item, i) => ({
        ...item, borderColor: item.color || colors[i % colors.length], borderWidth: 2,
        borderDash: [[], [7, 3], [2, 3], [8, 3, 2, 3]][i % 4], pointRadius: labels.length > 21 ? 0 : 2,
        spanGaps: false
      })) },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: usable.length > 1, labels: { boxWidth: 16 } } },
        scales: { x: { ticks: { maxTicksLimit: 8 } } } }
    }));
  }

  function renderCharts(view, skuSeries) {
    charts.splice(0).forEach(instance => instance.destroy());
    const dateLabel = value => value.slice(8) + '.' + value.slice(5, 7);
    const labels = view.range.dates.map(dateLabel);
    const history = Object.values(reports).filter(record => record.captured && record.store === view.storeKey
      && record.range.end < view.range.end && record.range.mode === view.range.mode
      && (view.range.mode === 'month' ? record.range.start === view.range.start : record.range.length === view.range.length))
      .sort((a, b) => a.range.end.localeCompare(b.range.end)).slice(-13);
    const historyLabels = [...history.map(record => dateLabel(record.range.end)), dateLabel(view.range.end)];
    for (const [id, title, unit] of measures) {
      const series = view.groups.map((group, i) => ({ label: scopes[i], color: colors[i], data: group.daily.values.map(row => row[id] ?? null) }));
      chart(title + ' по дням', labels, series, unit);
      chart(title + ' по сохранённым срезам', historyLabels, series.flatMap(({ label, color, data }, col) =>
        data.filter(valid).length >= 2 ? [] : [{
          label, color, data: [...history.map(record => record.values?.[id]?.[col] ?? record.manual?.[id]?.[col] ?? null), view.values[id][col]]
        }]), unit);
    }
    chart('3SKU по дням', labels, skuSeries, 'шт.');
    for (const block of manualBlocks) {
      const extra = view.record.extras?.[block];
      if (!extra?.label || !valid(extra.value)) continue;
      chart(block + ' · ' + extra.label + ' по сохранённым срезам', historyLabels, [{
        label: block,
        data: [...history.map(record => record.extras?.[block]?.label === extra.label ? record.extras[block].value : null), extra.value]
      }], 'ед. показателя');
    }
  }

  function renderOutput(view) {
    lastView = view;
    const skuSeries = (view.sku?.skuMetrics || []).map(sku => {
      const byDate = new Map(sku.skuDailySeries.map(row => [row.date, row.units]));
      return { label: sku.name, data: view.range.dates.map(date => byDate.get(date) ?? null) };
    });
    const covered = view.range.dates.filter(date => view.sku?.importedSet.has(date)).length;
    const showSkuPlan = view.range.mode === 'month' && view.sku?.startDate === view.range.start
      && view.sku.endDate === view.range.monthEnd;
    const interval = fmtDate(view.range.start) + ' — ' + fmtDate(view.range.end);
    const missing = Object.values(view.values).flat().filter(v => !valid(v)).length;
    card.querySelector('#meetingMissingCount').textContent = missing ? 'Заполнить недостающие показатели (' + missing + ')' : 'Данные заполнены';
    card.querySelector('#meetingOutput').innerHTML = `
      <header class="meeting-heading">
        <h2>К собранию</h2><p>${esc(view.name || 'Магазин не указан')} · ${interval} · ${view.range.length} дн.</p>
      </header>
      <div class="meeting-table-scroll"><table>
        <thead><tr><th scope="col">Показатель</th>${scopes.map(label => '<th scope="col">' + label + '</th>').join('')}</tr></thead>
        <tbody>${measures.map(([id, title, unit]) => '<tr><th scope="row">' + title + ' <small>' + unit + '</small></th>'
          + view.values[id].map((value, col) => {
            const previous = view.previous?.[id]?.[col];
            const change = valid(previous) && valid(value) ? value - previous : null;
            const delta = valid(change) ? '<small>' + (change > 0 ? '+' : '') + showValue(change) + ' ' + (unit === '%' ? 'п. п.' : unit) + '</small>' : '';
            return '<td>' + showValue(value) + delta + '</td>';
          }).join('') + '</tr>').join('')}</tbody>
      </table></div>
      <p class="meeting-note">Абсолютные показатели для сети, региона и LFL приведены в среднем на магазин. Прогноз месяца относится к полному месячному плану. Для закрытых дней в прогнозе по «План-факту» используется факт.${view.previous ? ' Под значениями показано изменение к предыдущему периоду той же длины, если есть данные.' : ''}</p>
      <section class="meeting-programs">
        <h3>Товары и акции</h3>
        <dl>${manualBlocks.map(block => {
          const item = view.record.extras?.[block] || {};
          return '<dt>' + block + '</dt><dd>' + esc(item.label || '') + (valid(item.value) ? ' <strong>' + showValue(item.value) + '</strong>' : '')
            + (item.note ? '<p>' + esc(item.note) + '</p>' : !item.label && !valid(item.value) ? '—' : '') + '</dd>';
        }).join('')}
        <dt>3SKU</dt><dd>${!view.sku
          ? skuMessage(view)
          : 'Загружено дней: ' + covered + ' из ' + view.range.length + (skuSeries.length ? '<ul>' + skuSeries.map((item, i) => {
            const observed = item.data.filter(valid);
            const plan = view.sku.skuMetrics[i].plan;
            return '<li>' + esc(item.label) + ' · ' + (observed.length ? showValue(sum(observed)) + ' шт.' : '—')
              + (showSkuPlan && plan > 0 ? ' / план ' + showValue(plan) + ' шт.' : '') + '</li>';
          }).join('') + '</ul>' : ' · позиции акции не настроены')}</dd></dl>
      </section>
      <div id="meetingCharts" class="meeting-charts"></div>`;
    renderCharts(view, skuSeries);
  }

  function skuMessage(view) {
    if (!view.skuSettings) return 'Загрузите продажи и настройте акцию в разделе 3SKU.';
    return 'Магазин в настройках 3SKU: ' + esc(view.skuSettings.storeName) + '. Проверьте выбранный магазин.';
  }

  function render() {
    const view = buildView();
    const { range, source, record } = view;
    card.innerHTML = `
      <div class="meeting-controls">
        <div class="meeting-toolbar">
          <label>Режим<select id="meetingMode"><option value="month">С начала месяца</option><option value="rolling" ${mode === 'rolling' ? 'selected' : ''}>Последние N дней</option></select></label>
          <label ${mode === 'month' ? 'hidden' : ''}>Дней<input id="meetingDays" type="number" min="1" max="90" value="${days}"></label>
          <label>По дату включительно<input id="meetingEnd" type="date" max="${today}" value="${range.end}"></label>
          <label>Магазин<input id="meetingStore" list="meetingStores" value="${esc(view.name)}" placeholder="Название магазина"></label>
          <datalist id="meetingStores">${source.stores.map(row => '<option value="' + esc(row.name) + '"></option>').join('')}</datalist>
          <button type="button" id="meetingPrint">Печать</button>
          <button type="button" id="meetingSave">Сохранить срез</button>
        </div>
        <details ${source.stats.length ? '' : 'open'}>
          <summary>Выгрузки за выбранный период</summary>
          <p>${source.local.stats ? 'Статистика: ' + esc(source.local.statsName)
            : source.stats.length ? 'Используется текущая «Статистика расширенная» из Vision. Убедитесь, что её период совпадает с датами отчёта.'
            : 'Загрузите «Статистику расширенную» за ' + fmtDate(range.start) + ' — ' + fmtDate(range.end) + ' для ВП, наценки и сравнения с 2025 годом.'}</p>
          <div class="meeting-toolbar">
            <label>Статистика расширенная<input id="meetingStats" type="file" accept=".xlsx,.xls"></label>
            <label>Рейтинг / план-факт<input id="meetingPlan" type="file" accept=".xlsx,.xls"></label>
          </div>
          <p>${source.local.planName ? esc(source.local.planName) : 'Дневные ТО и чеки также берутся из загруженного в Vision «План-факта», если в нём есть нужные даты.'}</p>
        </details>
        <details id="meetingMissing"><summary id="meetingMissingCount"></summary><div class="meeting-missing-fields">
          ${measures.map(([id, title, unit], row) => view.automatic[row].map((value, col) => valid(value) ? ''
            : '<label>' + title + ' · ' + scopes[col] + ' (' + unit + ')<input type="number" step="any" data-meeting-metric="' + id + '" data-col="' + col + '" value="' + esc(record.manual?.[id]?.[col] ?? '') + '"></label>').join('')).join('')}
        </div></details>
        <details><summary>ТОП-100, ПКЗ и 1SKU</summary><div class="meeting-extras">
          ${manualBlocks.map((block, i) => {
            const item = record.extras?.[block] || {};
            return '<fieldset><legend>' + block + '</legend><label>Показатель и единица<input data-block="' + i + '" data-field="label" value="' + esc(item.label || '') + '"></label>'
              + '<label>Значение<input type="number" step="any" data-block="' + i + '" data-field="value" value="' + esc(item.value ?? '') + '"></label>'
              + '<label>Комментарий<textarea data-block="' + i + '" data-field="note">' + esc(item.note || '') + '</textarea></label></fieldset>';
          }).join('')}
        </div></details>
        <p id="meetingStatus" role="status">${esc(message)}</p>
      </div>
      <div id="meetingOutput"></div>`;
    renderOutput(view);
  }

  card.addEventListener('change', async event => {
    const input = event.target;
    message = '';
    if (input.id === 'meetingMode') {
      mode = input.value;
      end = mode === 'month' ? monthDefault : lastComplete;
    } else if (input.id === 'meetingDays') {
      days = Math.max(1, Math.min(90, Math.trunc(input.valueAsNumber) || 7));
    } else if (input.id === 'meetingEnd') {
      if (SoldieRules.date(input.value) && input.value <= today) end = input.value;
    } else if (input.id === 'meetingStore') {
      store = input.value.trim();
      writeStorage();
    } else if (input.id === 'meetingStats' || input.id === 'meetingPlan') {
      const file = input.files[0];
      if (!file) return;
      const key = period().key;
      const kind = input.id === 'meetingStats' ? 'stats' : 'plan';
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const data = kind === 'stats' ? VisionMeeting.readStats(workbook) : VisionMeeting.readPlan(workbook);
        if (kind === 'stats' ? !data.length : !Object.values(data).some(group => Object.keys(group).length)) {
          throw new Error('Не найдены данные нужного вида');
        }
        files.set(key, { ...files.get(key), [kind]: data, [kind + 'Name']: file.name });
        if (!store && kind === 'stats' && !VisionMeeting.selected() && key === period().key) store = data[0].name;
        message = 'Загружен файл ' + file.name;
      } catch (error) { message = 'Ошибка чтения файла. ' + error.message; }
    } else {
      const record = updateRecord(lastView);
      if (input.dataset.meetingMetric) {
        const row = record.manual[input.dataset.meetingMetric] ||= [null, null, null, null];
        row[input.dataset.col] = valid(input.valueAsNumber) ? input.valueAsNumber : null;
      } else if (input.dataset.block !== undefined) {
        const extra = record.extras[manualBlocks[input.dataset.block]] ||= {};
        extra[input.dataset.field] = input.type === 'number' ? (valid(input.valueAsNumber) ? input.valueAsNumber : null) : input.value.trim();
      } else { return; }
      card.querySelector('#meetingStatus').textContent = writeStorage() ? '' : 'Не удалось сохранить введённые данные в браузере.';
      renderOutput(buildView());
      return;
    }
    render();
  });

  card.addEventListener('click', event => {
    const id = event.target.id;
    if (id !== 'meetingPrint' && id !== 'meetingSave') return;
    const ok = capture(lastView);
    card.querySelector('#meetingStatus').textContent = ok ? 'Срез сохранён в этом браузере.' : 'Не удалось сохранить срез в браузере.';
    if (id === 'meetingPrint') {
      if (window.AndroidBridge?.printMeetingReport) window.AndroidBridge.printMeetingReport();
      else window.print();
    }
  });

  window.MeetingReport = {
    show() {
      card.classList.remove('hidden');
      document.body.classList.add('meeting-report-active');
      render();
      window.sku3Api?.ready.then(() => { if (!card.classList.contains('hidden')) render(); });
    },
    hide() {
      card.classList.add('hidden');
      document.body.classList.remove('meeting-report-active');
      charts.splice(0).forEach(instance => instance.destroy());
    }
  };
  window.addEventListener('sku3-data-changed', () => { if (!card.classList.contains('hidden')) render(); });
})();
