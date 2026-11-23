/* Daily briefing controls and shared screen / A4 report. */
(() => {
  const card = document.getElementById('briefingCard');
  const applicationTitle = document.title;
  const R = BriefingRules;
  const esc = escapeHtml;
  const todayISO = () => {
    const date = new Date();
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n, i) => i ? String(n).padStart(2, '0') : n).join('-');
  };
  const storage = 'soldie.briefing.v1';
  let preferences;
  try { preferences = JSON.parse(localStorage.getItem(storage)) || {}; } catch { preferences = {}; }
  card.innerHTML = `
    <div class="briefing-controls card">
      <div class="briefing-fields">
        <label>Магазин<select id="briefingStore"></select></label>
        <label>Отчётная дата<input id="briefingDate" type="date" required></label>
        <label>Период KPI и отделов<select id="briefingPeriod"><option value="month">С начала месяца</option><option value="week">Последние 7 дней</option></select></label>
      </div>
      <div class="briefing-actions">
        <button type="button" id="briefingGenerate" class="briefing-primary">Сформировать брифинг</button>
        <button type="button" id="briefingPreview" aria-pressed="false">Предпросмотр A4</button>
        <button type="button" id="briefingPrint">Печать</button>
        <button type="button" id="briefingPdf" title="В диалоге печати выберите «Сохранить как PDF»">Сохранить PDF</button>
      </div>
      <details class="briefing-settings">
        <summary>Настройки и источники</summary>
        <div class="briefing-fields">
          <label>Порядок отделов<select id="briefingSort"><option value="achieved">По выполнению</option><option value="region">По разнице с регионом</option><option value="source">Как в выгрузке</option></select></label>
          <label>Зелёный от, %<input id="briefingGood" type="number" min="0" max="200" step="0.1"></label>
          <label>Жёлтый от, %<input id="briefingWatch" type="number" min="0" max="200" step="0.1"></label>
        </div>
        <button type="button" data-briefing-open="vision">Открыть источники Vision</button>
        <button type="button" data-briefing-open="sku3">Открыть 3SKU</button>
        <div id="briefingSources"></div>
      </details>
      <p id="briefingStatus" role="status"></p>
    </div>
    <div class="briefing-stage"><article id="briefingSheet" aria-label="Печатный ежедневный брифинг"></article></div>`;

  const el = id => document.getElementById('briefing' + id);
  let selectedStore = typeof preferences.store === 'string' ? preferences.store : '';
  let selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(preferences.end || '') ? preferences.end : '';
  el('Period').value = preferences.mode === 'week' ? 'week' : 'month';
  el('Sort').value = ['achieved', 'region', 'source'].includes(preferences.order) ? preferences.order : 'achieved';
  el('Good').value = preferences.good ?? 100;
  el('Watch').value = preferences.watch ?? 90;

  const format = (value, digits = 0) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
  const number = (value, unit = '', digits = 0) => R.valid(value) ? format(value, digits) + (unit ? '&nbsp;' + unit : '') : '—';
  const pct = value => number(value, '%', 1);
  const sign = (value, unit, digits = 0) => R.valid(value) && value > 0 ? '+' + number(value, unit, digits) : number(value, unit, digits);
  const date = day => day ? day.split('-').reverse().join('.') : '—';
  const rangeLabel = (start, end) => start === end ? date(end) : date(start) + ' — ' + date(end);
  const dateTime = value => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const money = value => number(value, '₽');
  const labelValue = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const width = value => R.valid(value) ? Math.min(100, Math.max(0, value)) : 0;
  const progress = (value, tone) => `<span class="briefing-progress ${tone}" aria-hidden="true"><i style="width:${width(value)}%"></i></span>`;
  const sectionTitle = (title, meta = '') => `<div class="briefing-section-title"><h3>${title}</h3>${meta ? `<span>${meta}</span>` : ''}</div>`;

  function render(view, store, thresholds) {
    const { range, month, kpi, day, sku, departments, closed, pace, time, notes, used, focus } = view;
    const tone = value => R.status(value, thresholds.good, thresholds.watch);
    const monthCards = [
      ['Месячный план', money(month.plan)],
      [month.factDate === range.end ? 'Факт с начала месяца' : 'Факт на ' + date(month.factDate), money(month.fact)],
      ['Осталось до плана', money(month.left)],
      ['Прогноз к концу месяца', pct(month.forecast)],
      [closed ? 'К графику на отчётную дату' : 'К графику закрытых дней', sign(month.paceGap, '₽')]
    ];
    const kpis = [
      ['Товарооборот', kpi.to, '₽'], ['Валовая прибыль', kpi.vp, '₽'],
      ['Наценка', kpi.markup, '%'], ['Чеки', kpi.checks, 'шт.']
    ];
    const dayRows = [
      ['Товарооборот', day.to, '₽'], ['Чеки', day.checks, 'шт.'],
      ['Средний чек', day.avg, '₽'], ['Валовая прибыль', day.vp, '₽']
    ];
    const weakest = (closed
      ? [['ТО', day.to.achieved], ['чеки', day.checks.achieved], ['ВП', day.vp.achieved]]
      : [['ТО', pace.to], ['чеки', pace.checks]])
      .filter(([, value]) => R.valid(value)).sort((a, b) => a[1] - b[1])[0];
    let summary = closed ? 'Для оценки итога дня нужны план и факт.' : 'Для оценки темпа нужны данные за закрытые дни.';
    if (weakest) summary = weakest[1] < thresholds.good
      ? `${closed ? 'Главное отклонение дня' : 'Темп по закрытым дням'} · ${weakest[0]} ${pct(weakest[1])} от плана.`
      : `${closed ? 'Доступные итоги дня' : 'Темп по закрытым дням'} на уровне цели.`;
    if (!closed && day.checks.left === 0 && day.to.left > 0) summary = 'План по чекам достигнут. Для выполнения плана ТО нужны дополнительные чеки.';

    const departmentLimit = 24;
    const hasPlans = departments.some(row => R.valid(row.achieved));
    const shareMode = !hasPlans;
    const shareMax = Math.max(0, ...departments.map(row => row.share ?? 0));
    const scale = shareMode && shareMax > 0 ? Math.ceil(shareMax / 5) * 5 : 100;
    const shortDepartments = departments.slice(0, departmentLimit);
    const departmentColumns = shortDepartments.length > 6
      ? [shortDepartments.slice(0, Math.ceil(shortDepartments.length / 2)), shortDepartments.slice(Math.ceil(shortDepartments.length / 2))]
      : [shortDepartments];
    const reportNotes = notes.length ? `<p class="briefing-data-note">${notes.map(esc).join(' ')}</p>` : '';
    const sources = [...new Set(used.map(source => source.label))].join(' · ');
    el('Sheet').classList.toggle('briefing-dense', shortDepartments.length > 18);
    el('Sheet').innerHTML = `
      <header class="briefing-report-head">
        <div><div class="briefing-report-brand">SOLDIE <span></span> ${esc(store.region || 'Управление магазином')}</div>
        <h2>Ежедневный брифинг</h2><p>${esc(store.name)}</p></div>
        <time datetime="${range.end}"><span>Отчётная дата</span><strong>${date(range.end)}</strong></time>
      </header>
      <section class="briefing-month">
        <div class="briefing-ring ${Math.abs(month.achieved) >= 1000 ? 'briefing-ring-long' : Math.abs(month.achieved) >= 100 ? 'briefing-ring-wide' : ''}" style="--progress:${width(month.achieved)}%" aria-label="Выполнение месяца ${R.valid(month.achieved) ? format(month.achieved, 1) + '%' : 'нет данных'}">
          <div><strong>${pct(month.achieved)}</strong><span>план месяца</span></div>
        </div>
        <div class="briefing-month-info">
          ${sectionTitle('Положение за месяц', rangeLabel(range.monthStart, range.end))}
          <dl>${monthCards.map(([label, value]) => labelValue(label, value)).join('')}</dl>
        </div>
      </section>
      <section class="briefing-kpi">
        ${sectionTitle('Ключевые показатели', rangeLabel(range.start, range.end))}
        <div class="briefing-kpi-grid">${kpis.map(([label, data, unit], index) => `
          <div class="briefing-kpi-card ${tone(data.achieved)}">
            <h4>${label}</h4>
            <strong>${index === 2 ? pct(data.fact) : pct(data.achieved)}</strong>
            <div class="briefing-kpi-detail">План ${number(data.plan, unit, index === 2 ? 1 : 0)}</div>
            <div class="briefing-kpi-detail">${index === 2 ? 'К плану ' + sign(data.difference, 'п. п.', 1) : 'Факт ' + number(data.fact, unit)}</div>
            ${index === 1 || index === 3 ? `<div class="briefing-kpi-detail">К плану ${sign(data.difference, unit)}</div>` : ''}
            ${progress(data.achieved, tone(data.achieved))}
          </div>`).join('')}</div>
      </section>
      <div class="briefing-operations">
        <section class="briefing-sku">
          ${sectionTitle('3SKU', sku ? rangeLabel(sku.first, sku.last) : '')}
          ${sku ? `
            <div class="briefing-sku-hero"><div><strong>${pct(sku.factPenetration)}</strong><span>пенетрация</span></div>
              <div>Цель ${pct(sku.target)}<br>К цели ${sign(sku.gap, 'п. п.', 1)}</div></div>
            <dl class="briefing-sku-counts">${labelValue('План дня', number(sku.day.plan, 'шт.'))}
              ${labelValue('Продано', number(sku.day.fact, 'шт.', 1))}
              ${labelValue('Осталось', number(sku.day.left, 'шт.', 1))}</dl>
            ${progress(sku.day.achieved, tone(sku.day.achieved))}
            ${sku.items.length ? `<ul>${sku.items.slice(0, 3).map(row => `<li><span title="${esc(row.name)}">${esc(row.name)}</span><strong>${number(row.units, 'шт.', 1)}</strong></li>`).join('')}</ul>` : '<p>На отчётную дату нет активных SKU.</p>'}
            ${R.valid(sku.factPenetration) ? '' : '<p>Для пенетрации нужны продажи и чеки за весь период акции в срезе.</p>'}
          ` : '<p>Нет данных акции 3SKU для этого магазина и периода.</p>'}
        </section>
        <section class="briefing-today">
          ${sectionTitle('Оперативный план дня', closed ? 'День завершён' : time ? 'Данные на ' + time : 'День идёт · время среза неизвестно')}
          <table><thead><tr><th scope="col">Показатель</th><th scope="col">План дня</th><th scope="col">Факт</th><th scope="col">${closed ? 'Итог' : 'Осталось'}</th></tr></thead>
          <tbody>${dayRows.map(([label, row, unit]) => `<tr><th scope="row">${label}</th><td>${number(row.plan, unit)}</td>
            <td>${number(row.fact, unit)}</td><td class="${closed ? tone(row.achieved) : ''}">${closed ? pct(row.achieved) : number(row.left, unit)}</td></tr>`).join('')}</tbody></table>
          <p class="briefing-day-summary">${summary}${!closed && R.valid(day.avg.left) ? ' В «Осталось» указан средний чек на оставшиеся чеки.' : ''}</p>
        </section>
      </div>
      <section class="briefing-departments">
        ${sectionTitle('Вклад отделов', shareMode && departments.length ? 'Доля в ТО · шкала до ' + pct(scale) : store.region ? esc(store.region) : '')}
        ${departments.length ? `<div class="briefing-dept-grid ${departmentColumns.length > 1 ? 'briefing-two-cols' : ''}">${departmentColumns
          .map(rows => departmentTable(rows, shareMode, tone, scale)).join('')}</div>
          ${shortDepartments.length < departments.length ? `<p>На A4 показаны первые ${departmentLimit} из ${departments.length} отделов в выбранном порядке.</p>` : ''}
          ${hasPlans ? '' : '<p>В выгрузке нет планов отделов. Выполнение и сравнение с регионом недоступны.</p>'}`
          : '<p>Нет продаж по товарным группам за выбранный период.</p>'}
      </section>
      <section class="briefing-focus"><h3>Фокус дня</h3><div>${(focus.length ? focus : [
        [pace.to, pace.checks, sku?.gap, day.vp.achieved, ...departments.map(row => row.gap)].some(R.valid)
          ? 'По доступным данным значимых отклонений нет.' : 'Загрузите отчёты для определения приоритетов.'
      ]).map(text => `<p>${esc(text)}</p>`).join('')}</div></section>
      <footer class="briefing-foot">
        <span>${sources ? 'Источники · ' + esc(sources) : 'Источники не загружены'}</span>
        <span>— показатель недоступен</span>
        ${reportNotes}
      </footer>`;
    const supplementary = el('Sources');
    supplementary.innerHTML = `<p>Наценка — ВП / себестоимость. Пенетрация 3SKU — продажи акционных единиц на 100 чеков. Дневная цель распределяется по сроку действия каждой позиции.</p>
      ${used.length ? `<ul>${used.map(source => `<li>${esc(source.label)} · ${esc(source.name || 'Загруженный отчёт')}
        · ${source.period ? rangeLabel(source.period.start, source.period.end) : 'период не указан'}${source.time ? ', срез ' + source.time : ''}
        · импорт ${dateTime(source.importedAt)}</li>`).join('')}</ul>` : '<p>Загрузите «Статистику расширенную» и «Рейтинг / план-факт» в Vision. Настройки акции и продажи берутся из 3SKU.</p>'}
      ${shortDepartments.length < departments.length ? `<details><summary>Все отделы (${departments.length})</summary>${departmentTable(departments, shareMode, tone, scale)}</details>` : ''}`;
  }

  function departmentTable(rows, shareMode, tone, scale) {
    return `<table${shareMode ? ' class="briefing-dept-shares"' : ''}><thead><tr><th scope="col">Отдел</th><th scope="col">${shareMode ? 'Доля' : 'План, %'}</th>
      ${shareMode ? '' : '<th scope="col">Регион</th><th scope="col">Δ, п. п.</th>'}</tr></thead><tbody>${rows.map(row => {
      const value = shareMode ? row.share : row.achieved;
      return `<tr><th scope="row" title="${esc(row.name)}"><span>${esc(row.name)}</span></th><td><div class="briefing-dept-value">
        ${progress(R.percent(value, scale), shareMode ? 'share' : tone(value))}<strong>${pct(value)}</strong></div></td>
        ${shareMode ? '' : `<td>${pct(row.regional)}</td><td>${sign(row.gap, '', 1)}</td>`}</tr>`;
    }).join('')}</tbody></table>`;
  }

  function refresh(message = '') {
    const today = todayISO();
    const imports = BriefingData.sources();
    const stores = BriefingData.storesFrom(imports);
    const preferred = selectedStore || VisionMeeting.storeKey(VisionMeeting.selected());
    const availableDate = imports.flatMap(source => [source.statsSource?.period?.end, source.planSource?.period?.end])
      .filter(day => day && day <= today).sort().pop();
    el('Store').innerHTML = stores.length ? stores.map(store => `<option value="${esc(store.key)}">${esc(store.name)}</option>`).join('')
      : '<option value="">Нет загруженных магазинов</option>';
    el('Store').value = stores.find(store => store.key === preferred)?.key || stores[0]?.key || '';
    el('Date').max = today;
    el('Date').value = selectedDate && selectedDate <= today ? selectedDate : availableDate || today;
    const positive = el('Good').valueAsNumber;
    const good = Math.max(0, Math.min(200, Number.isFinite(positive) ? positive : 100));
    const watch = Math.max(0, Math.min(good, Number.isFinite(el('Watch').valueAsNumber) ? el('Watch').valueAsNumber : 90));
    el('Good').value = good;
    el('Watch').value = watch;
    const store = stores.find(store => store.key === el('Store').value);
    const end = el('Date').value;
    const mode = el('Period').value;
    const order = el('Sort').value;
    const thresholds = { good, watch };
    const skuApi = window.sku3Api;
    const skuMatches = store && store.key !== 'магазин' && VisionMeeting.storeKey(skuApi?.getSettings().storeName) === store.key;
    const skuMetrics = skuMatches ? skuApi.computeMetrics() : null;
    const skuImports = skuMatches ? skuApi.getState().imports : [];
    const view = BriefingData.build({ imports, stores, store: store || { key: '' }, end, today, mode, order, thresholds, skuMetrics, skuImports });
    render(view, store || { name: 'Магазин не выбран' }, thresholds);
    document.title = store ? 'Ежедневный брифинг · ' + store.name + ' · ' + date(end) : 'Ежедневный брифинг · Soldie';
    el('Print').disabled = el('Pdf').disabled = !store;
    el('Status').textContent = message || (store ? '' : 'Загрузите отчёты в Vision, чтобы выбрать магазин.');
    preferences = { store: selectedStore, end: selectedDate, mode, order, ...thresholds };
    try { localStorage.setItem(storage, JSON.stringify(preferences)); } catch { /* Report works without storage. */ }
  }

  function printReport() {
    if (window.AndroidBridge?.printDailyBriefing) window.AndroidBridge.printDailyBriefing();
    else window.print();
  }
  card.addEventListener('change', event => {
    if (event.target === el('Store')) selectedStore = el('Store').value;
    if (event.target === el('Date')) selectedDate = el('Date').validity.valid ? el('Date').value : '';
    refresh();
  });
  el('Generate').addEventListener('click', () => refresh('Брифинг сформирован.'));
  el('Preview').addEventListener('click', () => {
    const on = card.classList.toggle('briefing-preview');
    el('Preview').setAttribute('aria-pressed', String(on));
    el('Preview').textContent = on ? 'Вернуться к экранному виду' : 'Предпросмотр A4';
  });
  el('Print').addEventListener('click', printReport);
  el('Pdf').addEventListener('click', () => {
    el('Status').textContent = 'В диалоге печати выберите «Сохранить как PDF».';
    printReport();
  });
  card.querySelectorAll('[data-briefing-open]').forEach(button =>
    button.addEventListener('click', () => switchMode(button.dataset.briefingOpen)));
  const refreshVisible = () => { if (!card.classList.contains('hidden')) refresh(); };
  window.addEventListener('sku3-data-changed', refreshVisible);
  window.addEventListener('briefing-sources-changed', refreshVisible);
  window.DailyBriefing = {
    show() {
      card.classList.remove('hidden');
      document.body.classList.add('briefing-active');
      refresh();
      window.sku3Api?.ready.then(refreshVisible);
    },
    hide() {
      if (!card.classList.contains('hidden')) document.title = applicationTitle;
      card.classList.add('hidden');
      document.body.classList.remove('briefing-active');
    }
  };
})();
