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
        <label>Период анализа<select id="briefingPeriod"><option value="month">С начала месяца</option><option value="week">Последние 7 дней</option></select></label>
        <label>Ориентация A4<select id="briefingOrientation"><option value="portrait">Книжная</option><option value="landscape">Альбомная</option></select></label>
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
  el('Orientation').value = preferences.orientation === 'landscape' ? 'landscape' : 'portrait';
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
    const { range, month, kpi, day, sku, calendar, closed, pace, time, notes, used, focus } = view;
    const monthlyCards = el('Period').value === 'month';
    const benchmark = month.competition;
    const forecastCutoff = month.forecastDate && month.forecastDate !== range.end ? 'Срез на ' + date(month.forecastDate) : '';
    const tone = value => R.status(value, thresholds.good, thresholds.watch);
    const monthCards = [
      [month.monthClosed ? 'Итог месяца' : 'Прогноз ТО к концу месяца', pct(month.forecast), tone(month.forecast)],
      ['Месячный план', money(month.plan)],
      [month.factDate === range.end ? 'Факт с начала месяца' : 'Факт на ' + date(month.factDate), money(month.fact)],
      ['Осталось до плана', money(month.left)],
      [closed ? 'К графику на отчётную дату' : 'К графику закрытых дней', sign(month.paceGap, '₽')]
    ];
    const kpis = [
      ['Товарооборот', kpi.to, '₽'], ['Валовая прибыль', kpi.vp, '₽'],
      ['Наценка', kpi.markup, '%'], ['Чеки', kpi.checks, 'шт.']
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

    let fallbackFocus = [pace.to, pace.checks, sku?.gap, day.vp.achieved].some(R.valid)
      ? 'По доступным данным значимых отклонений нет.' : 'Загрузите отчёты для определения приоритетов.';
    if (!closed && day.checks.left > 0 && day.avg.left > 0) {
      fallbackFocus = `До закрытия осталось пробить ${format(day.checks.left)} чеков со средним чеком ${format(day.avg.left)} ₽.`;
    } else if (!closed && !R.valid(day.checks.fact) && day.checks.plan > 0 && day.avg.plan > 0) {
      fallbackFocus = `Цель на день — ${format(day.checks.plan)} чеков со средним чеком ${format(day.avg.plan)} ₽.`;
    }
    const reportNotes = notes.length ? `<p class="briefing-data-note">${notes.map(esc).join(' ')}</p>` : '';
    const sources = [...new Set(used.map(source => source.label))].join(' · ');
    el('Sheet').innerHTML = `
      <header class="briefing-report-head">
        <div><div class="briefing-report-brand">SOLDIE <span></span> ${esc(store.region || 'Управление магазином')}</div>
        <h2>Ежедневный брифинг</h2><p>${esc(store.name)}</p></div>
        <time datetime="${range.end}"><span>Отчётная дата</span><strong>${date(range.end)}</strong></time>
      </header>
      <section class="briefing-today">
        ${sectionTitle(closed ? 'План на день' : 'План на сегодня', closed ? 'День завершён' : time ? 'Данные на ' + time : 'День идёт · время среза неизвестно')}
        <div class="briefing-daily-goals">
          ${dailyGoal('Товарооборот', day.to, '₽', closed)}
          ${dailyGoal('Чеки', day.checks, 'шт.', closed)}
        </div>
        <div class="briefing-daily-extra">
          ${dailyDetail('Средний чек', day.avg, '₽', closed, true)}
          ${dailyDetail('Валовая прибыль', day.vp, '₽', closed)}
        </div>
        <p class="briefing-day-summary">${summary}</p>
      </section>
      <section class="briefing-focus"><h3>Фокус дня</h3><div>${(focus.length ? focus : [fallbackFocus])
        .map(item => `<p>${esc(item)}</p>`).join('')}</div></section>
      <section class="briefing-month">
        <div class="briefing-ring ${Math.abs(month.achieved) >= 1000 ? 'briefing-ring-long' : Math.abs(month.achieved) >= 100 ? 'briefing-ring-wide' : ''}" style="--progress:${width(month.achieved)}%" aria-label="Выполнение месяца ${R.valid(month.achieved) ? format(month.achieved, 1) + '%' : 'нет данных'}">
          <div><strong>${pct(month.achieved)}</strong><span>план месяца</span></div>
        </div>
        <div class="briefing-month-info">
          ${sectionTitle('Положение за месяц', forecastCutoff || rangeLabel(range.monthStart, range.end))}
          <dl>${monthCards.map(([label, value, state]) => state ? `<div class="briefing-month-forecast ${state}"><dt>${label}</dt><dd>${value}</dd></div>` : labelValue(label, value)).join('')}</dl>
          ${benchmark ? `<div class="briefing-competition" aria-label="${benchmark.monthClosed ? 'Рейтинг по итогу ТО' : 'Рейтинг по прогнозу ТО'}">
            <div class="briefing-rank" title="Место среди магазинов с сопоставимыми данными в выгрузке"><span>${benchmark.country ? 'Место по РФ' : 'Место в сети'}</span>
              <strong>${benchmark.rank} <small>из ${benchmark.count}</small></strong></div>
            ${[['К сети', benchmark.network], ['К региону', benchmark.regional]].map(([label, reference]) => {
              const gap = R.delta(benchmark.own, reference);
              const state = R.valid(gap) ? gap > 0 ? 'good' : gap < 0 ? 'bad' : 'unknown' : 'unknown';
              return `<div class="${state}" title="${label} ${pct(reference)}"><span>${label}</span><strong>${sign(gap, 'п. п.', 1)}</strong></div>`;
            }).join('')}
          </div>` : ''}

        </div>
      </section>
      <section class="briefing-kpi">
        ${sectionTitle(monthlyCards ? month.monthClosed ? 'Итоги месяца' : 'Прогноз до конца месяца' : 'Ключевые показатели', monthlyCards && forecastCutoff ? forecastCutoff : rangeLabel(range.start, range.end))}
        <div class="briefing-kpi-grid">${kpis.map(([label, data, unit]) => {
          const markup = unit === '%';
          const value = monthlyCards ? data.forecast : markup ? data.fact : data.achieved;
          const completion = monthlyCards && markup ? R.percent(value, data.plan) : monthlyCards ? value : data.achieved;
          const color = tone(completion);
          const difference = R.valid(data.difference) ? ' title="Факт к плану ' + sign(data.difference, markup ? 'п. п.' : unit, markup ? 1 : 0) + '"' : '';
          return `<div class="briefing-kpi-card ${color}"${difference}>
            <h4>${label}</h4>
            <strong>${pct(value)}</strong>
            ${markup && R.valid(value) ? '' : `<span class="briefing-kpi-caption">${R.valid(value) ? 'от плана' : monthlyCards && !month.monthClosed ? 'Нет прогноза' : 'Нет данных'}</span>`}
            <div class="briefing-kpi-detail">План ${number(data.plan, unit, markup ? 1 : 0)}<br>Факт ${number(data.fact, unit, markup ? 1 : 0)}</div>
            ${progress(completion, color)}
          </div>`;
        }).join('')}</div>
      </section>
      <section class="briefing-activity">
        ${sectionTitle('План и факт по дням', rangeLabel(calendar[0].date, calendar.at(-1).date))}
        <div class="briefing-legend"><span>План</span><span>Факт</span><span>Отчётная дата</span></div>
        ${calendarChart(calendar, 'to', 'Товарооборот', '₽', range.end)}
        ${calendarChart(calendar, 'checks', 'Чеки', 'шт.', range.end)}
      </section>
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
      <footer class="briefing-foot">
        <span>${sources ? 'Источники · ' + esc(sources) : 'Источники не загружены'}</span>
        <span>— показатель недоступен</span>
        ${reportNotes}
      </footer>`;
    const supplementary = el('Sources');
    supplementary.innerHTML = `<p>Место и отрыв рассчитаны по прогнозу выполнения плана ТО из одного среза. Сеть и регион взвешены по плану. Наценка — ВП / себестоимость. Пенетрация 3SKU — продажи акционных единиц на 100 чеков. Дневная цель распределяется по сроку действия каждой позиции.</p>
      ${used.length ? `<ul>${used.map(source => `<li>${esc(source.label)} · ${esc(source.name || 'Загруженный отчёт')}
        · ${source.period ? rangeLabel(source.period.start, source.period.end) : 'период не указан'}${source.time ? ', срез ' + source.time : ''}
        · импорт ${dateTime(source.importedAt)}</li>`).join('')}</ul>` : '<p>Загрузите «Статистику расширенную» и «Рейтинг / план-факт» в Vision. Настройки акции и продажи берутся из 3SKU.</p>'}`;
  }

  function dailyGoal(label, row, unit, closed) {
    return `<div class="briefing-day-goal">
      <h4>${label}</h4>
      <strong class="briefing-target">${number(row.plan, unit)}</strong>
      ${progress(row.achieved, closed && !R.valid(row.achieved) ? 'unknown' : 'day-progress')}
      <div class="briefing-day-result"><span>Факт <b>${number(row.fact, unit)}</b></span>
        <span>${closed ? 'Итог' : 'Осталось'} <b>${closed ? pct(row.achieved) : number(row.left, unit)}</b></span></div>
    </div>`;
  }

  function dailyDetail(label, row, unit, closed, average = false) {
    const target = closed ? pct(row.achieved) : number(row.left, unit);
    const targetLabel = closed ? 'Итог' : average ? 'Нужен на оставшиеся чеки' : 'Осталось';
    return `<div class="briefing-day-detail"><h4>${label}</h4>
      <span>План <b>${number(row.plan, unit)}</b></span><span>Факт <b>${number(row.fact, unit)}</b></span>
      <span>${targetLabel} <b>${target}</b></span></div>`;
  }

  const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
  function calendarChart(calendar, metric, label, unit, selected) {
    const values = calendar.flatMap(row => [row[metric].plan, row[metric].fact]).filter(R.valid);
    if (!values.length) return `<div class="briefing-chart"><h4>${label}</h4><p>Нет дневных данных за этот период.</p></div>`;
    const low = Math.min(0, ...values);
    const high = Math.max(1, ...values);
    const percentOfScale = value => value / (high - low) * 100;
    const formatAxis = value => compact.format(value) + ' ' + unit;
    return `<div class="briefing-chart">
      <div class="briefing-chart-label"><h4>${label}</h4><span>Шкала ${formatAxis(low)} — ${formatAxis(high)}</span></div>
      <div class="briefing-chart-days" style="--days:${calendar.length};--zero:${percentOfScale(-low)}%">
        ${calendar.map(({ date: day, [metric]: point }, index) => {
          const caption = `${date(day)} · план ${number(point.plan, unit)} · факт ${number(point.fact, unit)}`;
          const showLabel = calendar.length <= 7 || day === selected || index === 0 || index === calendar.length - 1 ||
            (index % 7 === 0 && index < calendar.length - 2);
          return `<div class="briefing-chart-day${day === selected ? ' selected' : ''}" data-date="${day}" title="${caption}">
            <div class="briefing-chart-bars">
              ${['plan', 'fact'].map(kind => R.valid(point[kind])
                ? `<i class="briefing-chart-bar ${kind}${point[kind] < 0 ? ' negative' : ''}${point[kind] === 0 ? ' zero' : ''}" style="--bar:${percentOfScale(Math.abs(point[kind]))}%"></i>` : '').join('')}
            </div>
            <span>${showLabel ? day.slice(-2) : ''}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function refresh(message = '') {
    const today = todayISO();
    const imports = BriefingData.sources();
    const stores = BriefingData.storesFrom(imports);
    const preferred = selectedStore || VisionMeeting.storeKey(VisionMeeting.selected());
    el('Store').innerHTML = stores.length ? stores.map(store => `<option value="${esc(store.key)}">${esc(store.name)}</option>`).join('')
      : '<option value="">Нет загруженных магазинов</option>';
    el('Store').value = stores.find(store => store.key === preferred)?.key || stores[0]?.key || '';
    el('Date').max = today;
    el('Date').value = selectedDate && selectedDate <= today ? selectedDate : today;
    const positive = el('Good').valueAsNumber;
    const good = Math.max(0, Math.min(200, Number.isFinite(positive) ? positive : 100));
    const watch = Math.max(0, Math.min(good, Number.isFinite(el('Watch').valueAsNumber) ? el('Watch').valueAsNumber : 90));
    el('Good').value = good;
    el('Watch').value = watch;
    const store = stores.find(store => store.key === el('Store').value);
    const end = el('Date').value;
    const mode = el('Period').value;
    const orientation = el('Orientation').value;
    card.classList.toggle('briefing-landscape', orientation === 'landscape');
    const thresholds = { good, watch };
    const skuApi = window.sku3Api;
    const skuMatches = store && store.key !== 'магазин' && VisionMeeting.storeKey(skuApi?.getSettings().storeName) === store.key;
    const skuMetrics = skuMatches ? skuApi.computeMetrics() : null;
    const skuImports = skuMatches ? skuApi.getState().imports : [];
    const view = BriefingData.build({ imports, store: store || { key: '' }, end, today, mode, thresholds, skuMetrics, skuImports });
    render(view, store || { name: 'Магазин не выбран' }, thresholds);
    document.title = store ? 'Ежедневный брифинг · ' + store.name + ' · ' + date(end) : 'Ежедневный брифинг · Soldie';
    el('Print').disabled = el('Pdf').disabled = !store;
    el('Status').textContent = message || (store ? '' : 'Загрузите отчёты в Vision, чтобы выбрать магазин.');
    preferences = { store: selectedStore, end: selectedDate, mode, orientation, ...thresholds };
    try { localStorage.setItem(storage, JSON.stringify(preferences)); } catch { /* Report works without storage. */ }
  }

  function printReport() {
    if (window.AndroidBridge?.printDailyBriefing) window.AndroidBridge.printDailyBriefing(el('Orientation').value === 'landscape');
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
