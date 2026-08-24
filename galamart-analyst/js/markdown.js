/* ══════════════════════════════════════════════════════════════
   markdown.js — уценка: алгоритм, таблица, живые итоги, экспорт
   ══════════════════════════════════════════════════════════════ */

// ── Алгоритм прогноза цены ──
function suggestPrice(currentPrice, stockDays, daysLeft) {
  if (!currentPrice || currentPrice <= 0) return 1;
  if (daysLeft <= 0) return 1;
  if (stockDays >= 9999) {
    const urgency = Math.max(0, Math.min(1, 1 - (daysLeft / 30)));
    const discount = 0.20 + urgency * 0.50;
    return roundTo9(currentPrice * (1 - discount));
  }
  if (!stockDays || stockDays <= 0) return currentPrice;
  const ratio = stockDays / daysLeft;
  if (ratio < 1) return currentPrice;
  const discount = 1 - (1 / Math.pow(ratio, 0.6));
  return roundTo9(currentPrice * (1 - discount));
}

function getPriceReason(currentPrice, stockDays, daysLeft) {
  if (daysLeft <= 0) return { text: '💀 Дедлайн — 1 ₽', cls: 'reason-dead' };
  if (stockDays >= 9999) {
    const urgency = Math.max(0, Math.min(1, 1 - (daysLeft / 30)));
    const pct = Math.round((0.20 + urgency * 0.50) * 100);
    return { text: `🤷 Не продавался — провокация -${pct}%`, cls: 'reason-unsold' };
  }
  if (!stockDays || stockDays <= 0) return { text: '❓ Нет данных', cls: 'reason-ok' };
  const ratio = stockDays / daysLeft;
  if (ratio < 1) return { text: `✅ Успеваем (×${ratio.toFixed(2)})`, cls: 'reason-ok' };
  const pct = Math.round((1 - (1 / Math.pow(ratio, 0.6))) * 100);
  if (ratio < 2) return { text: `⚠️ Давление ×${ratio.toFixed(1)} → -${pct}%`, cls: 'reason-soft' };
  return { text: `🔥 Горит ×${ratio.toFixed(1)} → -${pct}%`, cls: 'reason-hard' };
}

// Проверка на "непродающийся" товар (21+ дней без продаж)
function getUnsoldReason(row) {
  if (isUnsold21Days(row)) {
    const imp = parseDate(row['дата ввоза']);
    const days = Math.floor((Date.now() - imp.getTime()) / 86400000);
    return { text: `🧊 Не продается ${days} дн. (≥21)`, cls: 'reason-unsold' };
  }
  return null;
}

function ratioBadge(stockDays, daysLeft) {
  if (daysLeft <= 0)     return `<span class="ratio-badge ratio-fire">💀 0 дн.</span>`;
  if (stockDays >= 9999) return `<span class="ratio-badge ratio-fire">∞</span>`;
  if (!stockDays)        return `<span class="ratio-badge ratio-ok">—</span>`;
  const ratio = stockDays / daysLeft;
  if (ratio < 1) return `<span class="ratio-badge ratio-ok">✅ ×${ratio.toFixed(2)}</span>`;
  if (ratio < 2) return `<span class="ratio-badge ratio-warn">⚠️ ×${ratio.toFixed(2)}</span>`;
  return `<span class="ratio-badge ratio-fire">🔥 ×${ratio.toFixed(2)}</span>`;
}

// ── Таблица результатов ──
const HEAD_MD = `<tr><th>Код</th><th>Товар</th><th>Группа 1</th><th>КУБЫ</th><th>Себ, руб.</th><th>Цена ТН</th><th>Цена маг.</th><th>Наценка %</th><th>Склад (шт)</th><th>Продано (шт)</th><th>Ост. дней</th><th>Переоценка</th><th>⏳ До дедлайна</th><th>📊 Давление</th><th>💡 Прогноз цены</th><th>🧠 Причина</th><th>ВП остатка</th><th>🔧 Ваша цена</th><th>Δ цены</th><th>📈 Новая наценка</th></tr>`;
const HEAD_VIEW = `<tr><th>Код</th><th>Товар</th><th>Группа 1</th><th>Группа 2</th><th>Группа 3</th><th>КУБЫ</th><th>Себ, руб.</th><th>Цена ТН</th><th>Цена маг.</th><th>Наценка %</th><th>Склад (шт)</th><th>Продано (шт)</th><th>ТО, руб.</th><th>ВП, руб.</th><th>Ост. дней</th><th>🔍</th><th>🔧 Ваша цена</th><th>📈 Новая наценка</th></tr>`;

function renderTable(data, mode, daysLeft) {
  theadEl.innerHTML = mode === 'browse' ? HEAD_VIEW : HEAD_MD;
  tableBody.innerHTML = '';
  const frag = document.createDocumentFragment();

  data.forEach(row => {
    const cost      = num(row['себ, руб.']);
    const curPrice  = num(row['цена маг, руб.']);
    const stockDays = num(row['остатки, дней']);
    const stockQty  = num(row['склад кол']);
    const codeRaw   = String(row['код'] ?? '').trim();
    const codeEsc   = escapeHtml(codeRaw);
    const nameEsc   = escapeHtml(row['товар'] ?? '');
    const g1 = escapeHtml(String(row['группа 1'] ?? '').trim());
    const g2 = escapeHtml(String(row['группа 2'] ?? '').trim());
    const g3 = escapeHtml(String(row['группа 3'] ?? '').trim());
    const cubeRaw = String(row['кубы'] ?? '').trim();

    const tr = document.createElement('tr');
    tr.dataset.cost = cost;
    tr.dataset.code = codeRaw;
    tr.dataset.origprice = curPrice;
    tr.dataset.stock = stockQty;

    const productCell = (txt) => `<span class="link-cell" data-open-product data-code="${codeEsc}">${txt}</span>`;

    if (mode === 'browse') {
      const toRub = num(row['то, руб']);
      const gp = rowGp(row);
      const odCell = stockDays >= 9999 ? '<span class="ratio-badge ratio-fire">∞</span>'
                   : stockDays > 0 ? fmt(stockDays) : '—';
      tr.innerHTML = `
        <td>${productCell(codeEsc || '-')}</td>
        <td class="truncate" data-full="${nameEsc}">${productCell(nameEsc || '-')}</td>
        <td><span class="link-cell" data-open-group data-g1="${g1}">${g1 || '-'}</span></td>
        <td><span class="link-cell" data-open-group data-g1="${g1}" data-g2="${g2}">${g2 || '-'}</span></td>
        <td><span class="link-cell" data-open-group data-g1="${g1}" data-g2="${g2}" data-g3="${g3}">${g3 || '-'}</span></td>
        <td>${cubeBadge(cubeRaw)}</td>
        <td>${fmt(cost, 2)}</td>
        <td>${fmt(num(row['цена тн, руб']), 2)}</td>
        <td style="font-weight:500">${fmt(curPrice, 2)}</td>
        <td>${escapeHtml(row['наценка %'] ?? '-')}</td>
        <td>${fmt(stockQty)}</td>
        <td>${fmt(num(row['продано (шт)']))}</td>
        <td>${fmt(toRub)}</td>
        <td class="${gp < 0 ? 'fire-text' : ''}">${fmt(gp)}</td>
        <td>${odCell}</td>
        <td><button class="icon-btn" type="button" data-open-product data-code="${codeEsc}" title="Карточка товара">🔍</button></td>
        <td><input type="number" class="price-input" value="${curPrice}" min="1" step="1" oninput="calcMargin(this)"></td>
        <td class="margin-cell">-</td>
      `;
    } else {
      const suggested  = suggestPrice(curPrice, stockDays, daysLeft);
      const reason     = getUnsoldReason(row) || getPriceReason(curPrice, stockDays, daysLeft);
      const priceClass = suggested < curPrice ? 'suggested-fire' : 'suggested';
      const vpStock    = (curPrice - cost) * stockQty;
      tr.innerHTML = `
        <td>${productCell(codeEsc || '-')}</td>
        <td class="truncate" data-full="${nameEsc}">${productCell(nameEsc || '-')}</td>
        <td class="truncate" data-full="${g1}"><span class="link-cell" data-open-group data-g1="${g1}">${g1 || '-'}</span></td>
        <td>${cubeBadge(cubeRaw)}</td>
        <td>${cost.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</td>
        <td>${escapeHtml(row['цена тн, руб'] ?? '-')}</td>
        <td style="font-weight:500">${curPrice}</td>
        <td>${escapeHtml(row['наценка %'] ?? '-')}</td>
        <td>${row['склад кол'] || 0}</td>
        <td>${row['продано (шт)'] || 0}</td>
        <td>${escapeHtml(row['остатки, дней'] ?? '-')}</td>
        <td>${row['дата переоценки'] ? fmtDate(row['дата переоценки']) : '-'}</td>
        <td><span class="info-badge">${daysLeft} дн.</span></td>
        <td>${ratioBadge(stockDays, daysLeft)}</td>
        <td>
          <span class="${priceClass}">${suggested} ₽</span>
          <button class="apply-btn" onclick="applyPrice(this, ${suggested})">Прим.</button>
        </td>
        <td><span class="reason-badge ${reason.cls}">${reason.text}</span></td>
        <td class="${vpStock < 0 ? 'fire-text' : ''}" style="font-weight:600">${fmt(vpStock)} ₽</td>
        <td><input type="number" class="price-input" value="${curPrice}" min="1" step="1" oninput="calcMargin(this)"></td>
        <td class="delta-cell text-muted">0.0%</td>
        <td class="margin-cell">-</td>
      `;
    }
    frag.appendChild(tr);
  });

  tableBody.appendChild(frag);
  document.querySelectorAll('.price-input').forEach(inp => calcMargin(inp));
  mdTotalsEl.classList.toggle('hidden', mode !== 'md');
  if (mode === 'md') scheduleMdTotals();
}

// ── Живые итоги уценки ──
function scheduleMdTotals() {
  clearTimeout(mdTotalsTimer);
  mdTotalsTimer = setTimeout(renderMdTotalsNow, 120);
}
function renderMdTotalsNow() {
  if (mdTotalsEl.classList.contains('hidden')) return;
  let sku = 0, stockQty = 0, stockCost = 0, vpNow = 0, vpNew = 0;
  tableBody.querySelectorAll('tr').forEach(tr => {
    const cost = +tr.dataset.cost || 0;
    const stock = +tr.dataset.stock || 0;
    const orig = +tr.dataset.origprice || 0;
    const inp = tr.querySelector('.price-input');
    const price = inp ? (parseFloat(inp.value) || 0) : orig;
    sku++; stockQty += stock; stockCost += cost * stock;
    vpNow += (orig - cost) * stock;
    vpNew += (price - cost) * stock;
  });
  const delta = vpNew - vpNow;
  const pct = vpNow !== 0 ? delta / Math.abs(vpNow) * 100 : 0;
  const marginNew = stockCost > 0 ? vpNew / stockCost * 100 : 0;
  const t = (label, val, sub, cls) => `<div class="md-total ${cls || ''}"><div class="kpi-label">${label}</div><div class="md-total-value">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  mdTotalsEl.innerHTML = `
    <div class="md-totals-grid">
      ${t('Артикулов', fmt(sku))}
      ${t('Остаток', fmt(stockQty) + ' шт', `себестоимость ${fmt(stockCost)} ₽`)}
      ${t('ВП при текущих ценах', fmt(vpNow) + ' ₽', 'если продать остаток как есть', 't-accent')}
      ${t('ВП при новых ценах', fmt(vpNew) + ' ₽', `наценка на остаток ${marginNew.toFixed(1)}%`, delta < 0 ? 't-warn' : 't-good')}
      ${t('Δ ВП от уценки', (delta > 0 ? '+' : '−') + fmt(Math.abs(delta)) + ' ₽', `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% к текущей ВП`, delta < 0 ? 't-fire' : 't-good')}
    </div>
    <div class="hint" style="margin-top:8px">ВП остатка = (цена − себестоимость) × склад. Итоги пересчитываются сразу при изменении цен и нажатии «Прим.».</div>
  `;
}

// ── Делегирование и действия в строках ──
tableBody.addEventListener('click', e => {
  const t = e.target.closest('[data-open-product],[data-open-group]');
  if (!t) return;
  if (t.hasAttribute('data-open-product')) openProduct(t.dataset.code, null);
  else openGroup(t.dataset.g1 || '', t.dataset.g2 || '', t.dataset.g3 || '');
});

window.applyPrice = function(btn, price) {
  const tr  = btn.closest('tr');
  const inp = tr.querySelector('.price-input');
  inp.value = price;
  inp.dispatchEvent(new Event('input'));
  btn.style.background = '#10b981'; btn.textContent = '✓';
  setTimeout(() => { btn.style.background = ''; btn.textContent = 'Прим.'; }, 1200);
};

window.calcMargin = function(input) {
  const tr    = input.closest('tr');
  const cost  = parseFloat(tr.dataset.cost) || 0;
  const orig  = parseFloat(tr.dataset.origprice) || 0;
  const price = parseFloat(input.value) || 0;
  const cell  = tr.querySelector('.margin-cell');
  tr.classList.toggle('row-edited', Math.abs(price - orig) > 0.0001);

  const dcell = tr.querySelector('.delta-cell');
  if (dcell) {
    if (orig > 0) {
      const d = (price - orig) / orig * 100;
      dcell.innerHTML = `<span class="${d < 0 ? 'fire-text' : ''}" style="${d === 0 ? 'color:var(--text-muted)' : ''}">${d > 0 ? '+' : ''}${d.toFixed(1)}%</span>`;
    } else dcell.textContent = '—';
  }

  if (!cost || cost <= 0) { cell.innerHTML = '<span class="margin-badge">—</span>'; scheduleMdTotals(); return; }
  const margin = ((price - cost) / cost) * 100;
  const cls = margin >= 20 ? 'm-green' : margin >= 5 ? 'm-yellow' : 'm-red';
  cell.innerHTML = `<span class="margin-badge ${cls}">${margin.toFixed(1)}%</span>`;
  scheduleMdTotals();
};

// ── Экспорт уценки ──
document.getElementById('exportBtn')?.addEventListener('click', () => {
  const rows = [['Код', 'Цена']];
  document.querySelectorAll('#tableBody tr').forEach(tr => {
    const code  = tr.dataset.code || '';
    const price = parseFloat(tr.querySelector('.price-input')?.value) || 0;
    rows.push([code, price]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Уценка');
  const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
  XLSX.writeFile(wb, `galamart_ucenka_${today}.xlsx`);
});

// ── Универсальный экспорт таблиц в Excel ──
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-table-export]');
  if (!btn) return;
  const containerId = btn.dataset.tableExport;
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const table = container.querySelector('table.mini-table, table.sortable');
  if (!table) { showStatus('⚠️ Нет таблицы для экспорта', 'error'); return; }
  
  const rows = [];
  table.querySelectorAll('thead tr').forEach(tr => {
    const row = [...tr.querySelectorAll('th,td')].map(td => td.textContent.trim());
    rows.push(row);
  });
  table.querySelectorAll('tbody tr').forEach(tr => {
    const row = [...tr.querySelectorAll('th,td')].map(td => td.textContent.trim());
    rows.push(row);
  });
  
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Экспорт');
  const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
  XLSX.writeFile(wb, `galamart_export_${containerId}_${today}.xlsx`);
});