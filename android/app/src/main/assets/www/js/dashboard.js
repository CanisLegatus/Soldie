/* ══════════════════════════════════════════════════════════════
   dashboard.js — дашборд и его детализации
   ══════════════════════════════════════════════════════════════ */

function stockBucketKey(r) {
  const st = num(r['склад кол']);
  const sdl = stockDaysLeft(r);
  if (st <= 0) return 'empty';
  if (!isFinite(sdl.days)) return 'nosales';
  if (sdl.days <= 14) return 'd14';
  if (sdl.days <= 30) return 'd30';
  if (sdl.days <= 90) return 'd90';
  return 'over';
}
const STOCK_BUCKETS = {
  empty:   { label: 'Пусто / обнулено', color: '#ef4444' },
  d14:     { label: 'Хватит ≤ 14 дн', color: '#f59e0b' },
  d30:     { label: '15–30 дн', color: '#eab308' },
  d90:     { label: '31–90 дн', color: '#10b981' },
  over:    { label: '> 90 дн (затоваривание)', color: '#f97316' },
  nosales: { label: 'Не продаётся', color: '#64748b' }
};
function markupBucketKey(r) {
  const c = num(r['себ, руб.']), p = num(r['цена маг, руб.']);
  if (c <= 0) return 'no';
  const m = (p - c) / c * 100;
  if (m < 0) return 'neg';
  if (m < 10) return 'b10';
  if (m < 20) return 'b20';
  if (m < 40) return 'b40';
  if (m < 70) return 'b70';
  return 'b70p';
}
const MK_LABELS = { neg: '< 0% (убыток)', b10: '0–10%', b20: '10–20%', b40: '20–40%', b70: '40–70%', b70p: '≥ 70%', no: 'нет себестоимости' };

function renderDashboard() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  const log = getLogistics(cfg);
  const A = aggRows(rawData);
  const markupStock = scopeMarkupStock(rawData);
  const avgPrice = A.sold > 0 ? A.to / A.sold : 0;
  const top100sum = [...rawData].sort((a, b) => num(b['то, руб']) - num(a['то, руб'])).slice(0, 100).reduce((s, r) => s + num(r['то, руб']), 0);
  const share = A.to > 0 ? (top100sum / A.to * 100).toFixed(1) : '—';
  const problems = buildProblems(log);
  const deadPctSku = A.sku > 0 ? A.deadCount / A.sku * 100 : 0;
  const deadPctStock = A.stockSum > 0 ? A.deadSum / A.stockSum * 100 : 0;

  const cards = [
    { key: 'to', icon: '💰', label: 'ТО (оборот)', value: fmt(A.to) + ' ₽', sub: `валовая прибыль ${fmt(A.gp)} ₽` },
    { key: 'gp', icon: '📈', label: 'Валовая прибыль', value: fmt(A.gp) + ' ₽', sub: `маржа ${A.margin.toFixed(1)}% · наценка ${A.markup.toFixed(1)}%` },
    { key: 'markup', icon: '🏷', label: 'Наценка магазина', value: A.markup.toFixed(1) + '%', sub: `по складу ${markupStock.toFixed(1)}% · маржа ${A.margin.toFixed(1)}%` },
    { key: 'sales', icon: '🛒', label: 'Продажи', value: fmt(A.sold) + ' шт', sub: `средняя цена ${fmt(avgPrice, 2)} ₽` },
    { key: 'stock', icon: '📦', label: 'Склад', value: fmt(A.stockSum) + ' ₽', sub: `${fmt(A.stock)} шт · оборачиваемость ${fmtDays(A.turnover)} дн.` },
    { key: 'dead', icon: '🧊', label: 'Мёртвый сток', value: fmt(A.deadSum) + ' ₽', sub: `${A.deadCount} SKU · ${deadPctSku.toFixed(1)}% SKU · ${deadPctStock.toFixed(1)}% склада`, cls: deadPctStock > 15 ? 'dk-alert' : '' },
    { key: 'turnover', icon: '🔄', label: 'Оборачиваемость', value: fmtDays(A.turnover) + ' дн.', sub: `скорость ${A.rate.toFixed(1)} шт/день`, cls: !isFinite(A.turnover) ? 'dk-alert' : '' },
    { key: 'top100', icon: '🏆', label: 'Доля ТОП-100 в ТО', value: share + '%', sub: fmt(top100sum) + ' ₽', action: 'top100' },
    { key: 'problems', icon: '🚨', label: 'Проблемы', value: fmt(problems.length), sub: ISSUE_TYPES.map(t => `${t.icon}${problems.filter(p => p.type === t.key).length}`).join('  '), cls: problems.length ? 'dk-alert' : 'dk-good', action: 'issues' }
  ];

  const tease = [...problems].sort((a, b) => issuePriority(b) - issuePriority(a)).slice(0, 5);
  const teaseHtml = tease.length
    ? tease.map(p => {
        const meta = ISSUE_TYPES.find(t => t.key === p.type);
        return `<div class="dash-tease-row" data-open-product data-code="${escapeHtml(p.code)}">${meta.icon} <b>${escapeHtml(p.code)}</b> — ${escapeHtml(truncateStr(p.r['товар'], 48))} <span class="text-muted" style="margin-left:auto">→</span></div>`;
      }).join('')
    : '<div class="alert-item alert-ok">🎉 Срочных проблем нет</div>';

  dashContent.innerHTML = `
    <div class="dash-kpis">
      ${cards.map(c => `<div class="dash-kpi ${c.cls || ''}" ${c.action === 'issues' ? 'data-jump-issues="all"' : c.action === 'top100' ? 'data-jump-mode="top100"' : `data-dash-open="${c.key}"`}>
        <span class="dk-icon">${c.icon}</span>
        <div class="dk-label">${c.label}</div>
        <div class="dk-value">${c.value}</div>
        <div class="dk-sub">${c.sub}</div>
        ${c.action ? '' : '<div class="dk-open">детализация →</div>'}
      </div>`).join('')}
    </div>
    <div class="dash-grid">
      <div class="dash-card"><h4>🥧 Доли групп в ТО <span class="hint">(клик по сегменту — открыть группу)</span></h4><div class="dash-chart"><canvas id="dashC1"></canvas></div></div>
      <div class="dash-card"><h4>📦 Состояние стока <span class="hint">(клик — список товаров сегмента)</span></h4><div class="dash-chart"><canvas id="dashC2"></canvas></div></div>
      <div class="dash-card"><h4>🚨 Проблемы по типам <span class="hint">(клик — открыть тип)</span></h4><div class="dash-chart"><canvas id="dashC3"></canvas></div></div>
      <div class="dash-card">
        <h4>🔥 Самое срочное</h4>
        ${teaseHtml}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
          <button type="button" class="chip" data-jump-issues="all">🚨 Все проблемы</button>
          <button type="button" class="chip" data-jump-mode="analysis">🔬 Анализ</button>
          <button type="button" class="chip" data-jump-mode="top100">🏆 ТОП-100</button>
          <button type="button" class="chip" data-jump-mode="zones">🧱 Зоны</button>
          <button type="button" class="chip" data-jump-mode="gifts">🎁 Подарки</button>
        </div>
      </div>
    </div>
  `;
  dashCard.classList.remove('hidden');

  dashCharts.forEach(c => c.destroy()); dashCharts = [];
  if (typeof Chart === 'undefined') return;

  const gSorted = byGroupAgg(rawData, 'группа 1').sort((a, b) => b.a.to - a.a.to);
  const gTop = gSorted.slice(0, 8);
  const gRest = gSorted.slice(8).reduce((s, e) => s + e.a.to, 0);
  const gLabels = gTop.map(e => e.g); const gVals = gTop.map(e => e.a.to);
  if (gRest > 0) { gLabels.push('Прочее'); gVals.push(gRest); }
  dashCharts.push(new Chart(document.getElementById('dashC1'), {
    type: 'doughnut',
    data: { labels: gLabels, datasets: [{ data: gVals, backgroundColor: PALETTE }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } },
      onClick: (evt, els) => { if (els && els.length) { const lb = gLabels[els[0].index]; if (lb !== 'Прочее') openGroup(lb); } }
    }
  }));

  const bKeys = Object.keys(STOCK_BUCKETS);
  const bCounts = {}; bKeys.forEach(k => bCounts[k] = 0);
  rawData.forEach(r => bCounts[stockBucketKey(r)]++);
  const bActive = bKeys.filter(k => bCounts[k] > 0);
  dashCharts.push(new Chart(document.getElementById('dashC2'), {
    type: 'doughnut',
    data: { labels: bActive.map(k => STOCK_BUCKETS[k].label), datasets: [{ data: bActive.map(k => bCounts[k]), backgroundColor: bActive.map(k => STOCK_BUCKETS[k].color) }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } },
      onClick: (evt, els) => {
        if (els && els.length) {
          const k = bActive[els[0].index];
          openProductListDrill(`📦 Сток: ${STOCK_BUCKETS[k].label}`, rawData.filter(r => stockBucketKey(r) === k), `${bCounts[k]} SKU`);
        }
      }
    }
  }));

  dashCharts.push(new Chart(document.getElementById('dashC3'), {
    type: 'bar',
    data: {
      labels: ISSUE_TYPES.map(t => `${t.icon} ${t.label}`),
      datasets: [{ data: ISSUE_TYPES.map(t => problems.filter(p => p.type === t.key).length), backgroundColor: ['#ef4444', '#a855f7', '#64748b', '#f59e0b', '#8b5cf6', '#0ea5e9'], borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      onClick: (evt, els) => { if (els && els.length) jumpToIssues(ISSUE_TYPES[els[0].index].key); }
    }
  }));

  showStatus(`✅ Дашборд: ${fmt(A.sku)} SKU, ТО ${fmt(A.to)} ₽, проблем: ${problems.length}.`, 'success');
}

dashContent.addEventListener('click', e => {
  const d = e.target.closest('[data-dash-open]');
  if (d) { openDashDrill(d.dataset.dashOpen); return; }
  const ji = e.target.closest('[data-jump-issues]');
  if (ji) { jumpToIssues(ji.dataset.jumpIssues); return; }
  const jm = e.target.closest('[data-jump-mode]');
  if (jm) { switchMode(jm.dataset.jumpMode); return; }
  const p = e.target.closest('[data-open-product]');
  if (p) openProduct(p.dataset.code, null);
});
document.getElementById('dashRefreshBtn').addEventListener('click', renderDashboard);

// ── Детализации ──
let currentDrillKey = null;
function drillShell(title, sub, tilesHtml, bodyHtml, pageKey) {
  currentDrillKey = pageKey || null;
  modalBox.innerHTML = `
    <div class="modal-head">
      <div style="min-width:0">
        <div class="breadcrumb">📊 Дашборд · детализация</div>
        <h3>${title}</h3>
        <div class="text-muted">${sub}</div>
      </div>
      <div style="display:flex;gap:6px">
        ${pageKey ? `<button type="button" data-an-page-jump="${pageKey}">🔬 Полная страница →</button>` : ''}
        <button type="button" class="btn-export" id="drillExportBtn">⬇️ Excel</button>
        <button class="modal-close" type="button" data-modal-close>✕ Закрыть</button>
      </div>
    </div>
    ${tilesHtml ? `<div class="kpi-grid">${tilesHtml}</div>` : ''}
    ${bodyHtml}
  `;
  modalOverlay.classList.remove('hidden');
}

function groupDrillTable(entries, totalTo, sortKey) {
  const sorted = [...entries].sort((a, b) => (sortKey === 'gp' ? b.a.gp - a.a.gp : sortKey === 'sold' ? b.a.sold - a.a.sold : sortKey === 'stock' ? b.a.stockSum - a.a.stockSum : b.a.to - a.a.to));
  const rows = sorted.map(e => `<tr>
    <td><span class="link-cell" data-open-group data-g1="${escapeHtml(e.g)}">${escapeHtml(e.g)}</span></td>
    <td>${fmt(e.a.sku)}</td>
    <td>${fmt(e.a.to)} ₽</td>
    ${shareCell(e.a.to, totalTo)}
    <td>${fmt(e.a.gp)} ₽</td>
    <td>${e.a.margin.toFixed(1)}%</td>
    <td>${e.a.markup.toFixed(1)}%</td>
    <td>${fmt(e.a.sold)} шт</td>
    <td>${fmt(e.a.stockSum)} ₽</td>
    <td>${coverBadge(e.a.turnover)}</td>
  </tr>`).join('');
  return `<div class="zone-scroll" style="max-height:52vh"><table class="mini-table sortable" style="margin-top:0">
    <thead><tr><th>Группа 1</th><th>SKU</th><th>ТО</th><th>Доля</th><th>ВП</th><th>Маржа</th><th>Наценка</th><th>Продано</th><th>Склад</th><th>Оборач.</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div class="hint" style="margin-top:6px">Клик по группе — её карточка. Клик по заголовку — сортировка.</div>`;
}

function openDashDrill(key) {
  const A = aggRows(rawData);
  const groups = byGroupAgg(rawData, 'группа 1');

  if (key === 'to') {
    drillShell('💰 ТО (оборот) — состав и доли', `Весь магазин · ${fmt(A.sku)} SKU`,
      tileHtml('ТО', fmt(A.to) + ' ₽', 'kpi-accent') + tileHtml('Валовая прибыль', fmt(A.gp) + ' ₽', '', `маржа ${A.margin.toFixed(1)}%`) + tileHtml('Продано', fmt(A.sold) + ' шт'),
      groupDrillTable(groups, A.to, 'to'), 'to');
    return;
  }
  if (key === 'gp') {
    drillShell('📈 Валовая прибыль — по группам', `ТО − ТО по себестоимости`,
      tileHtml('Валовая прибыль', fmt(A.gp) + ' ₽', A.gp < 0 ? 'kpi-danger' : 'kpi-accent') + tileHtml('Маржа', A.margin.toFixed(1) + '%') + tileHtml('Наценка (по продажам)', A.markup.toFixed(1) + '%'),
      groupDrillTable(groups, A.to, 'gp'), 'gp');
    return;
  }
  if (key === 'markup') {
    const mkStock = scopeMarkupStock(rawData);
    const dist = {};
    Object.keys(MK_LABELS).forEach(k => dist[k] = { sku: 0, to: 0, stockSum: 0 });
    rawData.forEach(r => {
      const k = markupBucketKey(r);
      dist[k].sku++;
      dist[k].to += num(r['то, руб']);
      const st = num(r['склад кол']);
      dist[k].stockSum += num(r['склад сумма, руб.']) || st * num(r['себ, руб.']);
    });
    const distRows = Object.keys(MK_LABELS).map(k => `<tr style="cursor:pointer" data-mk-bucket="${k}">
      <td><b>${MK_LABELS[k]}</b></td><td>${fmt(dist[k].sku)}</td><td>${fmt(dist[k].to)} ₽</td><td>${fmt(dist[k].stockSum)} ₽</td><td class="text-muted">открыть →</td>
    </tr>`).join('');
    const gRows = [...groups].sort((a, b) => b.a.markup - a.a.markup).map(e => `<tr>
      <td><span class="link-cell" data-open-group data-g1="${escapeHtml(e.g)}">${escapeHtml(e.g)}</span></td>
      <td style="font-weight:700">${e.a.markup.toFixed(1)}%</td>
      <td>${e.a.margin.toFixed(1)}%</td>
      <td>${fmt(e.a.to)} ₽</td>
      <td>${fmt(e.a.gp)} ₽</td>
    </tr>`).join('');
    drillShell('🏷 Наценка магазина — полная картина', 'Наценка = (ТО − ТО по себестоимости) / ТО по себестоимости',
      tileHtml('Наценка по продажам', A.markup.toFixed(1) + '%', 'kpi-accent', 'ТО против себестоимости проданного') +
      tileHtml('Маржа', A.margin.toFixed(1) + '%', '', 'ВП в доле ТО') +
      tileHtml('Наценка по складу', mkStock.toFixed(1) + '%', '', 'средняя по остаткам (цена маг. vs себ)'),
      `<h4>Распределение наценки по артикулам <span class="hint">(клик по строке — список товаров)</span></h4>
       <table class="mini-table sortable"><thead><tr><th>Диапазон наценки</th><th>SKU</th><th>ТО</th><th>Склад</th><th></th></tr></thead><tbody>${distRows}</tbody></table>
       <h4>Наценка по группам</h4>
       <div class="zone-scroll" style="max-height:36vh"><table class="mini-table sortable" style="margin-top:0"><thead><tr><th>Группа 1</th><th>Наценка</th><th>Маржа</th><th>ТО</th><th>ВП</th></tr></thead><tbody>${gRows}</tbody></table></div>`, 'markup');
    return;
  }
  if (key === 'sales') {
    const avgPrice = A.sold > 0 ? A.to / A.sold : 0;
    drillShell('🛒 Продажи — состав', 'Штуки, выручка, средняя цена',
      tileHtml('Продано', fmt(A.sold) + ' шт', 'kpi-accent') + tileHtml('ТО', fmt(A.to) + ' ₽') + tileHtml('Средняя цена единицы', fmt(avgPrice, 2) + ' ₽'),
      groupDrillTable(groups, A.to, 'sold'), 'sales');
    return;
  }
  if (key === 'stock') {
    const gRows = [...groups].sort((a, b) => b.a.stockSum - a.a.stockSum).map(e => `<tr>
      <td><span class="link-cell" data-open-group data-g1="${escapeHtml(e.g)}">${escapeHtml(e.g)}</span></td>
      <td>${fmt(e.a.stockSum)} ₽</td>
      ${shareCell(e.a.stockSum, A.stockSum)}
      <td>${fmt(e.a.stock)} шт</td>
      <td>${fmt(e.a.deadSum)} ₽</td>
      <td>${coverBadge(e.a.turnover)}</td>
    </tr>`).join('');
    drillShell('📦 Склад — структура запаса', `Деньги, штуки, мёртвая часть, оборачиваемость`,
      tileHtml('Склад', fmt(A.stockSum) + ' ₽', 'kpi-accent', `${fmt(A.stock)} шт`) +
      tileHtml('Мёртвый сток', fmt(A.deadSum) + ' ₽', A.deadSum > 0 ? 'kpi-warn' : '', `${A.deadCount} SKU`) +
      tileHtml('Оборачиваемость', fmtDays(A.turnover) + ' дн.'),
      `<div class="zone-scroll" style="max-height:52vh"><table class="mini-table sortable" style="margin-top:0">
        <thead><tr><th>Группа 1</th><th>Склад</th><th>Доля</th><th>Шт</th><th>Мёртвый сток</th><th>Оборач.</th></tr></thead>
        <tbody>${gRows}</tbody></table></div>`, 'stock');
    return;
  }
  if (key === 'dead') {
    const dead = rawData.filter(isDeadRow).sort((a, b) => itemFrozen(b) - itemFrozen(a));
    const rows = dead.slice(0, 500).map(r => {
      const code = String(r['код'] ?? '').trim();
      const age = itemAgeDays(r);
      return `<tr>
        <td><span class="link-cell" data-open-product data-code="${escapeHtml(code)}">${escapeHtml(code)}</span></td>
        <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 50))}</td>
        <td>${escapeHtml(String(r['группа 1'] ?? '').trim() || '—')}</td>
        <td>${cubeBadge(r['кубы'])}</td>
        <td>${fmt(num(r['склад кол']))}</td>
        <td style="font-weight:700">${fmt(itemFrozen(r))} ₽</td>
        <td>${fmtDate(r['дата ввоза'])}</td>
        <td>${age != null ? age + ' дн.' : '—'}</td>
      </tr>`;
    }).join('');
    const deadSum = dead.reduce((s, r) => s + itemFrozen(r), 0);
    drillShell('🧊 Мёртвый сток — замороженные деньги', 'Товары на складе без продаж',
      tileHtml('Заморожено', fmt(deadSum) + ' ₽', 'kpi-danger') +
      tileHtml('SKU', fmt(dead.length), '', `${A.sku > 0 ? (dead.length / A.sku * 100).toFixed(1) : 0}% ассортимента`) +
      tileHtml('Доля в складе', (A.stockSum > 0 ? deadSum / A.stockSum * 100 : 0).toFixed(1) + '%'),
      `<div class="zone-scroll" style="max-height:52vh"><table class="mini-table sortable" style="margin-top:0">
        <thead><tr><th>Код</th><th>Товар</th><th>Группа 1</th><th>КУБЫ</th><th>Склад шт</th><th>Заморожено</th><th>Ввоз</th><th>Лежит</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8">Мёртвого стока нет 🎉</td></tr>'}</tbody></table></div>
        ${dead.length > 500 ? `<div class="hint">Показаны первые 500 из ${dead.length}.</div>` : ''}`, 'dead');
    return;
  }
  if (key === 'turnover') {
    const gRows = [...groups].sort((a, b) => (isFinite(b.a.turnover) ? b.a.turnover : 1e9) - (isFinite(a.a.turnover) ? a.a.turnover : 1e9)).map(e => `<tr>
      <td><span class="link-cell" data-open-group data-g1="${escapeHtml(e.g)}">${escapeHtml(e.g)}</span></td>
      <td>${fmt(e.a.stock)} шт</td>
      <td>${e.a.rate.toFixed(2)} шт/дн</td>
      <td>${coverBadge(e.a.turnover)}</td>
      <td>${fmt(e.a.to)} ₽</td>
    </tr>`).join('');
    drillShell('🔄 Оборачиваемость', 'Запас ÷ скорость продаж. Чем меньше дней — тем быстрее оборот.',
      tileHtml('По магазину', fmtDays(A.turnover) + ' дн.', 'kpi-accent', `${A.rate.toFixed(1)} шт/день суммарно`) +
      tileHtml('Склад', fmt(A.stock) + ' шт') +
      tileHtml('Продано', fmt(A.sold) + ' шт'),
      `<div class="zone-scroll" style="max-height:52vh"><table class="mini-table sortable" style="margin-top:0">
        <thead><tr><th>Группа 1</th><th>Склад шт</th><th>Скорость</th><th>Оборачиваемость</th><th>ТО</th></tr></thead>
        <tbody>${gRows}</tbody></table></div>`, 'turnover');
    return;
  }
}

function openProductListDrill(title, items, sub) {
  const rows = items.slice(0, 500).map(r => {
    const code = String(r['код'] ?? '').trim();
    const c = num(r['себ, руб.']), p = num(r['цена маг, руб.']);
    const mk = c > 0 ? ((p - c) / c * 100).toFixed(1) + '%' : '—';
    return `<tr>
      <td><span class="link-cell" data-open-product data-code="${escapeHtml(code)}">${escapeHtml(code)}</span></td>
      <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 50))}</td>
      <td>${escapeHtml(String(r['группа 1'] ?? '').trim() || '—')}</td>
      <td>${cubeBadge(r['кубы'])}</td>
      <td>${fmt(p, 2)}</td>
      <td>${fmt(c, 2)}</td>
      <td>${mk}</td>
      <td>${fmt(num(r['склад кол']))}</td>
      <td>${fmt(num(r['то, руб']))} ₽</td>
      <td class="${rowGp(r) < 0 ? 'fire-text' : ''}">${fmt(rowGp(r))} ₽</td>
    </tr>`;
  }).join('');
  drillShell(title, sub || `${items.length} SKU`, '',
    `<div class="zone-scroll" style="max-height:56vh"><table class="mini-table sortable" style="margin-top:0">
      <thead><tr><th>Код</th><th>Товар</th><th>Группа 1</th><th>КУБЫ</th><th>Цена</th><th>Себ</th><th>Наценка</th><th>Склад</th><th>ТО</th><th>ВП</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="10">Пусто</td></tr>'}</tbody></table></div>
      ${items.length > 500 ? `<div class="hint">Показаны первые 500 из ${items.length}.</div>` : ''}`);
}
