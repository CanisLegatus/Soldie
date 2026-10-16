window.__bootStamp && window.__bootStamp('js/storage.js: выполнение');
/* ══════════════════════════════════════════════════════════════
   storage.js — накопительный архив данных (localStorage → JSON)

   Программа запоминает каждую загрузку отчёта и сохраняет её в
   localStorage в формате JSON. При следующем запуске данные
   подгружаются автоматически — можно копить историю днями.

   Важно про динамические данные:
   • «продано (шт)», «то, руб», «то сс, руб» — НАКОПЛИТЕЛЬНЫЕ метрики
     внутри периода отчёта. Внутри одного месяца новое значение просто
     заменяет старое; при новом месяце значения складываются с прошлыми
     периодами (см. recomputeCum).
   • «склад кол», «склад сумма, руб.» — снапшот остатка на дату отчёта.
   • «остатки, дней» — снапшот-показатель, всегда берётся из последней
     загрузки.
   • Динамика продаж = изменение остатков во времени (salesFromSnapshots):
     продажи за период между двумя снимками = прошлый остаток − текущий
     остаток + приход (приход неотслеживаем — цифры консервативные).
   ══════════════════════════════════════════════════════════════ */

const HISTORY_KEY   = 'galamart_history_v1';
const HISTORY_LIMIT = 120;          // максимум хранимых дат отчётов
const CUM_PERIODS   = ['to', 'toss', 'sold']; // накопительные поля
const SNAPSHOT_FIELDS = ['склад кол', 'склад сумма, руб.', 'остатки, дней'];

// ── Сериализация значений ячеек (Date / числа / строки) ──
function serVal(v) {
  if (v instanceof Date) return { __d: v.getTime() };
  return v === undefined ? null : v;
}
function desVal(v) {
  if (v && typeof v === 'object' && typeof v.__d === 'number') return new Date(v.__d);
  return v;
}
function serRows(rows) {
  return rows.map(r => {
    const o = {};
    for (const k in r) o[k] = serVal(r[k]);
    return o;
  });
}
function desRows(arr) {
  return (arr || []).map(r => {
    const o = {};
    for (const k in r) o[k] = desVal(r[k]);
    return o;
  });
}

// ── Дата отчёта: самый частый «дата переоценки», иначе — сегодня ──
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function reportDateOf(rows) {
  const freq = new Map();
  let max = 0;
  for (const r of rows) {
    const d = parseDate(r['дата переоценки']);
    if (!d) continue;
    const key = ymd(d);
    const c = (freq.get(key) || 0) + 1;
    freq.set(key, c);
    if (c > max) max = c;
  }
  // выбираем САМУЮ ЧАСТУЮ дату (а при равенстве частот — самую свежую):
  // именно она отражает дату формирования отчёта
  let best = null, bestC = 0;
  freq.forEach((c, k) => {
    if (c > bestC || (c === bestC && k > best)) { bestC = c; best = k; }
  });
  if (best) return best;
  return ymd(new Date());
}

// ── Хранилище ──
let historyStore = { days: {} };
try { historyStore = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{"days":{}}') || { days: {} }; }
catch (e) { historyStore = { days: {} }; }
if (!historyStore.days) historyStore.days = {};

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyStore));
    return true;
  } catch (e) {
    console.warn('Не удалось сохранить историю (хранилище переполнено?)', e);
    showStatus('⚠️ Не удалось сохранить историю в память устройства — возможно, хранилище переполнено.', 'error');
    return false;
  }
}

function dayKeysSorted() { return Object.keys(historyStore.days).sort(); }

function pruneHistory() {
  const keys = dayKeysSorted();
  while (keys.length > HISTORY_LIMIT) {
    delete historyStore.days[keys.shift()];
  }
}

// ── Добавление загрузки в архив ──
// rows — разобранные строки отчёта (канонические колонки), srcName — имя файла
function addSnapshotToHistory(rows, srcName) {
  const date = reportDateOf(rows);
  if (!date) return null;
  const map = {};
  for (const r of rows) {
    const c = String(r['код'] ?? '').trim();
    if (!c) continue;
    const o = {};
    for (const k in r) o[k] = serVal(r[k]);
    map[c] = o;
  }
  historyStore.days[date] = { rows: map, name: srcName || '', loadedAt: Date.now() };
  pruneHistory();
  saveHistory();
  return date;
}

// ── Понимание накопительных данных ──
// «то, руб», «то сс, руб», «продано (шт)» в отчёте — накопительные метрики
// ВНУТРИ периода (месяца): значение за 15-е уже включает продажи 1–14 чисел.
// Поэтому новое значение за тот же месяц НЕ складывается со старым, а
// ЗАМЕЩАЕТ его; максимум по месяцу даёт корректный итог месяца. С началом
// нового месяца накопитель обнуляется и итоги разных месяцев СУММИРУЮТСЯ.
function monthMaxForCode(date, code) {
  // максимум накопительных значений за календарный месяц даты `date`
  const period = date.slice(0, 7);
  const res = { to: 0, toss: 0, sold: 0 };
  for (const d of dayKeysSorted()) {
    if (d.slice(0, 7) !== period) continue;
    if (d > date) break; // «на конец дня date» — будущие снимки не учитываем
    const r = historyStore.days[d].rows[code];
    if (!r) continue;
    res.to   = Math.max(res.to,   num(desVal(r['то, руб'])));
    res.toss = Math.max(res.toss, num(desVal(r['то сс, руб'])));
    res.sold = Math.max(res.sold, num(desVal(r['продано (шт)'])));
  }
  return res;
}
function cumTotalsToDate(date, code) {
  // накопительный итог артикула на дату: сумма месячных максимумов по всем
  // месяцам архива, завершаяся месяцем даты `date`
  const keys = dayKeysSorted();
  const monthsSeen = [];
  const best = {};
  for (const d of keys) {
    if (d > date) break;
    const period = d.slice(0, 7);
    if (!(period in best)) { best[period] = { to: 0, toss: 0, sold: 0 }; monthsSeen.push(period); }
    const r = historyStore.days[d].rows[code];
    if (!r) continue;
    best[period].to   = Math.max(best[period].to,   num(desVal(r['то, руб'])));
    best[period].toss = Math.max(best[period].toss, num(desVal(r['то сс, руб'])));
    best[period].sold = Math.max(best[period].sold, num(desVal(r['продано (шт)'])));
  }
  const tot = { to: 0, toss: 0, sold: 0 };
  for (const p of monthsSeen) { tot.to += best[p].to; tot.toss += best[p].toss; tot.sold += best[p].sold; }
  return tot;
}
function recomputeCum(cumThrough) {
  // code -> { to, toss, sold } накопительно по всем месяцам архива
  // (или по месяцам до даты cumThrough включительно — для дневной динамики)
  const limit = cumThrough || (dayKeysSorted().slice(-1)[0] || '');
  const codes = new Set();
  for (const d of dayKeysSorted()) {
    if (d > limit) break;
    const rows = historyStore.days[d].rows;
    for (const c in rows) codes.add(c);
  }
  const cum = {};
  codes.forEach(code => { cum[code] = cumTotalsToDate(limit, code); });
  return cum;
}

// ── Сборка «сырых» данных: снапшот последнего дня + накопительные итоги ──
function buildRawFromHistory() {
  const keys = dayKeysSorted();
  if (!keys.length) return [];
  const lastDate = keys[keys.length - 1];
  const last = historyStore.days[lastDate].rows;
  const cum = recomputeCum(lastDate);
  const out = [];
  for (const code in last) {
    const r = desRows([last[code]])[0];
    const c = cum[code];
    if (c) {
      r['то, руб'] = c.to;
      r['то сс, руб'] = c.toss;
      r['продано (шт)'] = c.sold;
    }
    out.push(r);
  }
  return out;
}

// ── Динамика продаж по изменению остатков во времени ──
// Для каждой даты D: sold(D) = stock(D-1) − stock(D), если ≥ 0, иначе 0.
// Значения «остатки, дней» игнорируются — это не продажи, а покрытие.
function snapshotsSeries() {
  const keys = dayKeysSorted();
  const codes = new Set();
  for (const k of keys) {
    const rows = historyStore.days[k].rows;
    for (const c in rows) codes.add(c);
  }
  const series = []; // [{date, totalStock, totalStockSum, sku, salesQty, salesTo}]
  let prevStockByCode = null;
  for (const date of keys) {
    const rows = historyStore.days[date].rows;
    let totalStock = 0, totalStockSum = 0, sku = 0, salesQty = 0;
    for (const code in rows) {
      const r = rows[code];
      const st = num(desVal(r['склад кол']));
      totalStock += st;
      totalStockSum += num(desVal(r['склад сумма, руб.'])) || st * num(desVal(r['себ, руб.']));
      sku++;
      if (prevStockByCode) {
        const prev = prevStockByCode[code];
        if (prev != null) {
          const delta = prev - st;
          if (delta > 0) salesQty += delta;
        } else {
          // артикул впервые появился в отчёте — накопительное «продано (шт)»
          // за текущий месяц это реальные продажи между снимками
          const period = date.slice(0, 7);
          let mMax = 0;
          for (const d2 of keys) {
            if (d2 > date) break;
            if (d2.slice(0, 7) !== period) continue;
            const rr = historyStore.days[d2].rows[code];
            if (rr) mMax = Math.max(mMax, num(desVal(rr['продано (шт)'])));
          }
          if (mMax > 0) salesQty += mMax;
        }
      }
    }
    // ТО за день ≈ проданные штуки × средняя цена магазина (оценка)
    let avgPrice = 0, priceN = 0;
    for (const code in rows) {
      const p = num(desVal(rows[code]['цена маг, руб.']));
      if (p > 0) { avgPrice += p; priceN++; }
    }
    avgPrice = priceN ? avgPrice / priceN : 0;
    series.push({ date, totalStock, totalStockSum, sku, salesQty, salesTo: salesQty * avgPrice });
    prevStockByCode = {};
    for (const code in rows) prevStockByCode[code] = num(desVal(rows[code]['склад кол']));
  }
  return series;
}

// Продажи конкретного артикула по дням (изменения его остатка)
function itemSalesSeries(code) {
  const keys = dayKeysSorted();
  let prev = null;
  const out = [];
  for (const date of keys) {
    const day = historyStore.days[date].rows;
    const r = day[code];
    if (r) {
      const st = num(desVal(r['склад кол']));
      const sold = prev != null ? Math.max(0, prev - st) : null;
      out.push({ date, stock: st, sold });
      prev = st;
    } else if (prev != null) {
      // товар исчез из отчёта — считаем, что остаток обнулился
      out.push({ date, stock: 0, sold: Math.max(0, prev) });
      prev = 0;
    }
  }
  return out;
}

// ── Скоуп динамики (3/7/14/30/все/произвольно) ──
let dashScopeDays = 7;         // 0 = всё, -1 = произвольный диапазон
let dashScopeFrom = '';
let dashScopeTo = '';

function scopeDateBounds() {
  const keys = dayKeysSorted();
  return keys.length ? [keys[0], keys[keys.length - 1]] : ['', ''];
}
function scopedDates(keys) {
  // общий код для dash/vision: фильтр дат по текущему скоупу
  let ks = keys;
  if (dashScopeDays === -1 && (dashScopeFrom || dashScopeTo)) {
    ks = ks.filter(d => (!dashScopeFrom || d >= dashScopeFrom) && (!dashScopeTo || d <= dashScopeTo));
    if (!ks.length) ks = keys.slice(-1);
  } else if (dashScopeDays > 0) {
    ks = ks.slice(Math.max(0, ks.length - dashScopeDays));
  }
  return ks;
}

function scopedSeries(series) {
  if (!series.length) return series;
  if (dashScopeDays === -1 && (dashScopeFrom || dashScopeTo)) {
    const f = series.filter(p => (!dashScopeFrom || p.date >= dashScopeFrom) && (!dashScopeTo || p.date <= dashScopeTo));
    return f.length ? f : series.slice(-1);
  }
  if (dashScopeDays > 0) return series.slice(Math.max(0, series.length - dashScopeDays));
  return series;
}

function scopeLabel(scoped, all) {
  if (!scoped.length) return 'нет данных в выбранном периоде';
  const a = scoped[0].date, b = scoped[scoped.length - 1].date;
  const fa = d => d.split('-').reverse().join('.');
  return `${fa(a)} — ${fa(b)} · ${scoped.length} ${pluralDays(scoped.length)}` +
    (scoped.length < all.length ? ` (в архиве ${all.length})` : '');
}
function pluralDays(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}

// ── Единая панель выбора периода динамики (используется и в Дашборде, и в Vision) ──
const SCOPE_OPTS = [[3, '3 дня'], [7, '7 дней'], [14, '14 дней'], [30, '30 дней'], [0, 'всё']];
function scopeBarHtml(o) {
  // o = { id, cls, activeCls, chipAttr, label, minD, maxD }
  const chips = SCOPE_OPTS.map(([d, l]) =>
    `<button type="button" class="${o.cls}${dashScopeDays === d ? ' ' + o.activeCls : ''}" data-${o.chipAttr}="${d}">${l}</button>`).join('');
  const customOn = dashScopeDays === -1;
  return `<div id="${o.id}" class="chip-row" style="margin:6px 0 12px;align-items:center">
    <span class="hint" style="align-self:center">${o.label}</span>${chips}
    <button type="button" class="${o.cls}${customOn ? ' ' + o.activeCls : ''}" data-${o.chipAttr}="-1">произвольно</button>
    <input type="date" id="${o.id}From" value="${customOn ? escapeHtml(dashScopeFrom) : ''}" min="${o.minD}" max="${o.maxD}" title="Начало периода">
    <span class="hint" style="align-self:center">—</span>
    <input type="date" id="${o.id}To" value="${customOn ? escapeHtml(dashScopeTo) : ''}" min="${o.minD}" max="${o.maxD}" title="Конец периода">
  </div>`;
}
function bindScopeBar(id, chipAttr, onApply) {
  const bar = document.getElementById(id);
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = '1';
  bar.addEventListener('click', e => {
    const chip = e.target.closest(`[data-${chipAttr}]`);
    if (!chip) return;
    dashScopeDays = +chip.getAttribute(`data-${chipAttr}`);
    if (dashScopeDays !== -1) { dashScopeFrom = ''; dashScopeTo = ''; }
    onApply();
  });
  const fromEl = document.getElementById(id + 'From');
  const toEl = document.getElementById(id + 'To');
  const apply = () => {
    dashScopeFrom = fromEl ? fromEl.value : '';
    dashScopeTo = toEl ? toEl.value : '';
    dashScopeDays = -1;
    onApply();
  };
  if (fromEl) fromEl.addEventListener('change', apply);
  if (toEl) toEl.addEventListener('change', apply);
}

// ── Плитки-сводка по архиву ──
function historySummary() {
  const keys = dayKeysSorted();
  if (!keys.length) return null;
  const first = keys[0], last = keys[keys.length - 1];
  return { count: keys.length, first, last };
}

function clearHistory() {
  historyStore = { days: {} };
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
}

// ── Экспорт/импорт всего архива в JSON-файл ──
function exportHistoryJson() {
  const payload = { app: 'galamart-analyst', version: 1, exportedAt: new Date().toISOString(), days: historyStore.days };
  const json = JSON.stringify(payload);
  const name = `galamart-history-${excelDateSuffix()}.json`;
  if (window.AndroidBridge && typeof AndroidBridge.saveText === 'function') {
    try { AndroidBridge.saveText(name, json); showStatus(`💾 История выгружена в ${name}`, 'success'); return; }
    catch (e) { /* падаем на blob-путь ниже */ }
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  showStatus(`💾 История выгружена в ${name} (${dayKeysSorted().length} дат)`, 'success');
}

function importHistoryJson(text) {
  const data = JSON.parse(text);
  const days = data && data.days ? data.days : data;
  if (!days || typeof days !== 'object' || Array.isArray(days)) throw new Error('В файле нет структуры истории { days: {...} }');
  let added = 0;
  for (const date in days) {
    const src = days[date];
    if (!src || !src.rows) continue;
    if (!historyStore.days[date]) { historyStore.days[date] = src; added++; }
    else {
      // объединяем артикулы, свежие загрузки не перезаписываем более новыми из файла
      const dst = historyStore.days[date].rows;
      for (const code in src.rows) if (!(code in dst)) dst[code] = src.rows[code];
      added++;
    }
  }
  pruneHistory();
  saveHistory();
  return added;
}

window.__storageReady = true;
