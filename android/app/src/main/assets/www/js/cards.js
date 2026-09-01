window.__bootStamp && window.__bootStamp('js/cards.js: выполнение');
/* ══════════════════════════════════════════════════════════════
   cards.js — карточки товара и группы (модальные)
   ══════════════════════════════════════════════════════════════ */

function openProduct(code, backPath) {
  const r = codeIndex.get(String(code ?? '').trim());
  if (!r) return;

  const cost = num(r['себ, руб.']), priceM = num(r['цена маг, руб.']), priceTN = num(r['цена тн, руб']);
  const stock = num(r['склад кол']);
  const stockSum = num(r['склад сумма, руб.']) || stock * cost;
  const sold = num(r['продано (шт)']), toRub = num(r['то, руб']), toSS = num(r['то сс, руб']);
  const gp = toRub - toSS;
  const margin = toRub > 0 ? gp / toRub * 100 : 0;
  const priceMargin = cost > 0 ? (priceM - cost) / cost * 100 : null;
  const sdl = stockDaysLeft(r);
  const rate = dailyRate(r);
  const cubeRaw = String(r['кубы'] ?? '').trim();
  const ck = cubeKind(cubeRaw);
  const g1 = String(r['группа 1'] ?? '').trim(), g2 = String(r['группа 2'] ?? '').trim(), g3 = String(r['группа 3'] ?? '').trim();

  const crumbs = [];
  if (g1) crumbs.push(`<span class="link-cell" data-open-group data-g1="${escapeHtml(g1)}">${escapeHtml(g1)}</span>`);
  if (g2) crumbs.push(`<span class="link-cell" data-open-group data-g1="${escapeHtml(g1)}" data-g2="${escapeHtml(g2)}">${escapeHtml(g2)}</span>`);
  if (g3) crumbs.push(`<span class="link-cell" data-open-group data-g1="${escapeHtml(g1)}" data-g2="${escapeHtml(g2)}" data-g3="${escapeHtml(g3)}">${escapeHtml(g3)}</span>`);

  const backBtnHtml = backPath ? `<button class="back-btn" type="button" data-back-groups="${escapeHtml(JSON.stringify(backPath))}">← Назад к группе</button>` : '';

  const alerts = [];
  if (ck) alerts.push({ cls: 'alert-dark', text: `🏷 Товар стоит в КУБЕ: <b>${escapeHtml(cubeRaw)}</b>${ck === 'ЗО' || ck === 'ЗО сеть' ? ' — отгрузки запрещены' : ''}` });
  if (stock <= 0 && sold > 0) alerts.push({ cls: 'alert-fire', text: '🚫 Остаток на складе закончился при живых продажах' });
  else if (isFinite(sdl.days) && sdl.days <= 14 && stock > 0)
    alerts.push({ cls: sdl.days <= 7 ? 'alert-fire' : 'alert-warn', text: `⏳ Стока осталось на ${fmtDays(sdl.days)} дн.${sdl.approx ? ' (оценка по скорости продаж)' : ''}` });
  if (!isFinite(sdl.days) && stock > 0) alerts.push({ cls: 'alert-dark', text: '🧊 Товар не продаётся — сток не убывает' });

  const daysKpiCls = !isFinite(sdl.days) ? 'kpi-danger' : sdl.days <= 7 ? 'kpi-danger' : sdl.days <= 14 ? 'kpi-warn' : 'kpi-accent';

  const tiles = [
    { l: 'Цена магазина', v: fmt(priceM, 2) + ' ₽', cls: 'kpi-accent' },
    { l: 'Цена ТН', v: fmt(priceTN, 2) + ' ₽' },
    { l: 'Себестоимость', v: fmt(cost, 2) + ' ₽' },
    { l: 'Наценка', v: priceMargin === null ? '—' : priceMargin.toFixed(1) + '%' },
    { l: 'Склад', v: fmt(stock) + ' шт', sub: fmt(stockSum) + ' ₽' },
    { l: 'Продано', v: fmt(sold) + ' шт' },
    { l: 'ТО', v: fmt(toRub) + ' ₽' },
    { l: 'Валовая прибыль', v: fmt(gp) + ' ₽', sub: 'маржа ' + margin.toFixed(1) + '%' },
    { l: 'Сток закончится через', v: fmtDays(sdl.days) + (isFinite(sdl.days) ? ' дн.' : ''), cls: daysKpiCls, sub: sdl.approx ? 'оценка по скорости' : (!isFinite(sdl.days) && stock > 0 ? 'нет продаж' : '') },
    { l: 'Скорость продаж', v: rate > 0 ? rate.toFixed(2) + ' шт/день' : '0 шт/день' }
  ];

  modalBox.innerHTML = `
    <div class="modal-head">
      <div style="min-width:0">
        <div class="breadcrumb">${backBtnHtml}🗂 ${crumbs.join(' <span>›</span> ') || 'без группы'}</div>
        <h3>${escapeHtml(r['код'])} — ${escapeHtml(r['товар'] || 'без названия')}</h3>
        <div>${cubeBadge(cubeRaw)}</div>
      </div>
      <button class="modal-close" type="button" data-modal-close>✕ Закрыть</button>
    </div>
    ${alerts.length ? `<div class="alerts">${alerts.map(a => `<div class="alert-item ${a.cls}">${a.text}</div>`).join('')}</div>` : ''}
    <div class="kpi-grid">
      ${tiles.map(t => `<div class="kpi ${t.cls || ''}"><div class="kpi-label">${t.l}</div><div class="kpi-value">${t.v}</div>${t.sub ? `<div class="kpi-sub">${t.sub}</div>` : ''}</div>`).join('')}
    </div>
    ${stock > 0 ? `<div class="chart-box"><canvas id="modalCanvas"></canvas></div>` : '<div class="alert-item alert-fire" style="margin:12px 0">📉 Склад пуст — строить прогноз стока не по чему.</div>'}
    <div class="dates-row">📅 Ввоз: ${fmtDate(r['дата ввоза'])} · Переоценка: ${fmtDate(r['дата переоценки'])} · Окончание продаж: ${fmtDate(r['дата окончания продаж'])}</div>
  `;
  modalOverlay.classList.remove('hidden');
  if (stock > 0) buildProductChart(r);
}

function openCube(rawCube) {
  const cube = String(rawCube || '').trim();
  const items = rawData.filter(r => String(r['кубы'] || '').trim() === cube);
  if (!items.length) return;
  const A = aggRows(items);
  const byGroup = byGroupAgg(items, 'группа 1').sort((a, b) => b.a.to - a.a.to);
  const rows = byGroup.map(e => `<tr><td><span class="link-cell" data-open-group data-g1="${escapeHtml(e.g)}">${escapeHtml(e.g)}</span></td><td>${fmt(e.a.sku)}</td><td>${fmt(e.a.to)} ₽</td><td>${fmt(e.a.gp)} ₽</td><td>${fmt(e.a.stockSum)} ₽</td><td>${coverBadge(e.a.turnover)}</td></tr>`).join('');
  modalBox.innerHTML = `<div class="modal-head"><div><div class="breadcrumb">🏷 Карточка КУБА</div><h3>${cubeBadge(cube)}</h3></div><button class="modal-close" type="button" data-modal-close>✕ Закрыть</button></div><div class="kpi-grid">${tileHtml('SKU',fmt(A.sku))}${tileHtml('ТО',fmt(A.to)+' ₽','kpi-accent')}${tileHtml('Валовая прибыль',fmt(A.gp)+' ₽','',`маржа ${A.margin.toFixed(1)}%`) }${tileHtml('Склад',fmt(A.stockSum)+' ₽','',`${fmt(A.stock)} шт`) }${tileHtml('Оборачиваемость',fmtDays(A.turnover)+' дн.','',`${A.rate.toFixed(1)} шт/дн`)}</div><div class="zone-scroll"><table class="mini-table sortable"><thead><tr><th>Группа 1</th><th>SKU</th><th>ТО</th><th>ВП</th><th>Склад</th><th>Оборач.</th></tr></thead><tbody>${rows}</tbody></table></div><div class="hint">Клик по группе открывает её карточку. КУБ агрегирован по всем товарам с этим значением.</div>`;
  modalOverlay.classList.remove('hidden');
}

function buildProductChart(r) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('modalCanvas');
  if (!ctx) return;

  const stock = num(r['склад кол']), sold = num(r['продано (шт)']);
  const imp = parseDate(r['дата ввоза']);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sdl = stockDaysLeft(r);
  const dLabel = d => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

  const labels = [], fact = [], forecast = [];
  const init = stock + sold;

  if (imp && imp < today) {
    labels.push(dLabel(imp), dLabel(today) + ' (сегодня)');
    fact.push(init, stock);
    forecast.push(null, stock);
  } else {
    labels.push(dLabel(today) + ' (сегодня)');
    forecast.push(stock);
  }

  if (isFinite(sdl.days) && stock > 0) {
    const end = new Date(today);
    end.setDate(end.getDate() + Math.max(1, Math.round(sdl.days)));
    labels.push(dLabel(end));
    fact.push(null);
    forecast.push(0);
  } else if (stock > 0) {
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    labels.push(dLabel(end));
    fact.push(null);
    forecast.push(stock);
  }

  if (modalChart) modalChart.destroy();
  modalChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Остаток (оценка от даты ввоза)', data: fact, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.10)', fill: true, tension: 0.15, pointRadius: 4 },
      { label: 'Прогноз выгорания стока', data: forecast, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', borderDash: [6, 4], fill: true, tension: 0.15, pointRadius: 4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 14, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'шт' } }, x: { grid: { display: false } } }
    }
  });
}

function openGroup(g1, g2 = '', g3 = '') {
  const items = rawData.filter(r => {
    if (String(r['группа 1'] ?? '').trim() !== g1) return false;
    if (g2 && String(r['группа 2'] ?? '').trim() !== g2) return false;
    if (g3 && String(r['группа 3'] ?? '').trim() !== g3) return false;
    return true;
  });
  if (!items.length) return;
  currentGroupPath = [g1, g2, g3];
  currentGroupItems = items;
  currentGroupTab = 'to';
  renderGroupCard();
}

function renderGroupCard() {
  const items = currentGroupItems;
  const agg = items.reduce((a, r) => {
    a.stock   += num(r['склад кол']);
    a.stockSum += num(r['склад сумма, руб.']) || num(r['склад кол']) * num(r['себ, руб.']);
    a.sold    += num(r['продано (шт)']);
    a.to      += num(r['то, руб']);
    a.toss    += num(r['то сс, руб']);
    return a;
  }, { stock: 0, stockSum: 0, sold: 0, to: 0, toss: 0 });
  const gp = agg.to - agg.toss;
  const margin = agg.to > 0 ? gp / agg.to * 100 : 0;
  const markup = agg.toss > 0 ? gp / agg.toss * 100 : 0;
  const path = currentGroupPath.filter(Boolean).join(' / ') || 'без группы';

  const metricFn = METRIC_FNS[currentGroupTab];
  const tops = [...items].sort((a, b) => metricFn(b) - metricFn(a)).slice(0, 10);

  const alerts = [];
  tops.forEach(r => {
    const label = `${escapeHtml(r['код'])} · ${escapeHtml(truncateStr(r['товар'], 42))}`;
    const stock = num(r['склад кол']);
    const sdl = stockDaysLeft(r);
    const ck = cubeKind(r['кубы']);
    if (stock <= 0 && num(r['продано (шт)']) > 0)
      alerts.push({ cls: 'alert-fire', text: `🚫 ${label} — сток закончился при живых продажах` });
    else if (isFinite(sdl.days) && sdl.days <= 14 && stock > 0)
      alerts.push({ cls: sdl.days <= 7 ? 'alert-fire' : 'alert-warn', text: `⏳ ${label} — стока на ${fmtDays(sdl.days)} дн.` });
    if (ck) alerts.push({ cls: 'alert-dark', text: `🏷 ${label} — стоит в ${ck}` });
  });

  const tabs = [['to', '💰 По ТО'], ['qty', '📦 По штукам'], ['gp', '📈 По валовой прибыли']];
  const unit = currentGroupTab === 'qty' ? ' шт' : ' ₽';

  modalBox.innerHTML = `
    <div class="modal-head">
      <div style="min-width:0">
        <div class="breadcrumb">🗂 Карточка группы</div>
        <h3>${escapeHtml(path)}</h3>
        <div class="text-muted">${items.length} SKU</div>
      </div>
      <button class="modal-close" type="button" data-modal-close>✕ Закрыть</button>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Артикулов</div><div class="kpi-value">${fmt(items.length)}</div></div>
      <div class="kpi"><div class="kpi-label">Склад</div><div class="kpi-value">${fmt(agg.stock)} шт</div><div class="kpi-sub">${fmt(agg.stockSum)} ₽</div></div>
      <div class="kpi"><div class="kpi-label">Продано</div><div class="kpi-value">${fmt(agg.sold)} шт</div></div>
      <div class="kpi kpi-accent"><div class="kpi-label">ТО</div><div class="kpi-value">${fmt(agg.to)} ₽</div><div class="kpi-sub">по себестоимости: ${fmt(agg.toss)} ₽</div></div>
      <div class="kpi ${gp < 0 ? 'kpi-danger' : ''}"><div class="kpi-label">Валовая прибыль</div><div class="kpi-value">${fmt(gp)} ₽</div><div class="kpi-sub">маржа ${margin.toFixed(1)}% · наценка ${markup.toFixed(1)}%</div></div>
    </div>

    <div class="tabs">
      ${tabs.map(([k, l]) => `<button type="button" class="tab-btn ${k === currentGroupTab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}
    </div>

    ${alerts.length
      ? `<div class="alerts">${alerts.map(a => `<div class="alert-item ${a.cls}">${a.text}</div>`).join('')}</div>`
      : '<div class="alerts"><div class="alert-item alert-ok">✅ По ТОП-10 проблем не найдено</div></div>'}

    <div class="chart-box"><canvas id="modalCanvas"></canvas></div>

    <table class="mini-table sortable">
      <thead><tr><th>№</th><th>Код</th><th>Товар</th><th>КУБЫ</th><th>Склад</th><th>Ост. дней</th><th>${METRIC_TITLES[currentGroupTab]}</th><th>ВП</th><th>Наценка</th></tr></thead>
      <tbody>
        ${tops.map((r, i) => {
          const mk = rowGpMarkup(r);
          return `<tr class="clickable" data-open-product data-code="${escapeHtml(String(r['код'] ?? '').trim())}">
            <td>${i + 1}</td>
            <td><span class="link-cell">${escapeHtml(r['код'])}</span></td>
            <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 56))}</td>
            <td>${cubeBadge(r['кубы'])}</td>
            <td>${fmt(num(r['склад кол']))}</td>
            <td>${daysBadgeR(r)}</td>
            <td style="font-weight:700">${fmt(metricFn(r))}${unit}</td>
            <td class="${rowGp(r) < 0 ? 'fire-text' : ''}">${fmt(rowGp(r))} ₽</td>
            <td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  modalOverlay.classList.remove('hidden');
  buildGroupChart(tops);
}

function buildGroupChart(tops) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('modalCanvas');
  if (!ctx) return;
  const metricFn = METRIC_FNS[currentGroupTab];
  const labels = tops.map(r => String(r['код'] ?? ''));
  const vals = tops.map(metricFn);
  const colors = tops.map(r => cubeKind(r['кубы']) ? '#ef4444' : '#2563eb');
  if (modalChart) modalChart.destroy();
  modalChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: METRIC_TITLES[currentGroupTab], data: vals, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
    }
  });
}
