window.__bootStamp && window.__bootStamp('js/core.js: выполнение');
/* ══════════════════════════════════════════════════════════════
   core.js — элементы, состояние, утилиты, агрегаторы, парсер отчёта
   ══════════════════════════════════════════════════════════════ */

// ── Элементы ──
const fileInput       = document.getElementById('fileInput');
const dateGroup       = document.getElementById('dateGroup');
const dateLabel       = document.getElementById('dateLabel');
const filterDateInput = document.getElementById('filterDate');
const browsePanel     = document.getElementById('browsePanel');
const searchInput     = document.getElementById('searchInput');
const groupSel1       = document.getElementById('groupSel1');
const groupSel2       = document.getElementById('groupSel2');
const groupSel3       = document.getElementById('groupSel3');
const cubeSel         = document.getElementById('cubeSel');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const processBtn      = document.getElementById('processBtn');
const exportBtn       = document.getElementById('exportBtn');
const statusEl        = document.getElementById('status');
const resultEl        = document.getElementById('result');
const resultTitle     = document.getElementById('resultTitle');
const mdTotalsEl      = document.getElementById('mdTotals');
const theadEl         = document.querySelector('#dataTable thead');
const tableBody       = document.getElementById('tableBody');
const segBtns         = document.querySelectorAll('.seg-btn');
const visionCard      = document.getElementById('visionCard');
const sku3Card        = document.getElementById('sku3Card');
const dashCard        = document.getElementById('dashCard');
const dashContent     = document.getElementById('dashContent');
const analysisCard    = document.getElementById('analysisCard');
const anTitle         = document.getElementById('anTitle');
const anContent       = document.getElementById('anContent');
const anPageChips     = document.getElementById('anPageChips');
const anCodesInput    = document.getElementById('anCodesInput');
const anCodesClearBtn = document.getElementById('anCodesClearBtn');
const topCard         = document.getElementById('topCard');
const topTitle        = document.getElementById('topTitle');
const topContent      = document.getElementById('topContent');
const verifyCard      = document.getElementById('verifyCard');
const verifyCodeInput = document.getElementById('verifyCodeInput');
const verifyCodeBtn   = document.getElementById('verifyCodeBtn');
const verifyContent   = document.getElementById('verifyContent');
const zonesCard       = document.getElementById('zonesCard');
const zonesTitle      = document.getElementById('zonesTitle');
const zonesContent    = document.getElementById('zonesContent');
const zonesFileInput  = document.getElementById('zonesFileInput');
const giftsCard       = document.getElementById('giftsCard');
const giftsTitle      = document.getElementById('giftsTitle');
const giftsSummary    = document.getElementById('giftsSummary');
const giftsContent    = document.getElementById('giftsContent');
const giftLimit       = document.getElementById('giftLimit');
const giftSel1        = document.getElementById('giftSel1');
const giftSel2        = document.getElementById('giftSel2');
const giftSel3        = document.getElementById('giftSel3');
const giftInStock     = document.getElementById('giftInStock');
const modalOverlay    = document.getElementById('modalOverlay');
const modalBox        = document.getElementById('modalBox');

// ── Состояние ──
let rawData = [];
let codeIndex = new Map();
let analogCache = null;
let currentMode = 'vision';
let browseData = null;
let currentGroupPath = null;
let currentGroupItems = [];
let currentGroupTab = 'to';
let topMetric = 'to';
let topCodesValue = '';
let modalChart = null;
let dashCharts = [];
let anChart = null;
let anPath = [];
let anTab = 'groups';
let anPage = 'hierarchy';
let mdTotalsTimer = null;
const BROWSE_LIMIT = 2000;
const ISSUES_LIMIT = 300;
const PALETTE = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#64748b'];

// Метрики (используют ТОП-100 и карточка группы)
const METRIC_FNS = {
  to:  r => num(r['то, руб']),
  qty: r => num(r['продано (шт)']),
  gp:  r => rowGp(r)
};
const METRIC_TITLES = { to: 'ТО, руб.', qty: 'Продано, шт', gp: 'Валовая прибыль, руб.' };
const METRIC_TAB_LABELS = { to: '💰 По ТО', qty: '📦 По штукам', gp: '📈 По валовой прибыли' };

// ── Логистика (настраиваемая) ──
const WD = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const DEFAULT_CFG = { orderDay: 5, deliveryDay: 4, safetyDays: 7, overDays: 90, klizmaDay: 15 };
function loadCfg() {
  try { return Object.assign({}, DEFAULT_CFG, JSON.parse(localStorage.getItem('galamart_cfg') || '{}')); }
  catch (e) { return Object.assign({}, DEFAULT_CFG); }
}
let cfg = loadCfg();
function saveCfg() { try { localStorage.setItem('galamart_cfg', JSON.stringify(cfg)); } catch (e) { showStatus('❌ Настройки не сохранены: ' + e.message, 'error'); } }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function getLogistics(c) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const dOrd = (c.orderDay - dow + 7) % 7;
  const lag = ((c.deliveryDay - c.orderDay + 7) % 7) || 7;
  const arrivalIn = dOrd + lag;
  return { today, dow, dOrd, lag, arrivalIn, orderDate: addDays(today, dOrd), arrivalDate: addDays(today, arrivalIn) };
}

// ── Канонические имена колонок ──
const CANON_HEADERS = [
  'код','товар','группа 1','группа 2','группа 3','магазин',
  'себ, руб.','цена тн, руб','цена маг, руб.','наценка %',
  'склад кол','склад сумма, руб.','продано (шт)','то сс, руб','то, руб','продажа %',
  'остатки, дней','дата ввоза','дата переоценки','дата окончания продаж',
  'категория цены (1с8)','ост. трансф. + резерв (шт)','ост. опт скл. (шт)',
  'логистич. категория','кубы','куб магазина','мерченд. / коммерч. категория',
  'единая цена','категория искл. из автоуценки'
];
const REQUIRED_HEADERS = [
  'код','товар','группа 1','группа 2','группа 3','себ, руб.','цена тн, руб','цена маг, руб.',
  'наценка %','склад кол','склад сумма, руб.','продано (шт)','то сс, руб','то, руб',
  'остатки, дней','дата переоценки','дата ввоза','категория искл. из автоуценки',
  'дата окончания продаж','кубы'
];
function headerSig(s) { return String(s ?? '').toLowerCase().replace(/[^a-zа-яё0-9]/g, ''); }

// ── Утилиты ──
function showStatus(msg, type) { statusEl.textContent = msg; statusEl.className = `status ${type}`; }
function updateBtn() {
  const fileOk = ['vision','sales','sku3','r29','director'].includes(currentMode) || (fileInput.files.length && rawData.length > 0);
  const needDate = currentMode === 'kлизма' || currentMode === 'sellto';
  const filterOk = needDate ? !!filterDateInput.value : true;
  processBtn.disabled = !(fileOk && filterOk);
}
function escapeHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function truncateStr(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n-1) + '…' : s; }
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/\s/g,'').replace('%','').replace(',','.'));
  return isFinite(n) ? n : 0;
}
function fmt(n, d = 0) { return (Math.round(n * 10**d) / 10**d).toLocaleString('ru-RU', { maximumFractionDigits: d }); }
function fmtDays(d) { if (!isFinite(d)) return '∞'; if (d < 1) return '<1'; return String(Math.round(d)); }
function splitTokens(v) { return String(v || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean); }
function parseDate(val) { return SoldieRules.date(val); }
function fmtDate(val) { const d = parseDate(val); return d ? d.toLocaleDateString('ru-RU') : '—'; }
function roundTo9(price) { return SoldieRules.roundedPrice(price); }
let reportDate = null;
const REPORT_DAYS = 28;
function analysisDate() { return reportDate || new Date(); }
function ageDays(value) { return SoldieRules.daysBetween(value, analysisDate()); }
function isSlowRow(r) { const age = ageDays(r['дата ввоза']); return age !== null && age >= 28 && SoldieRules.slow(num(r['склад кол']), num(r['продано (шт)'])); }
function slowShare(r) { const sold = Math.max(0, num(r['продано (шт)'])), stock = num(r['склад кол']); return stock + sold > 0 ? sold / (stock + sold) * 100 : 0; }
const SLOW_HINT = 'Оценка: продажи за 28 дней / (остаток + продажи) < 26,7%. Только товары с последней поставкой не менее 28 дней назад; без учёта других движений.';
function genId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── КУБЫ ──
const CUBE_KEY = { 'ВНЕ_АМ': 'vneam', 'ЗО': 'zo', 'ЗО сеть': 'zoset' };
const CUBE_LABEL_BY_KEY = { vneam: 'ВНЕ_АМ', zo: 'ЗО', zoset: 'ЗО сеть' };
function cubeKind(val) {
  const v = String(val ?? '').trim().toLowerCase();
  if (!v) return null;
  if (/вне[_\s-]*ам/.test(v)) return 'ВНЕ_АМ';
  if (v.includes('зо') && /сеть|сет/.test(v)) return 'ЗО сеть';
  if (v.includes('зо')) return 'ЗО';
  return null;
}
function cubeBadge(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '—';
  const k = cubeKind(v);
  const cls = k === 'ВНЕ_АМ' ? 'cube-vneam' : k === 'ЗО' ? 'cube-zo' : k === 'ЗО сеть' ? 'cube-zoset' : 'cube-other';
  return `<button type="button" class="cube-badge ${cls}" data-open-cube="${escapeHtml(v)}" title="Открыть карточку КУБА">${escapeHtml(v)}</button>`;
}

// ── Продажи и сток ──
function dailyRate(r) {
  const stock = num(r['склад кол']), od = num(r['остатки, дней']), sold = num(r['продано (шт)']);
  if (od > 0 && od < 9999 && stock > 0) return stock / od;
  if (od >= 9999) return 0;
  return Math.max(0, sold) / REPORT_DAYS;
}
function stockDaysLeft(r) {
  const od = num(r['остатки, дней']), stock = num(r['склад кол']);
  if (stock <= 0) return { days: 0 };
  if (od >= 9999) return { days: Infinity };
  if (od > 0) return { days: od };
  const rate = dailyRate(r);
  return rate > 0 ? { days: stock / rate, approx: true } : { days: Infinity };
}
const NO_SALES_DAYS = 28;
function isUnsoldDays(r) {
  // Единое правило для дашборда, анализа и уценки.
  const imp = parseDate(r['дата ввоза']);
  if (!imp) return false;
  const sold = num(r['продано (шт)']);
  if (sold > 0) return false;
  const daysSinceImport = ageDays(imp);
  return num(r['склад кол']) > 0 && daysSinceImport >= NO_SALES_DAYS;
}
function coverBadge(d) {
  if (!isFinite(d)) return '<span class="ratio-badge ratio-fire">∞</span>';
  if (d <= 14) return `<span class="ratio-badge ratio-fire">${fmtDays(d)} дн.</span>`;
  if (d <= 30) return `<span class="ratio-badge ratio-warn">${fmtDays(d)} дн.</span>`;
  return `<span class="ratio-badge ratio-ok">${fmtDays(d)} дн.</span>`;
}
function daysBadgeR(r) {
  const sdl = stockDaysLeft(r);
  if (!isFinite(sdl.days)) return '<span class="ratio-badge ratio-fire">∞</span>';
  return `<span class="ratio-badge ${sdl.days <= 7 ? 'ratio-fire' : sdl.days <= 14 ? 'ratio-warn' : 'ratio-ok'}">${fmtDays(sdl.days)}</span>`;
}
function rowGp(r) { return num(r['то, руб']) - num(r['то сс, руб']); }
function rowGpMarkup(r) { const toss = num(r['то сс, руб']); return toss > 0 ? rowGp(r) / toss * 100 : null; }

// ── Агрегаторы ──
function aggRows(rows) {
  const a = { sku: 0, stock: 0, stockSum: 0, sold: 0, to: 0, toss: 0, rate: 0, deadSum: 0, deadCount: 0, slowSum: 0, slowCount: 0, returns: 0 };
  rows.forEach(r => {
    a.sku++;
    const st = num(r['склад кол']); a.stock += st;
    const sSum = num(r['склад сумма, руб.']) || st * num(r['себ, руб.']);
    a.stockSum += sSum;
    a.sold += Math.max(0, num(r['продано (шт)']));
    a.returns += Math.max(0, -num(r['продано (шт)']));
    a.to += num(r['то, руб']); a.toss += num(r['то сс, руб']);
    a.rate += dailyRate(r);
    if (isUnsoldDays(r)) { a.deadCount++; a.deadSum += sSum; }
    if (isSlowRow(r)) { a.slowCount++; a.slowSum += sSum; }
  });
  a.gp = a.to - a.toss;
  a.margin = a.to > 0 ? a.gp / a.to * 100 : 0;
  a.markup = a.toss > 0 ? a.gp / a.toss * 100 : 0;
  a.turnover = a.rate > 0 ? a.stock / a.rate : Infinity;
  a.costTurnover = a.toss > 0 ? a.stockSum / (a.toss / REPORT_DAYS) : Infinity;
  return a;
}
function byGroupAgg(rows, key) {
  const m = new Map();
  rows.forEach(r => {
    const g = String(r[key] ?? '').trim() || '—';
    if (!m.has(g)) m.set(g, []);
    m.get(g).push(r);
  });
  return [...m.entries()].map(([g, arr]) => ({ g, a: aggRows(arr) }));
}
function isDeadRow(r) { return isUnsoldDays(r); }
function itemFrozen(r) { return num(r['склад сумма, руб.']) || num(r['склад кол']) * num(r['себ, руб.']); }
function itemAgeDays(r) { const imp = parseDate(r['дата ввоза']); return imp ? ageDays(imp) : null; }
function itemMarkup(r) { const c = num(r['себ, руб.']); if (c <= 0) return null; return (num(r['цена маг, руб.']) - c) / c * 100; }
function scopeMarkupStock(scope) {
  let n = 0, d = 0;
  scope.forEach(r => { const st = num(r['склад кол']); if (st > 0) { const c = num(r['себ, руб.']); if (c > 0) { n += (num(r['цена маг, руб.']) - c) * st; d += c * st; } } });
  return d > 0 ? n / d * 100 : 0;
}

// ── Навигация ──
function hideAllPages() {
  document.getElementById('directorCard')?.classList.add('hidden');
  resultEl.classList.add('hidden');
  visionCard.classList.add('hidden');
  if (window.sku3Hide) window.sku3Hide();
  if (window.salesHide) window.salesHide();
  dashCard.classList.add('hidden');
  analysisCard.classList.add('hidden');
  topCard.classList.add('hidden');
  if (window.r29Hide) window.r29Hide();
  verifyCard.classList.add('hidden');
  zonesCard.classList.add('hidden');
  giftsCard.classList.add('hidden');
}
function switchMode(mode) {
  const b = document.querySelector(`.seg-btn[data-mode="${mode}"]`);
  if (b) b.click();
}

// ── Общие ячейки/плитки ──
function shareCell(part, total) {
  const pct = total > 0 ? part / total * 100 : 0;
  return `<td><div class="share-bar"><div style="width:${Math.min(100, pct).toFixed(1)}%"></div></div>${pct.toFixed(1)}%</td>`;
}
function tileHtml(l, v, cls, sub) {
  return `<div class="kpi ${cls || ''}"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}

// ── Сортировка всех таблиц ──
function sortValFromCell(td) {
  if (!td) return { num: false, t: '', n: 0 };
  const txt = td.textContent.trim();
  const cleaned = txt.replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  if (/\d/.test(txt) && isFinite(n) && cleaned !== '' && cleaned !== '-') return { num: true, n, t: txt };
  return { num: false, t: txt.toLowerCase(), n: 0 };
}
document.addEventListener('click', e => {
  const th = e.target.closest('th');
  if (!th) return;
  const table = th.closest('table');
  if (!table || !table.classList.contains('sortable')) return;
  if (e.target.closest('input,button,select,a')) return;
  const headRow = th.parentNode;
  const idx = [...headRow.children].indexOf(th);
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const dir = th.dataset.sortDir === 'desc' ? 'asc' : 'desc';
  [...headRow.children].forEach(h => { delete h.dataset.sortDir; });
  th.dataset.sortDir = dir;
  const mult = dir === 'asc' ? 1 : -1;
  const rows = [...tbody.rows];
  rows.sort((ra, rb) => {
    const va = sortValFromCell(ra.cells[idx]), vb = sortValFromCell(rb.cells[idx]);
    if (va.num && vb.num) return (va.n - vb.n) * mult;
    return String(va.num ? va.n : va.t).localeCompare(String(vb.num ? vb.n : vb.t), 'ru') * mult;
  });
  rows.forEach(r => tbody.appendChild(r));
});

// ── Загрузка отчёта ──
let reportReadId = 0;
fileInput.addEventListener('change', () => {
  reportReadId++;
  SuadelaExport.prices.clear();
  if (typeof giftSelectedCodes !== 'undefined') giftSelectedCodes.clear();
  rawData = []; codeIndex = new Map(); reportDate = null; browseData = null; analogCache = null;
  hideAllPages(); updateBtn();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showStatus('Чтение структуры...', 'success');
  const readId = reportReadId;
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (readId !== reportReadId) return;
    try {
      const wb   = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true, defval: '' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', range: 0 });
      if (rows.length < 4) throw new Error('Файл пуст или повреждён');

      const headerRow = rows.findIndex(row => row.some(v => headerSig(v) === 'код') && row.some(v => headerSig(v) === 'товар'));
      if (headerRow < 0) throw new Error('Не найдена шапка отчёта «Остатки по датам ввоза»');
      const rawHeaders = rows[headerRow].map(h => String(h).trim().toLowerCase().replace(/\s+/g, ' '));
      const canonBySig = new Map(CANON_HEADERS.map(c => [headerSig(c), c]));
      const headerMap = {};
      rawHeaders.forEach((h, i) => {
        const canon = canonBySig.get(headerSig(h));
        if (canon !== undefined) headerMap[i] = canon;
      });

      const foundCanon = new Set(Object.values(headerMap));
      const missing = REQUIRED_HEADERS.filter(r => !foundCanon.has(r));
      if (missing.length) throw new Error(`Не найдены колонки:\n${missing.join(', ')}\nПроверьте структуру файла.`);

      const parsed = rows.slice(headerRow + 1).filter(r => String(r[rawHeaders.findIndex(h => headerSig(h) === 'код')] ?? '').trim()).map(r => {
        const obj = {};
        for (const [i, canon] of Object.entries(headerMap)) obj[canon] = r[i] ?? '';
        return obj;
      });
      const nextIndex = new Map();
      parsed.forEach(r => {
        const code = String(r['код']).trim();
        if (nextIndex.has(code)) throw new Error('Повторный артикул в отчёте: ' + code);
        for (const key of ['дата ввоза', 'дата переоценки', 'дата окончания продаж']) {
          if (r[key] !== '' && r[key] != null && !parseDate(r[key])) throw new Error('Неверная дата: ' + code + ', ' + key);
        }
        nextIndex.set(code, r);
      });
      const heading = rows.slice(0, headerRow).flat().join(' ');
      const dateMatch = heading.match(/дата остатков:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
      if (!dateMatch || !parseDate(dateMatch[1])) throw new Error('В отчёте не найдена корректная дата остатков');
      const period = heading.match(/период продаж:\s*с\s*(\d{1,2}\.\d{1,2}\.\d{4})\s*по\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
      if (period && SoldieRules.daysBetween(period[1], period[2]) !== REPORT_DAYS - 1) throw new Error('Ожидается отчёт с продажами за 28 дней');
      reportDate = parseDate(dateMatch[1]);
      rawData = parsed;
      codeIndex = nextIndex;
      hideAllPages();
      if (currentMode === 'dash') renderDashboard();
      else if (currentMode === 'zones') renderZones();
      else if (currentMode === 'analysis') renderAnalysis();
      else if (currentMode === 'gifts') renderGifts();
      showStatus(`✅ Загружено: ${rawData.length.toLocaleString('ru-RU')} строк · остатки на ${fmtDate(reportDate)} · продажи за 28 дней.`, 'success');
      updateBtn();
      window.dispatchEvent(new CustomEvent('soldie-report-loaded', { detail: { rows:rawData, date:reportDate, file:file.name } }));
    } catch (err) { showStatus('❌ ' + err.message, 'error'); rawData = []; codeIndex.clear(); reportDate = null; hideAllPages(); updateBtn(); }
  };
  reader.onerror = () => showStatus('❌ Не удалось прочитать файл', 'error');
  reader.readAsArrayBuffer(file);
});
// ── Экспорт в Excel (универсальный) ──
function excelDateSuffix() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function exportToExcel(filename, sheetName, rows) {
  if (typeof XLSX === 'undefined') { showStatus('❌ Библиотека XLSX не найдена.', 'error'); return; }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  ws['!cols'] = Array.from({ length: maxCols }, () => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
