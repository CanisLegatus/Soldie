/* ══════════════════════════════════════════════════════════════
   analysis.js — «Анализ»: страницы показателей + срез по кодам
   ══════════════════════════════════════════════════════════════ */

const AN_PAGES = [
  { key: 'hierarchy', icon: '🗂', label: 'Обзор структуры' },
  { key: 'to',        icon: '💰', label: 'ТО' },
  { key: 'gp',        icon: '📈', label: 'Валовая прибыль' },
  { key: 'markup',    icon: '🏷', label: 'Наценка' },
  { key: 'sales',     icon: '🛒', label: 'Продажи' },
  { key: 'stock',     icon: '📦', label: 'Склад' },
  { key: 'dead',      icon: '🧊', label: 'Мёртвый сток' },
  { key: 'turnover',  icon: '🔄', label: 'Оборачиваемость' }
];

function parseAnCodes(v) {
  return [...new Set(String(v || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))].slice(0, 500);
}

function renderAnalysis() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  anPageChips.innerHTML = AN_PAGES.map(p =>
    `<button type="button" class="chip ${p.key === anPage ? 'active' : ''}" data-an-page="${p.key}">${p.icon} ${p.label}</button>`).join('');
  const codes = parseAnCodes(anCodesInput.value);
  if (codes.length) renderAnCodesView(codes);
  else if (anPage === 'hierarchy') renderAnHierarchy();
  else renderAnMetricPage(anPage);
  analysisCard.classList.remove('hidden');
}

function anCrumbsHtml() {
  const crumbs = [`<span class="crumb ${anPath.length === 0 ? 'current' : ''}" data-an-level="0">⌂ Магазин</span>`];
  anPath.forEach((p, i) => {
    crumbs.push('<span class="text-muted">›</span>');
    crumbs.push(`<span class="crumb ${i === anPath.length - 1 ? 'current' : ''}" data-an-level="${i + 1}">${escapeHtml(p)}</span>`);
  });
  return `<div class="crumb-row">${crumbs.join('')}</div>`;
}
function anTabsHtml(level, itemsCount) {
  return `<div class="tabs">
    ${level < 3 ? `<button type="button" class="tab-btn ${anTab === 'groups' ? 'active' : ''}" data-an-tab="groups">📁 Подгруппы</button>` : ''}
    <button type="button" class="tab-btn ${anTab === 'items' ? 'active' : ''}" data-an-tab="items">📦 Товары (${itemsCount})</button>
  </div>`;
}

function renderAnCodesView(codes) {
  const found = [], missing = [];
  codes.forEach(c => { const r = codeIndex.get(c); if (r) found.push(r); else missing.push(c); });
  const A = aggRows(found);
  const tiles =
    tileHtml('Найдено SKU', fmt(found.length), 'kpi-accent', `из ${codes.length} введённых`) +
    tileHtml('ТО', fmt(A.to) + ' ₽') +
    tileHtml('Валовая прибыль', fmt(A.gp) + ' ₽', '', `маржа ${A.margin.toFixed(1)}% · наценка ${A.markup.toFixed(1)}%`) +
    tileHtml('Склад', fmt(A.stockSum) + ' ₽', '', `${fmt(A.stock)} шт`) +
    tileHtml('Продано', fmt(A.sold) + ' шт');
  const missHtml = missing.length
    ? `<div class="alert-item alert-warn" style="margin-bottom:10px">⚠️ Не найдено в отчёте (${missing.length}): ${missing.slice(0, 20).map(escapeHtml).join(', ')}${missing.length > 20 ? '…' : ''}</div>`
    : '';
  const rows = found.map(r => {
    const code = String(r['код'] ?? '').trim();
    const mk = itemMarkup(r);
    const gpItem = rowGp(r);
    return `<tr>
      <td><span class="link-cell" data-open-product data-code="${escapeHtml(code)}">${escapeHtml(code)}</span></td>
      <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 46))}</td>
      <td>${escapeHtml(String(r['группа 1'] ?? '').trim() || '—')}</td>
      <td>${escapeHtml(String(r['группа 2'] ?? '').trim() || '—')}</td>
      <td>${escapeHtml(String(r['группа 3'] ?? '').trim() || '—')}</td>
      <td>${cubeBadge(r['кубы'])}</td>
      <td>${fmt(num(r['цена маг, руб.']), 2)}</td>
      <td>${fmt(num(r['себ, руб.']), 2)}</td>
      <td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td>
      <td>${fmt(num(r['склад кол']))}</td>
      <td>${fmt(num(r['продано (шт)']))}</td>
      <td>${fmt(num(r['то, руб']))} ₽</td>
      <td class="${gpItem < 0 ? 'fire-text' : ''}">${fmt(gpItem)} ₽</td>
      <td>${daysBadgeR(r)}</td>
    </tr>`;
  }).join('');
  anContent.innerHTML = missHtml +
    `<div class="kpi-grid">${tiles}</div>
     <div class="zone-scroll" style="max-height:60vh">
       <table class="mini-table sortable" style="margin-top:0">
         <thead><tr><th>Код</th><th>Товар</th><th>Группа 1</th><th>Группа 2</th><th>Группа 3</th><th>КУБЫ</th><th>Цена маг</th><th>Себ</th><th>Наценка</th><th>Склад</th><th>Продано</th><th>ТО</th><th>ВП</th><th>Ост. дней</th></tr></thead>
         <tbody>${rows || '<tr><td colspan="14">Ничего не найдено</td></tr>'}</tbody>
       </table>
     </div>
     <div class="hint" style="margin-top:6px">Клик по коду — карточка товара. Клик по заголовку — сортировка. Очистите поле, чтобы вернуться к дереву анализа.</div>`;
  anTitle.textContent = `🔬 Анализ — произвольный список (${codes.length} кодов)`;
}

function renderAnHierarchy() {
  const storeA = aggRows(rawData);
  const nodeRows = rawData.filter(r => anPath.every((v, i) => String(r[`группа ${i + 1}`] ?? '').trim() === v));
  const A = aggRows(nodeRows);
  const level = anPath.length;
  if (level >= 3) anTab = 'items';

  const shareOfStore = storeA.to > 0 ? A.to / storeA.to * 100 : 0;
  const tiles =
    tileHtml('SKU', fmt(A.sku)) +
    tileHtml('ТО', fmt(A.to) + ' ₽', 'kpi-accent', level ? `доля в ТО магазина: ${shareOfStore.toFixed(1)}%` : 'весь магазин') +
    tileHtml('Валовая прибыль', fmt(A.gp) + ' ₽', '', `маржа ${A.margin.toFixed(1)}% · наценка ${A.markup.toFixed(1)}%`) +
    tileHtml('Продано', fmt(A.sold) + ' шт') +
    tileHtml('Склад', fmt(A.stockSum) + ' ₽', '', `${fmt(A.stock)} шт`) +
    tileHtml('Оборачиваемость', fmtDays(A.turnover) + ' дн.', !isFinite(A.turnover) ? 'kpi-danger' : '', `${A.rate.toFixed(1)} шт/день`);

  let body = '';
  if (anTab === 'groups' && level < 3) {
    const childKey = `группа ${level + 1}`;
    const entries = byGroupAgg(nodeRows, childKey).sort((a, b) => b.a.to - a.a.to);
    const rows = entries.map(e => `<tr>
      <td><span class="link-cell" data-an-child="${escapeHtml(e.g)}"><b>${escapeHtml(e.g)}</b></span></td>
      <td>${fmt(e.a.sku)}</td>
      <td>${fmt(e.a.to)} ₽</td>
      ${shareCell(e.a.to, A.to)}
      <td>${fmt(e.a.gp)} ₽</td>
      <td>${e.a.margin.toFixed(1)}%</td>
      <td>${e.a.markup.toFixed(1)}%</td>
      <td>${fmt(e.a.sold)} шт</td>
      <td>${fmt(e.a.stockSum)} ₽</td>
      <td>${coverBadge(e.a.turnover)}</td>
    </tr>`).join('');
    body = `<div class="zone-scroll" style="max-height:56vh"><table class="mini-table sortable" style="margin-top:0">
      <thead><tr><th>Группа ${level + 1}</th><th>SKU</th><th>ТО</th><th>Доля</th><th>ВП</th><th>Маржа</th><th>Наценка</th><th>Продано</th><th>Склад</th><th>Оборач.</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="10">Нет подгрупп</td></tr>'}</tbody></table></div>
      <div class="hint" style="margin-top:6px">Клик по группе — провалиться ниже. Клик по заголовку — сортировка.</div>`;

    anContent.innerHTML = anCrumbsHtml() + anTabsHtml(level, A.sku) + `<div class="kpi-grid">${tiles}</div>` +
      `<div class="chart-box" style="height:220px"><canvas id="anC1"></canvas></div>` + body;

    if (typeof Chart !== 'undefined' && entries.length) {
      if (anChart) anChart.destroy();
      const top = entries.slice(0, 8);
      const rest = entries.slice(8).reduce((s, e) => s + e.a.to, 0);
      const labels = top.map(e => e.g); const vals = top.map(e => e.a.to);
      if (rest > 0) { labels.push('Прочее'); vals.push(rest); }
      anChart = new Chart(document.getElementById('anC1'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: vals, backgroundColor: PALETTE }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } },
          onClick: (evt, els) => { if (els && els.length) { const lb = labels[els[0].index]; if (lb !== 'Прочее') { anPath.push(lb); renderAnalysis(); } } }
        }
      });
    }
  } else {
    const items = [...nodeRows].sort((a, b) => num(b['то, руб']) - num(a['то, руб'])).slice(0, 500);
    const rows = items.map(r => {
      const code = String(r['код'] ?? '').trim();
      const mk = rowGpMarkup(r);
      return `<tr>
        <td><span class="link-cell" data-open-product data-code="${escapeHtml(code)}">${escapeHtml(code)}</span></td>
        <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 56))}</td>
        <td>${cubeBadge(r['кубы'])}</td>
        <td>${fmt(num(r['склад кол']))}</td>
        <td>${fmt(num(r['продано (шт)']))}</td>
        <td>${fmt(num(r['то, руб']))} ₽</td>
        ${shareCell(num(r['то, руб']), A.to)}
        <td class="${rowGp(r) < 0 ? 'fire-text' : ''}">${fmt(rowGp(r))} ₽</td>
        <td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td>
        <td>${daysBadgeR(r)}</td>
      </tr>`;
    }).join('');
    body = `<div class="zone-scroll" style="max-height:56vh"><table class="mini-table sortable" style="margin-top:0">
      <thead><tr><th>Код</th><th>Товар</th><th>КУБЫ</th><th>Склад</th><th>Продано</th><th>ТО</th><th>Доля</th><th>ВП</th><th>Наценка</th><th>Ост. дней</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="10">Нет товаров</td></tr>'}</tbody></table></div>
      ${nodeRows.length > 500 ? `<div class="hint">Показаны топ-500 по ТО из ${nodeRows.length}.</div>` : ''}`;
    anContent.innerHTML = anCrumbsHtml() + anTabsHtml(level, A.sku) + `<div class="kpi-grid">${tiles}</div>` + body;
  }
  anTitle.textContent = `🔬 Анализ — Обзор структуры${level ? ' — ' + escapeHtml(anPath.join(' / ')) : ''}`;
}

function renderAnMetricPage(page) {
  const meta = AN_PAGES.find(p => p.key === page);
  const storeA = aggRows(rawData);
  const nodeRows = rawData.filter(r => anPath.every((v, i) => String(r[`группа ${i + 1}`] ?? '').trim() === v));
  const scope = page === 'dead' ? nodeRows.filter(isDeadRow) : nodeRows;
  const A = aggRows(scope);
  const nodeA = page === 'dead' ? aggRows(nodeRows) : null;
  const level = anPath.length;
  if (level >= 3) anTab = 'items';

  const shareTxt = (v, base) => base > 0 ? `доля в магазине: ${(v / base * 100).toFixed(1)}%` : '';
  let tiles = '';
  if (page === 'to') {
    tiles = tileHtml('ТО узла', fmt(A.to) + ' ₽', 'kpi-accent', shareTxt(A.to, storeA.to)) +
      tileHtml('Валовая прибыль', fmt(A.gp) + ' ₽', '', `маржа ${A.margin.toFixed(1)}%`) +
      tileHtml('Наценка', A.markup.toFixed(1) + '%') +
      tileHtml('Продано', fmt(A.sold) + ' шт') + tileHtml('SKU', fmt(A.sku));
  } else if (page === 'gp') {
    tiles = tileHtml('Валовая прибыль', fmt(A.gp) + ' ₽', A.gp < 0 ? 'kpi-danger' : 'kpi-accent', shareTxt(A.gp, storeA.gp)) +
      tileHtml('Маржа', A.margin.toFixed(1) + '%') + tileHtml('Наценка', A.markup.toFixed(1) + '%') +
      tileHtml('ТО', fmt(A.to) + ' ₽') + tileHtml('SKU', fmt(A.sku));
  } else if (page === 'markup') {
    const loss = scope.filter(r => { const m = itemMarkup(r); return m !== null && m < 0; });
    const lossTO = loss.reduce((s, r) => s + num(r['то, руб']), 0);
    tiles = tileHtml('Наценка (по продажам)', A.markup.toFixed(1) + '%', 'kpi-accent', 'ВП ÷ себестоимость проданного') +
      tileHtml('Маржа', A.margin.toFixed(1) + '%') +
      tileHtml('Наценка по складу', scopeMarkupStock(scope).toFixed(1) + '%', '', 'средняя по остаткам') +
      tileHtml('Убыточных SKU', fmt(loss.length), loss.length ? 'kpi-danger' : '', loss.length ? `их ТО ${fmt(lossTO)} ₽` : 'все с плюсом');
  } else if (page === 'sales') {
    tiles = tileHtml('Продано', fmt(A.sold) + ' шт', 'kpi-accent', shareTxt(A.sold, storeA.sold)) +
      tileHtml('ТО', fmt(A.to) + ' ₽') +
      tileHtml('Средняя цена', (A.sold > 0 ? fmt(A.to / A.sold, 2) : '—') + ' ₽') +
      tileHtml('ВП', fmt(A.gp) + ' ₽') +
      tileHtml('SKU с продажами', fmt(scope.filter(r => num(r['продано (шт)']) > 0).length));
  } else if (page === 'stock') {
    tiles = tileHtml('Склад', fmt(A.stockSum) + ' ₽', 'kpi-accent', `${fmt(A.stock)} шт · ${shareTxt(A.stockSum, storeA.stockSum)}`) +
      tileHtml('Мёртвый сток', fmt(A.deadSum) + ' ₽', A.deadSum ? 'kpi-warn' : '', `${A.deadCount} SKU · ${A.stockSum > 0 ? (A.deadSum / A.stockSum * 100).toFixed(1) : 0}%`) +
      tileHtml('Оборачиваемость', fmtDays(A.turnover) + ' дн.') + tileHtml('SKU', fmt(A.sku));
  } else if (page === 'dead') {
    const ages = scope.map(itemAgeDays).filter(v => v !== null);
    const avgAge = ages.length ? Math.round(ages.reduce((s, v) => s + v, 0) / ages.length) : null;
    tiles = tileHtml('Заморожено', fmt(A.stockSum) + ' ₽', 'kpi-danger', storeA.deadSum > 0 ? `доля мёртвого стока магазина: ${(A.stockSum / storeA.deadSum * 100).toFixed(1)}%` : '') +
      tileHtml('Мёртвых SKU', fmt(A.sku)) +
      tileHtml('Доля в складе узла', (nodeA && nodeA.stockSum > 0 ? (A.stockSum / nodeA.stockSum * 100) : 0).toFixed(1) + '%') +
      tileHtml('Средний возраст', avgAge !== null ? avgAge + ' дн.' : '—');
  } else if (page === 'turnover') {
    tiles = tileHtml('Оборачиваемость', fmtDays(A.turnover) + ' дн.', !isFinite(A.turnover) ? 'kpi-danger' : 'kpi-accent', 'запас ÷ скорость продаж') +
      tileHtml('Скорость', A.rate.toFixed(1) + ' шт/дн') + tileHtml('Склад', fmt(A.stock) + ' шт') + tileHtml('ТО', fmt(A.to) + ' ₽');
  }

  if (anTab === 'groups' && level < 3) {
    const gt = anGroupsTable(page, scope, nodeRows, A, level);
    anContent.innerHTML = anCrumbsHtml() + anTabsHtml(level, scope.length) + `<div class="kpi-grid">${tiles}</div>` +
      `<div class="chart-box" style="height:220px"><canvas id="anC1"></canvas></div>` + gt.html +
      `<div class="hint" style="margin-top:6px">Клик по группе — провалиться ниже · клик по сегменту графика — переход в группу · клик по заголовку — сортировка.</div>`;
    buildAnChart(gt.entries, page);
  } else {
    anContent.innerHTML = anCrumbsHtml() + anTabsHtml(level, scope.length) + `<div class="kpi-grid">${tiles}</div>` + anItemsTable(page, scope, A);
  }
  anTitle.textContent = `🔬 Анализ: ${meta.icon} ${meta.label}${level ? ' — ' + escapeHtml(anPath.join(' / ')) : ' — весь магазин'}`;
}

function anGroupsTable(page, scope, nodeRows, A, level) {
  const childKey = `группа ${level + 1}`;
  const entries = byGroupAgg(scope, childKey);
  const fullMap = page === 'dead' ? new Map(byGroupAgg(nodeRows, childKey).map(e => [e.g, e.a])) : null;
  const sorters = {
    to: (x, y) => y.a.to - x.a.to,
    gp: (x, y) => y.a.gp - x.a.gp,
    markup: (x, y) => y.a.markup - x.a.markup,
    sales: (x, y) => y.a.sold - x.a.sold,
    stock: (x, y) => y.a.stockSum - x.a.stockSum,
    dead: (x, y) => y.a.stockSum - x.a.stockSum,
    turnover: (x, y) => ((isFinite(y.a.turnover) ? y.a.turnover : 1e12) - (isFinite(x.a.turnover) ? x.a.turnover : 1e12))
  };
  entries.sort(sorters[page] || sorters.to);
  const L = (g) => `<span class="link-cell" data-an-child="${escapeHtml(g)}"><b>${escapeHtml(g)}</b></span>`;
  const H = (cols) => `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
  let head = '', rows = '';

  if (page === 'to') {
    head = H([`Группа ${level + 1}`, 'SKU', 'ТО', 'Доля', 'ВП', 'Маржа', 'Наценка', 'Продано', 'Склад ₽']);
    rows = entries.map(e => `<tr><td>${L(e.g)}</td><td>${fmt(e.a.sku)}</td><td><b>${fmt(e.a.to)} ₽</b></td>${shareCell(e.a.to, A.to)}<td>${fmt(e.a.gp)} ₽</td><td>${e.a.margin.toFixed(1)}%</td><td>${e.a.markup.toFixed(1)}%</td><td>${fmt(e.a.sold)} шт</td><td>${fmt(e.a.stockSum)} ₽</td></tr>`).join('');
  } else if (page === 'gp') {
    head = H([`Группа ${level + 1}`, 'SKU', 'ВП', 'Доля', 'Маржа', 'Наценка', 'ТО', 'Продано', 'Склад ₽']);
    rows = entries.map(e => `<tr><td>${L(e.g)}</td><td>${fmt(e.a.sku)}</td><td><b class="${e.a.gp < 0 ? 'fire-text' : ''}">${fmt(e.a.gp)} ₽</b></td>${shareCell(e.a.gp, A.gp)}<td>${e.a.margin.toFixed(1)}%</td><td>${e.a.markup.toFixed(1)}%</td><td>${fmt(e.a.to)} ₽</td><td>${fmt(e.a.sold)} шт</td><td>${fmt(e.a.stockSum)} ₽</td></tr>`).join('');
  } else if (page === 'markup') {
    head = H([`Группа ${level + 1}`, 'SKU', 'Наценка', 'Маржа', 'ТО', 'ВП']);
    rows = entries.map(e => `<tr><td>${L(e.g)}</td><td>${fmt(e.a.sku)}</td><td><b>${e.a.markup.toFixed(1)}%</b></td><td>${e.a.margin.toFixed(1)}%</td><td>${fmt(e.a.to)} ₽</td><td>${fmt(e.a.gp)} ₽</td></tr>`).join('');
  } else if (page === 'sales') {
    head = H([`Группа ${level + 1}`, 'SKU', 'Продано', 'Доля', 'ТО', 'ВП', 'Наценка', 'Ср. цена', 'Склад ₽']);
    rows = entries.map(e => `<tr><td>${L(e.g)}</td><td>${fmt(e.a.sku)}</td><td><b>${fmt(e.a.sold)} шт</b></td>${shareCell(e.a.sold, A.sold)}<td>${fmt(e.a.to)} ₽</td><td>${fmt(e.a.gp)} ₽</td><td>${e.a.markup.toFixed(1)}%</td><td>${e.a.sold > 0 ? fmt(e.a.to / e.a.sold, 2) : '—'} ₽</td><td>${fmt(e.a.stockSum)} ₽</td></tr>`).join('');
  } else if (page === 'stock') {
    head = H([`Группа ${level + 1}`, 'SKU', 'Склад ₽', 'Доля', 'Шт', 'Мёртвый ₽', 'Оборач.']);
    rows = entries.map(e => `<tr><td>${L(e.g)}</td><td>${fmt(e.a.sku)}</td><td><b>${fmt(e.a.stockSum)} ₽</b></td>${shareCell(e.a.stockSum, A.stockSum)}<td>${fmt(e.a.stock)}</td><td>${fmt(e.a.deadSum)} ₽</td><td>${coverBadge(e.a.turnover)}</td></tr>`).join('');
  } else if (page === 'dead') {
    head = H([`Группа ${level + 1}`, 'Мёртвый ₽', 'Доля мёртвого', 'Мёртвых SKU', 'Склад группы ₽', '% мёртвого в группе']);
    rows = entries.map(e => {
      const full = fullMap.get(e.g) || e.a;
      const pct = full.stockSum > 0 ? e.a.stockSum / full.stockSum * 100 : 0;
      return `<tr><td>${L(e.g)}</td><td><b class="fire-text">${fmt(e.a.stockSum)} ₽</b></td>${shareCell(e.a.stockSum, A.stockSum)}<td>${fmt(e.a.sku)}</td><td>${fmt(full.stockSum)} ₽</td><td>${pct.toFixed(1)}%</td></tr>`;
    }).join('');
  } else {
    head = H([`Группа ${level + 1}`, 'SKU', 'Оборачиваемость', 'Склад шт', 'Скорость шт/дн', 'ТО', 'ВП']);
    rows = entries.map(e => `<tr><td>${L(e.g)}</td><td>${fmt(e.a.sku)}</td><td>${coverBadge(e.a.turnover)}</td><td>${fmt(e.a.stock)}</td><td>${e.a.rate.toFixed(2)}</td><td>${fmt(e.a.to)} ₽</td><td>${fmt(e.a.gp)} ₽</td></tr>`).join('');
  }

  return {
    entries,
    html: `<div class="zone-scroll" style="max-height:56vh"><table class="mini-table sortable" style="margin-top:0">${head}<tbody>${rows || '<tr><td colspan="10">Нет данных</td></tr>'}</tbody></table></div>`
  };
}

function anItemsTable(page, scope, A) {
  const sorters = {
    to: (a, b) => num(b['то, руб']) - num(a['то, руб']),
    gp: (a, b) => rowGp(b) - rowGp(a),
    markup: (a, b) => num(b['то, руб']) - num(a['то, руб']),
    sales: (a, b) => num(b['продано (шт)']) - num(a['продано (шт)']),
    stock: (a, b) => itemFrozen(b) - itemFrozen(a),
    dead: (a, b) => itemFrozen(b) - itemFrozen(a),
    turnover: (a, b) => {
      const da = stockDaysLeft(a).days, db = stockDaysLeft(b).days;
      return (isFinite(db) ? db : 1e12) - (isFinite(da) ? da : 1e12);
    }
  };
  const items = [...scope].sort(sorters[page] || sorters.to);
  const total = items.length;
  const shown = items.slice(0, 500);
  const P = (r) => `<span class="link-cell" data-open-product data-code="${escapeHtml(String(r['код'] ?? '').trim())}">${escapeHtml(String(r['код'] ?? '').trim())}</span>`;
  const N = (r) => `<td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 56))}</td>`;
  const H = (cols) => `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
  let head = '', rows = '';

  if (page === 'to') {
    head = H(['Код', 'Товар', 'КУБЫ', 'Продано', 'ТО', 'Доля', 'ВП', 'Наценка', 'Ост. дней']);
    rows = shown.map(r => { const mk = rowGpMarkup(r); return `<tr><td>${P(r)}</td>${N(r)}<td>${cubeBadge(r['кубы'])}</td><td>${fmt(num(r['продано (шт)']))}</td><td><b>${fmt(num(r['то, руб']))} ₽</b></td>${shareCell(num(r['то, руб']), A.to)}<td class="${rowGp(r) < 0 ? 'fire-text' : ''}">${fmt(rowGp(r))} ₽</td><td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td><td>${daysBadgeR(r)}</td></tr>`; }).join('');
  } else if (page === 'gp') {
    head = H(['Код', 'Товар', 'КУБЫ', 'ТО', 'ТО СС', 'ВП', 'Маржа', 'Наценка']);
    rows = shown.map(r => {
      const gpI = rowGp(r);
      const m = num(r['то, руб']) > 0 ? gpI / num(r['то, руб']) * 100 : 0;
      const mk = rowGpMarkup(r);
      return `<tr><td>${P(r)}</td>${N(r)}<td>${cubeBadge(r['кубы'])}</td><td>${fmt(num(r['то, руб']))} ₽</td><td>${fmt(num(r['то сс, руб']))} ₽</td><td><b class="${gpI < 0 ? 'fire-text' : ''}">${fmt(gpI)} ₽</b></td><td>${m.toFixed(1)}%</td><td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td></tr>`;
    }).join('');
  } else if (page === 'markup') {
    head = H(['Код', 'Товар', 'КУБЫ', 'Цена маг', 'Себ', 'Наценка %', 'ТО', 'ВП']);
    rows = shown.map(r => {
      const mk = itemMarkup(r);
      return `<tr><td>${P(r)}</td>${N(r)}<td>${cubeBadge(r['кубы'])}</td><td>${fmt(num(r['цена маг, руб.']), 2)}</td><td>${fmt(num(r['себ, руб.']), 2)}</td><td><b class="${mk !== null && mk < 0 ? 'fire-text' : ''}">${mk === null ? '—' : mk.toFixed(1) + '%'}</b></td><td>${fmt(num(r['то, руб']))} ₽</td><td>${fmt(rowGp(r))} ₽</td></tr>`;
    }).join('');
  } else if (page === 'sales') {
    head = H(['Код', 'Товар', 'КУБЫ', 'Продано', 'ТО', 'ВП', 'Наценка', 'Ср. цена', 'Ост. дней']);
    rows = shown.map(r => {
      const sold = num(r['продано (шт)']), to = num(r['то, руб']);
      const mk = rowGpMarkup(r);
      return `<tr><td>${P(r)}</td>${N(r)}<td>${cubeBadge(r['кубы'])}</td><td><b>${fmt(sold)} шт</b></td><td>${fmt(to)} ₽</td><td>${fmt(rowGp(r))} ₽</td><td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td><td>${sold > 0 ? fmt(to / sold, 2) : '—'} ₽</td><td>${daysBadgeR(r)}</td></tr>`;
    }).join('');
  } else if (page === 'stock') {
    head = H(['Код', 'Товар', 'КУБЫ', 'Склад шт', 'Склад ₽', 'Доля', 'ТО', 'Ост. дней']);
    rows = shown.map(r => {
      const f = itemFrozen(r);
      return `<tr><td>${P(r)}</td>${N(r)}<td>${cubeBadge(r['кубы'])}</td><td>${fmt(num(r['склад кол']))}</td><td><b>${fmt(f)} ₽</b></td>${shareCell(f, A.stockSum)}<td>${fmt(num(r['то, руб']))} ₽</td><td>${daysBadgeR(r)}</td></tr>`;
    }).join('');
  } else if (page === 'dead') {
    head = H(['Код', 'Товар', 'КУБЫ', 'Склад шт', 'Заморожено ₽', 'Ввоз', 'Лежит']);
    rows = shown.map(r => {
      const age = itemAgeDays(r);
      return `<tr><td>${P(r)}</td>${N(r)}<td>${cubeBadge(r['кубы'])}</td><td>${fmt(num(r['склад кол']))}</td><td><b class="fire-text">${fmt(itemFrozen(r))} ₽</b></td><td>${fmtDate(r['дата ввоза'])}</td><td>${age !== null ? age + ' дн.' : '—'}</td></tr>`;
    }).join('');
  } else {
    head = H(['Код', 'Товар', 'КУБЫ', 'Склад', 'Шт/дн', 'Ост. дней', 'ТО', 'ВП']);
    rows = shown.map(r => `<tr><td>${P(r)}</td>${N(r)}<td>${cubeBadge(r['кубы'])}</td><td>${fmt(num(r['склад кол']))}</td><td>${dailyRate(r).toFixed(2)}</td><td>${daysBadgeR(r)}</td><td>${fmt(num(r['то, руб']))} ₽</td><td>${fmt(rowGp(r))} ₽</td></tr>`).join('');
  }

  return `<div class="zone-scroll" style="max-height:56vh"><table class="mini-table sortable" style="margin-top:0">${head}<tbody>${rows || `<tr><td colspan="10">${page === 'dead' ? '🎉 Мёртвого стока здесь нет' : 'Нет товаров'}</td></tr>`}</tbody></table></div>
    ${total > 500 ? `<div class="hint">Показаны топ-500 из ${total}. Сортируйте заголовки, чтобы найти нужное.</div>` : ''}`;
}

function buildAnChart(entries, page) {
  const cv = document.getElementById('anC1');
  if (!cv || typeof Chart === 'undefined' || !entries.length) return;
  if (anChart) anChart.destroy();
  const additive = ['to', 'gp', 'sales', 'stock', 'dead'].includes(page);
  const descend = (lb) => { if (lb && lb !== 'Прочее') { anPath.push(lb); renderAnalysis(); } };

  if (additive) {
    const valFn = page === 'gp' ? e => e.a.gp
      : page === 'sales' ? e => e.a.sold
      : (page === 'stock' || page === 'dead') ? e => e.a.stockSum
      : e => e.a.to;
    const sorted = [...entries].sort((a, b) => valFn(b) - valFn(a));
    const top = sorted.slice(0, 8);
    const rest = sorted.slice(8).reduce((s, e) => s + valFn(e), 0);
    const labels = top.map(e => e.g); const vals = top.map(valFn);
    if (rest > 0) { labels.push('Прочее'); vals.push(rest); }
    anChart = new Chart(cv, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: vals, backgroundColor: PALETTE }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } },
        onClick: (evt, els) => { if (els && els.length) descend(labels[els[0].index]); }
      }
    });
  } else {
    const sorted = [...entries].sort((a, b) => b.a.to - a.a.to).slice(0, 10);
    const vals = sorted.map(e => page === 'markup' ? +e.a.markup.toFixed(1) : Math.min(isFinite(e.a.turnover) ? e.a.turnover : 365, 365));
    anChart = new Chart(cv, {
      type: 'bar',
      data: { labels: sorted.map(e => e.g), datasets: [{ data: vals, backgroundColor: '#2563eb', borderRadius: 4 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
        onClick: (evt, els) => { if (els && els.length) descend(sorted[els[0].index].g); }
      }
    });
  }
}

analysisCard.addEventListener('click', e => {
  const pg = e.target.closest('[data-an-page]');
  if (pg) { anPage = pg.dataset.anPage; renderAnalysis(); return; }
  const lvl = e.target.closest('[data-an-level]');
  if (lvl) { anPath = anPath.slice(0, +lvl.dataset.anLevel); renderAnalysis(); return; }
  const tab = e.target.closest('[data-an-tab]');
  if (tab) { anTab = tab.dataset.anTab; renderAnalysis(); return; }
  const ch = e.target.closest('[data-an-child]');
  if (ch) { anPath.push(ch.dataset.anChild); anTab = anPath.length >= 3 ? 'items' : 'groups'; renderAnalysis(); return; }
  const p = e.target.closest('[data-open-product]');
  if (p) { openProduct(p.dataset.code, null); return; }
  const g = e.target.closest('[data-open-group]');
  if (g) openGroup(g.dataset.g1 || '', g.dataset.g2 || '', g.dataset.g3 || '');
});

let anCodesTimer = null;
anCodesInput.addEventListener('input', () => {
  clearTimeout(anCodesTimer);
  anCodesTimer = setTimeout(() => { if (currentMode === 'analysis' && rawData.length) renderAnalysis(); }, 200);
});
anCodesClearBtn.addEventListener('click', () => {
  anCodesInput.value = '';
  if (rawData.length) renderAnalysis();
});