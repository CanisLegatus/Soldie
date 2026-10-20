/* ══════════════════════════════════════════════════════════════
   sales.js — раздел «💰 Продажи»
   Полноценный дашборд по продажам на основе файлов продаж suadela
   (1С «Отчёт о продажах», тот же парсер, что и в разделе «3SKU»).

   Возможности:
     • загрузка файлов продаж (drag&drop / кнопка) — общий парсер suadela;
     • скоупы: Day-day, Неделя, Произвольный период;
     • продажи по отдельному артикулу и по группам (группировки);
     • живой график динамики с анимацией и автоскроллом при воспроизведении;
     • отсечки (переоценка): клик по графику → ввод суммы порога,
       система измеряет динамику продаж до/после отсечки.

   Данные берутся из того же состояния, что и 3SKU (localStorage
   'sku3_motivator_v1'), поэтому импорт в одном разделе виден в другом.
   Точки входа: window.salesRenderMarkup(), window.salesInit().
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SKEY = 'sales_dashboard_v1';
  const PALETTE = ['#4f46e5', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#0ea5e9', '#f97316', '#84cc16', '#f43f5e'];

  // ── Стили (scope: #salesCard) ──
  var salesStyle = document.createElement('style');
  salesStyle.id = 'salesStyles';
  salesStyle.textContent = `
#salesCard{--sl-primary:#4f46e5;--sl-text:#0f172a;--sl-muted:#64748b;--sl-border:#e2e8f0;--sl-card:#fff}
#salesCard *{box-sizing:border-box}
#salesCard [hidden]{display:none !important}
#salesCard h1,#salesCard h2,#salesCard h3,#salesCard h4{margin:0}
.sl-wrap{max-width:1440px;margin:0 auto;padding:18px 24px 70px;font-family:Inter,system-ui,sans-serif;color:var(--sl-text)}
.sl-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.sl-title{display:flex;align-items:center;gap:14px}
.sl-logo{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#4f46e5,#7c3aed 60%,#06b6d4);color:#fff;font-weight:800;font-size:20px;box-shadow:0 10px 22px rgba(79,70,229,.24)}
.sl-title h2{font-size:20px;font-weight:800;letter-spacing:-.02em}
.sl-title .sl-sub{font-size:13px;color:var(--sl-muted);margin-top:2px}
.sl-actions{display:flex;gap:10px;flex-wrap:wrap}
.sl-btn{border:1px solid var(--sl-border);background:#fff;color:var(--sl-text);padding:10px 15px;border-radius:13px;font-weight:700;cursor:pointer;transition:transform .16s,box-shadow .16s,background .16s;white-space:nowrap;font-size:14px}
.sl-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(15,23,42,.08)}
.sl-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.sl-btn-primary{background:linear-gradient(135deg,#4f46e5,#7c3aed);border:none;color:#fff;box-shadow:0 10px 24px rgba(79,70,229,.22)}
.sl-btn-danger{background:#fff5f5;border-color:#fecaca;color:#b91c1c}
.sl-btn-sm{padding:7px 11px;border-radius:10px;font-size:13px}
.sl-drop{border:2px dashed #c7d2fe;border-radius:16px;background:#eef2ff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;cursor:pointer;transition:.18s;margin-bottom:16px}
.sl-drop.drag{background:#e0e7ff;border-color:#4f46e5}
.sl-drop-main{font-weight:800;color:#3730a3}
.sl-drop-hint{font-size:12.5px;color:var(--sl-muted);margin-top:3px;line-height:1.45}
.sl-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;background:var(--sl-card);border:1px solid var(--sl-border);border-radius:16px;padding:14px 16px;margin-bottom:16px;box-shadow:0 6px 18px rgba(15,23,42,.04)}
.sl-field{display:flex;flex-direction:column;gap:4px}
.sl-field label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--sl-muted)}
.sl-select,.sl-input{padding:9px 11px;border:1px solid var(--sl-border);border-radius:10px;font-size:14px;background:#fff;color:var(--sl-text);min-width:150px}
.sl-select:focus,.sl-input:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.15)}
.sl-seg{display:inline-flex;border:1px solid var(--sl-border);border-radius:10px;overflow:hidden;background:#fff}
.sl-seg button{border:none;background:#fff;color:var(--sl-muted);padding:9px 14px;font-weight:800;font-size:13px;cursor:pointer;border-right:1px solid var(--sl-border)}
.sl-seg button:last-child{border-right:none}
.sl-seg button.active{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff}
.sl-tabs{display:inline-flex;gap:6px;padding:6px;background:#fff;border:1px solid var(--sl-border);border-radius:999px;box-shadow:0 6px 18px rgba(15,23,42,.05);margin-bottom:16px;flex-wrap:wrap}
.sl-tab{border:none;background:transparent;color:var(--sl-muted);padding:10px 20px;border-radius:999px;font-weight:800;cursor:pointer;transition:.18s;font-size:14px}
.sl-tab.active{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;box-shadow:0 10px 20px rgba(79,70,229,.2)}
.sl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:16px}
.sl-kpi{background:var(--sl-card);border:1px solid var(--sl-border);border-radius:16px;padding:16px 18px;box-shadow:0 6px 18px rgba(15,23,42,.04)}
.sl-kpi-label{font-size:12px;color:var(--sl-muted);font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.sl-kpi-value{font-size:26px;line-height:1.1;font-weight:800;letter-spacing:-.03em}
.sl-kpi-sub{font-size:12.5px;color:var(--sl-muted);margin-top:5px}
.sl-up{color:#059669}.sl-down{color:#e11d48}
.sl-grid{display:grid;gap:16px;margin-bottom:16px}
.sl-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.sl-card{background:var(--sl-card);border:1px solid var(--sl-border);border-radius:18px;box-shadow:0 12px 32px rgba(15,23,42,.06);padding:18px 20px}
.sl-card-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.sl-card-title h3{font-size:17px;font-weight:800;letter-spacing:-.01em}
.sl-chip{display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#3730a3;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:800}
.sl-chart-box{position:relative;height:340px}
.sl-chart-box canvas{max-width:100%}
.sl-live-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#059669;background:#ecfdf5;border-radius:999px;padding:4px 10px}
.sl-live-dot{width:8px;height:8px;border-radius:50%;background:#10b981;animation:slPulse 1s infinite}
@keyframes slPulse{0%,100%{opacity:1}50%{opacity:.25}}
.sl-table-wrap{overflow-x:auto;border:1px solid var(--sl-border);border-radius:12px}
.sl-table{width:100%;border-collapse:collapse;font-size:13.5px;white-space:nowrap}
.sl-table th{position:sticky;top:0;background:#f8fafc;text-align:left;padding:9px 12px;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--sl-muted);border-bottom:2px solid var(--sl-border);cursor:pointer;user-select:none}
.sl-table th.num,.sl-table td.num{text-align:right}
.sl-table td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
.sl-table tr:last-child td{border-bottom:none}
.sl-table tbody tr{cursor:pointer;transition:background .12s}
.sl-table tbody tr:hover{background:#eef2ff}
.sl-table tbody tr.sel{background:#e0e7ff}
.sl-empty{padding:26px;text-align:center;color:var(--sl-muted);font-size:14px}
.sl-group-tags{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.sl-tag{display:inline-flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid var(--sl-border);border-radius:999px;padding:7px 12px;font-size:13px;font-weight:700;cursor:pointer;transition:.15s}
.sl-tag:hover{border-color:#4f46e5}
.sl-tag.active{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-color:transparent}
.sl-tag .dot{width:10px;height:10px;border-radius:50%}
.sl-cut-list{display:flex;flex-direction:column;gap:10px}
.sl-cut-item{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--sl-border);border-radius:12px;padding:10px 14px;background:#f8fafc;flex-wrap:wrap}
.sl-cut-name{font-weight:800}
.sl-cut-sum{color:#4f46e5;font-weight:800}
.sl-cut-dyn{font-size:12.5px;color:var(--sl-muted)}
.sl-note{font-size:12.5px;color:var(--sl-muted);line-height:1.5;margin-top:10px}
.sl-modal{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);padding:18px}
.sl-modal.open{display:flex}
.sl-modal-panel{background:#fff;border-radius:20px;max-width:560px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 60px rgba(15,23,42,.35)}
.sl-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--sl-border);position:sticky;top:0;background:#fff;border-radius:20px 20px 0 0}
.sl-modal-head h3{font-size:17px;font-weight:800}
.sl-modal-close{border:none;background:#f1f5f9;width:34px;height:34px;border-radius:10px;font-size:16px;cursor:pointer;color:#475569}
.sl-modal-body{padding:18px 20px 22px}
.sl-form-row{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.sl-form-row label{font-size:12px;font-weight:800;color:var(--sl-muted);text-transform:uppercase;letter-spacing:.04em}
.sl-preview-box{background:#f8fafc;border:1px dashed var(--sl-border);border-radius:12px;padding:12px 14px;font-size:13.5px;margin-bottom:14px;line-height:1.55}
.sl-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:600;z-index:1300;box-shadow:0 12px 30px rgba(15,23,42,.35);max-width:90vw}
.sl-toast-success{background:#065f46}
.sl-toast-error{background:#991b1b}
@media (max-width:1000px){.sl-grid-2{grid-template-columns:1fr}.sl-chart-box{height:280px}}
@media (max-width:640px){.sl-wrap{padding:12px 10px 60px}.sl-chart-box{height:240px}.sl-kpi-value{font-size:21px}}
`;
  document.head.appendChild(salesStyle);

  // ── Разметка ──
  window.salesRenderMarkup = function () {
    var card = document.getElementById('salesCard');
    if (!card || card.getAttribute('data-ready')) return;
    card.innerHTML = `
<div class="sl-wrap">
  <div class="sl-head">
    <div class="sl-title">
      <div class="sl-logo">₽</div>
      <div>
        <h2>Дашборд продаж</h2>
        <div class="sl-sub" id="slSubtitle">Файлы продаж suadela · 1С «Отчёт о продажах»</div>
      </div>
    </div>
    <div class="sl-actions">
      <button type="button" class="sl-btn" data-sl-action="export">⬇️ Выгрузить в Excel</button>
      <button type="button" class="sl-btn sl-btn-primary" data-sl-action="upload">📂 Загрузить файлы продаж</button>
    </div>
  </div>

  <div class="sl-drop" id="slDropZone">
    <div>
      <div class="sl-drop-main">Перетащите сюда файлы продаж из 1С (.xlsx / .xls)</div>
      <div class="sl-drop-hint">Тот же формат, что понимает раздел «3SKU» (suadela): дата отчёта определяется автоматически, строки продавцов и товаров распознаются парсером suadela. Общий магазин данных: импорт виден в обоих разделах.</div>
    </div>
    <button type="button" class="sl-btn sl-btn-primary" data-sl-action="upload">Выбрать файлы</button>
  </div>

  <div class="sl-bar">
    <div class="sl-field">
      <label>Режим анализа</label>
      <div class="sl-seg" id="slScopeSeg">
        <button type="button" data-sl-scope="dayday" class="active">Day-day</button>
        <button type="button" data-sl-scope="week">Неделя</button>
        <button type="button" data-sl-scope="custom">Произвольный</button>
      </div>
    </div>
    <div class="sl-field" id="slWeekWrap" hidden>
      <label>Неделя</label>
      <select class="sl-select" id="slWeekSel"></select>
    </div>
    <div class="sl-field" id="slFromWrap" hidden>
      <label>С даты</label>
      <input class="sl-input" type="date" id="slDateFrom">
    </div>
    <div class="sl-field" id="slToWrap" hidden>
      <label>По дату</label>
      <input class="sl-input" type="date" id="slDateTo">
    </div>
    <div class="sl-field">
      <label>Метрика графика</label>
      <select class="sl-select" id="slMetricSel">
        <option value="sum">Сумма продаж, ₽</option>
        <option value="qty">Количество, шт</option>
      </select>
    </div>
    <div class="sl-field" style="flex:1;min-width:220px">
      <label>Фильтр: артикул / название / группа</label>
      <input class="sl-input" type="text" id="slSearchInput" placeholder="🔎 например 931-606 или «Кабели»">
    </div>
  </div>

  <div class="sl-tabs" id="slTabs">
    <button type="button" class="sl-tab active" data-sl-tab="dyn">📈 Динамика</button>
    <button type="button" class="sl-tab" data-sl-tab="groups">🗂 Группы</button>
    <button type="button" class="sl-tab" data-sl-tab="skus">🏷 Артикулы</button>
    <button type="button" class="sl-tab" data-sl-tab="cuts">✂️ Отсечки</button>
  </div>

  <section id="slTab-dyn">
    <div class="sl-kpis" id="slKpis"></div>
    <div class="sl-card" style="margin-bottom:16px">
      <div class="sl-card-title">
        <h3>Живая динамика продаж</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="sl-live-badge"><span class="sl-live-dot"></span>живой режим</span>
          <button type="button" class="sl-btn sl-btn-sm" data-sl-action="live">▶ Живая динамика</button>
          <button type="button" class="sl-btn sl-btn-sm" data-sl-action="play">⏩ Воспроизвести</button>
          <button type="button" class="sl-btn sl-btn-sm" data-sl-action="stop" disabled>⏹ Стоп</button>
        </div>
      </div>
      <div class="sl-chart-box"><canvas id="slDynChart"></canvas></div>
      <div class="sl-note">💡 Кликните по точке графика, чтобы добавить <b>отсечку (переоценку)</b> с вводом суммы прямо на графике. После отсечки система сравнит среднюю продажу за день ДО и ПОСЛЕ переоценки и покажет изменение динамики. Для нескольких объектов сравнения включите «Живую динамику» — все ряды будут на одном графике.</div>
    </div>
    <div class="sl-grid sl-grid-2">
      <div class="sl-card">
        <div class="sl-card-title"><h3>Структура продаж по дням</h3><span class="sl-chip" id="slStackChip">stacked</span></div>
        <div class="sl-chart-box"><canvas id="slStackChart"></canvas></div>
      </div>
      <div class="sl-card">
        <div class="sl-card-title"><h3>Топ пересечений «артикул × продавец»</h3><span class="sl-chip">за период</span></div>
        <div class="sl-chart-box"><canvas id="slTopChart"></canvas></div>
      </div>
    </div>
  </section>

  <section id="slTab-groups" hidden>
    <div class="sl-card">
      <div class="sl-card-title"><h3>Продажи по группам</h3><span class="sl-chip" id="slGroupsCount"></span></div>
      <div class="sl-group-tags" id="slGroupTags"></div>
      <div class="sl-chart-box" style="height:300px"><canvas id="slGroupChart"></canvas></div>
      <div class="sl-table-wrap" style="margin-top:14px"><table class="sl-table" id="slGroupTable"></table></div>
      <div class="sl-note">Группы формируются автоматически по префиксу артикула (до первого дефиса/слэша/точки). Префикс можно задать вручную для любого артикула в разделе «Артикулы» (кнопка ✏️).</div>
    </div>
  </section>

  <section id="slTab-skus" hidden>
    <div class="sl-card">
      <div class="sl-card-title"><h3>Продажи по артикулам</h3><span class="sl-chip" id="slSkusCount"></span></div>
      <div class="sl-table-wrap"><table class="sl-table" id="slSkuTable"></table></div>
      <div class="sl-note">Клик по строке — вывести артикул на главный график динамики. Кнопка ✏️ — задать группу вручную.</div>
    </div>
  </section>

  <section id="slTab-cuts" hidden>
    <div class="sl-card">
      <div class="sl-card-title">
        <h3>Отсечки (переоценки)</h3>
        <button type="button" class="sl-btn sl-btn-sm sl-btn-primary" data-sl-action="add-cut">➕ Добавить отсечку</button>
      </div>
      <div id="slCutsList"></div>
      <div class="sl-note">Отсечка — это момент изменения цены (переоценки). Порог задаётся в валюте метрики графика (₽ или шт). Система считает средний уровень продаж до отсечки и после неё в границах выбранного скоупа и показывает динамику после переоценки.</div>
    </div>
  </section>

  <input type="file" id="slFileInput" accept=".xlsx,.xls,.csv" multiple hidden>

  <div class="sl-modal" id="slCutModal">
    <div class="sl-modal-panel">
      <div class="sl-modal-head">
        <h3>✂️ Новая отсечка (переоценка)</h3>
        <button type="button" class="sl-modal-close" data-sl-action="close-cut">✕</button>
      </div>
      <div class="sl-modal-body" id="slCutModalBody"></div>
    </div>
  </div>
</div>
`;
    card.setAttribute('data-ready', '1');
  };

  /* ========================= СОСТОЯНИЕ ========================= */

  let charts = {};
  let liveTimer = null;
  let playState = null;
  let currentTab = 'dyn';
  let cutDraft = null;

  function defaultView() {
    return { scope: 'dayday', dateFrom: '', dateTo: '', metric: 'sum', search: '', selected: [], groupSelected: '', sortKey: 'sum', sortDir: -1 };
  }

  function loadView() {
    try {
      const raw = localStorage.getItem(SKEY);
      if (raw) return Object.assign(defaultView(), JSON.parse(raw) || {});
    } catch (e) {}
    return defaultView();
  }

  function saveView() {
    try { localStorage.setItem(SKEY, JSON.stringify(view)); } catch (e) {}
  }

  function loadCuts() {
    try {
      const raw = localStorage.getItem(SKEY + '_cuts');
      if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) return a; }
    } catch (e) {}
    return [];
  }

  function persistCuts() {
    try { localStorage.setItem(SKEY + '_cuts', JSON.stringify(cuts)); } catch (e) {}
  }

  let view = loadView();
  let cuts = loadCuts();

  /* ========================= УТИЛИТЫ ========================= */

  function api() { return window.sku3Api; }

  function esc(v) {
    if (api()) return api().esc(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtMoney(v) { return api() ? api().fmtMoney(v) : (Number(v) || 0).toLocaleString('ru-RU') + ' ₽'; }
  function fmtNum(v, d) { return api() ? api().fmtNum(v, d) : (Number(v) || 0).toLocaleString('ru-RU'); }
  function fmtShort(iso) {
    if (!iso) return '—';
    const p = String(iso).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] : iso;
  }
  function fmtFull(iso) {
    if (!iso) return '—';
    const p = String(iso).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : iso;
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function toISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseISO(s) { const p = String(s).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); }
  function addDaysISO(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
  function eachDate(start, end) { const out = []; let d = start; while (d <= end && out.length < 800) { out.push(d); d = addDaysISO(d, 1); } return out; }
  function mondayOf(iso) { const d = parseISO(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return toISO(d); }
  function uidSl(p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function toast(msg, type) {
    if (api()) { api().showToast(msg, type); return; }
    const el = document.createElement('div');
    el.className = 'sl-toast' + (type ? ' sl-toast-' + type : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function normArt(v) { return api() ? api().normArticle(v) : String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }

  /* ========================= ДАННЫЕ ========================= */

  function getSales() {
    const st = api() && api().getState ? api().getState() : null;
    return st && Array.isArray(st.sales) ? st.sales : [];
  }

  function allDates() {
    const set = new Set();
    getSales().forEach(r => { if (r.date) set.add(r.date); });
    return [...set].sort();
  }

  function weeksOf(dates) {
    const map = new Map();
    dates.forEach(d => {
      const mon = mondayOf(d);
      if (!map.has(mon)) map.set(mon, []);
      map.get(mon).push(d);
    });
    return [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([mon, ds]) => ({
      monday: mon,
      sunday: addDaysISO(mon, 6),
      days: ds.sort(),
      label: fmtShort(mon) + '–' + fmtShort(addDaysISO(mon, 6))
    }));
  }

  function scopeInfo() {
    const dates = allDates();
    if (!dates.length) return { dates: [], label: 'нет данных' };
    let sel;
    if (view.scope === 'dayday') sel = dates;
    else if (view.scope === 'week') {
      const wks = weeksOf(dates);
      const idx = Math.min(Math.max(0, parseInt(document.getElementById('slWeekSel') ? document.getElementById('slWeekSel').value : '0', 10) || 0), wks.length - 1);
      const wk = wks[idx] || wks[wks.length - 1];
      sel = wk ? wk.days : dates;
    } else {
      const from = view.dateFrom || dates[0];
      const to = view.dateTo || dates[dates.length - 1];
      sel = dates.filter(d => d >= from && d <= to);
    }
    return { dates: sel, label: sel.length ? fmtFull(sel[0]) + ' — ' + fmtFull(sel[sel.length - 1]) : 'нет данных в периоде' };
  }

  // карта артикул -> {name, groups:Set}
  function buildCatalog() {
    const cat = new Map();
    getSales().forEach(r => {
      const key = normArt(r.article);
      if (!key) return;
      let it = cat.get(key);
      if (!it) { it = { article: String(r.article || '').trim(), name: '', groups: new Set() }; cat.set(key, it); }
      if (!it.name && r.name) it.name = String(r.name).trim();
      if (r.group) it.groups.add(String(r.group).trim());
    });
    return cat;
  }

  function defaultGroup(article) {
    const s = String(article || '').trim();
    const m = s.match(/^([^-./\\_]+)/);
    return m ? m[1] : 'Без группы';
  }

  // переопределения групп: {articleNorm: groupName}
  let groupOverrides = {};
  function loadOverrides() {
    try {
      const raw = localStorage.getItem(SKEY + '_overrides');
      if (raw) groupOverrides = JSON.parse(raw) || {};
    } catch (e) { groupOverrides = {}; }
  }
  function persistOverrides() {
    try { localStorage.setItem(SKEY + '_overrides', JSON.stringify(groupOverrides)); } catch (e) {}
  }

  function effectiveGroup(record, catalog) {
    const key = normArt(record.article);
    if (groupOverrides[key]) return groupOverrides[key];
    if (record.group) return String(record.group).trim();
    const it = catalog.get(key);
    if (it && it.groups.size) return [...it.groups][0];
    return defaultGroup(record.article);
  }

  function matchesQuery(rec, q, catalog) {
    if (!q) return true;
    const needle = q.toLowerCase();
    const key = normArt(rec.article);
    const it = catalog.get(key);
    const g = effectiveGroup(rec, catalog).toLowerCase();
    return key.toLowerCase().includes(needle) ||
      String(rec.article || '').toLowerCase().includes(needle) ||
      String(rec.name || '').toLowerCase().includes(needle) ||
      (it && it.name || '').toLowerCase().includes(needle) ||
      g.includes(needle);
  }

  // Итоговые записи скоупа: [{date, seller, article, name, qty, sum}]
  function scopedRecords(info, catalog) {
    const dset = new Set(info.dates);
    return getSales().filter(r => dset.has(r.date) && matchesQuery(r, view.search.trim(), catalog));
  }

  function seriesFor(entityFn) {
    // entityFn(record) -> имя серии или null
    const catalog = buildCatalog();
    const info = scopeInfo();
    const recs = scopedRecords(info, catalog);
    const dates = info.dates;
    const bySeries = new Map();
    recs.forEach(r => {
      const name = entityFn(r, catalog);
      if (!name) return;
      if (!bySeries.has(name)) bySeries.set(name, new Map());
      const dm = bySeries.get(name);
      const cur = dm.get(r.date) || { qty: 0, sum: 0 };
      cur.qty += Number(r.qty) || 0;
      cur.sum += Number(r.sum) || 0;
      dm.set(r.date, cur);
    });
    const metric = view.metric === 'qty' ? 'qty' : 'sum';
    const series = [...bySeries.entries()].map(([name, dm], i) => ({
      name,
      color: PALETTE[i % PALETTE.length],
      values: dates.map(d => dm.has(d) ? round2(dm.get(d)[metric]) : 0)
    }));
    return { dates, series, metric, records: recs, info };
  }

  function totalSeries(data) {
    const t = data.dates.map((_, i) => round2(data.series.reduce((s, se) => s + (se.values[i] || 0), 0)));
    return { name: 'Итого', color: '#4f46e5', values: t };
  }

  function sumArr(a) { return round2(a.reduce((s, v) => s + (Number(v) || 0), 0)); }

  /* ========================= ОТСЕЧКИ / ДИНАМИКА ========================= */

  function cutContext() {
    const catalog = buildCatalog();
    const info = scopeInfo();
    return { catalog, info };
  }

  // Оценка точки графика в единицах метрики по клику
  function estimatePointValue(chart, y) {
    const sc = chart.scales && chart.scales.y;
    if (!sc) return null;
    const v = sc.getValueForPixel(y);
    return isFinite(v) ? round2(Math.max(0, v)) : null;
  }

  function computeCutEffect(cut, ctx) {
    const { info } = ctx;
    const dates = info.dates;
    if (!dates.length) return null;
    const metric = view.metric === 'qty' ? 'qty' : 'sum';

    // ряд строится заново по всему скоупу (поиск не применяется — отсечка привязана к объекту)
    let fn;
    if (cut.type === 'group') fn = (r, c) => (effectiveGroup(r, c) === cut.entity ? cut.entity : null);
    else if (cut.type === 'article') fn = (r, c) => (normArt(r.article) === normArt(cut.entity) ? cut.entity : null);
    else fn = (r, c) => 'ALL';

    const recs = getSales().filter(r => dates.indexOf(r.date) >= 0);
    const dm = new Map();
    recs.forEach(r => {
      if (!fn(r, ctx.catalog)) return;
      const cur = dm.get(r.date) || { qty: 0, sum: 0 };
      cur.qty += Number(r.qty) || 0; cur.sum += Number(r.sum) || 0;
      dm.set(r.date, cur);
    });
    const series = { values: dates.map(d => dm.has(d) ? round2(dm.get(d)[metric]) : 0) };
    return measure(series, dates, cut.date);
  }

  function measure(series, dates, cutDate) {
    const before = [], after = [];
    dates.forEach((d, i) => {
      const v = series.values[i] || 0;
      (d < cutDate ? before : after).push(v);
    });
    const avgB = before.length ? sumArr(before) / before.length : 0;
    const avgA = after.length ? sumArr(after) / after.length : 0;
    const delta = avgA - avgB;
    const pct = avgB > 0 ? (delta / avgB) * 100 : (avgA > 0 ? Infinity : 0);
    return {
      beforeDays: before.length, afterDays: after.length,
      avgBefore: round2(avgB), avgAfter: round2(avgA),
      delta: round2(delta), pct,
      totalBefore: sumArr(before), totalAfter: sumArr(after)
    };
  }

  function fmtDelta(m, metric) {
    if (!m) return '—';
    const unit = metric === 'qty' ? 'шт' : '₽';
    const sign = m.delta >= 0 ? '+' : '';
    let pctTxt;
    if (!isFinite(m.pct)) pctTxt = m.avgAfter > 0 ? 'с нуля' : '0%';
    else pctTxt = (m.pct >= 0 ? '+' : '') + Math.round(m.pct) + '%';
    const cls = m.delta >= 0 ? 'sl-up' : 'sl-down';
    return `<span class="${cls}">${sign}${fmtNum(round2(m.delta), metric === 'qty' ? 0 : 2)} ${unit}/день (${pctTxt})</span>`;
  }

  /* ========================= РЕНДЕР ========================= */

  function destroyChart(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }

  function renderAll() {
    stopLive();
    stopPlay();
    const catalog = buildCatalog();
    const info = scopeInfo();
    renderSubAndControls(catalog, info);
    renderKpis(catalog, info);
    if (currentTab === 'dyn') renderDynTab(catalog, info);
    else if (currentTab === 'groups') renderGroupsTab(catalog, info);
    else if (currentTab === 'skus') renderSkusTab(catalog, info);
    else if (currentTab === 'cuts') renderCutsTab(catalog, info);
  }

  function renderTabs() {
    document.querySelectorAll('#salesCard .sl-tab').forEach(b => b.classList.toggle('active', b.dataset.slTab === currentTab));
    ['dyn', 'groups', 'skus', 'cuts'].forEach(t => {
      const el = document.getElementById('slTab-' + t);
      if (el) el.hidden = t !== currentTab;
    });
  }

  function renderSubAndControls(catalog, info) {
    const st = api() && api().getState ? api().getState() : null;
    const storeName = st && st.settings && st.settings.storeName ? st.settings.storeName : 'Магазин';
    document.getElementById('slSubtitle').textContent =
      `${storeName} · период: ${info.label} · записей в базе: ${fmtNum(getSales().length)}`;

    document.getElementById('slWeekWrap').hidden = view.scope !== 'week';
    document.getElementById('slFromWrap').hidden = view.scope !== 'custom';
    document.getElementById('slToWrap').hidden = view.scope !== 'custom';

    const wsel = document.getElementById('slWeekSel');
    if (wsel) {
      const wks = weeksOf(allDates());
      const prev = wsel.value;
      wsel.innerHTML = wks.map((w, i) => `<option value="${i}">${esc(w.label)} (${w.days.length} дн.)</option>`).join('');
      if (prev && prev < String(wks.length)) wsel.value = prev;
    }
    const dts = allDates();
    const fEl = document.getElementById('slDateFrom'), tEl = document.getElementById('slDateTo');
    if (fEl && tEl && dts.length) {
      fEl.min = tEl.min = dts[0];
      fEl.max = tEl.max = dts[dts.length - 1];
      if (!fEl.value) fEl.value = view.dateFrom || dts[0];
      if (!tEl.value) tEl.value = view.dateTo || dts[dts.length - 1];
      view.dateFrom = fEl.value; view.dateTo = tEl.value;
    }
  }

  function periodTotals(catalog, info) {
    const recs = scopedRecords(info, catalog);
    let qty = 0, sum = 0;
    const sellers = new Set(), articles = new Set();
    recs.forEach(r => { qty += Number(r.qty) || 0; sum += Number(r.sum) || 0; if (r.seller) sellers.add(r.seller); articles.add(normArt(r.article)); });
    return { qty: round2(qty), sum: round2(sum), sellers: sellers.size, articles: articles.size, days: info.dates.length, rows: recs.length };
  }

  function renderKpis(catalog, info) {
    const box = document.getElementById('slKpis');
    const t = periodTotals(catalog, info);
    const perDay = t.days ? round2(t.sum / t.days) : 0;

    // сравнение с предыдущим периодом той же длины
    let cmpHtml = '<div class="sl-kpi-sub">нет предыдущего периода</div>';
    const dates = allDates();
    if (info.dates.length && dates.length) {
      const len = info.dates.length;
      const firstIdx = dates.indexOf(info.dates[0]);
      if (firstIdx > 0) {
        const prevDates = dates.slice(Math.max(0, firstIdx - len), firstIdx);
        const pset = new Set(prevDates);
        let pSum = 0;
        getSales().forEach(r => { if (pset.has(r.date) && matchesQuery(r, view.search.trim(), catalog)) pSum += Number(r.sum) || 0; });
        pSum = round2(pSum);
        if (pSum > 0) {
          const d = ((t.sum - pSum) / pSum) * 100;
          cmpHtml = `<div class="sl-kpi-sub ${d >= 0 ? 'sl-up' : 'sl-down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))}% к предыдущим ${prevDates.length} дн.</div>`;
        } else {
          cmpHtml = `<div class="sl-kpi-sub">пред. период: ${fmtMoney(pSum)}</div>`;
        }
      }
    }

    box.innerHTML = `
      <div class="sl-kpi"><div class="sl-kpi-label">Выручка за период</div><div class="sl-kpi-value">${fmtMoney(t.sum)}</div>${cmpHtml}</div>
      <div class="sl-kpi"><div class="sl-kpi-label">Продано штук</div><div class="sl-kpi-value">${fmtNum(t.qty)}</div><div class="sl-kpi-sub">${fmtNum(t.rows)} строк продаж</div></div>
      <div class="sl-kpi"><div class="sl-kpi-label">Средняя продажа / день</div><div class="sl-kpi-value">${fmtMoney(perDay)}</div><div class="sl-kpi-sub">${t.days} дн. в периоде</div></div>
      <div class="sl-kpi"><div class="sl-kpi-label">Уникальных артикулов</div><div class="sl-kpi-value">${fmtNum(t.articles)}</div><div class="sl-kpi-sub">продавцов: ${fmtNum(t.sellers)}</div></div>
    `;
  }

  /* ---------- Вкладка «Динамика» ---------- */

  function dynEntities(catalog, info) {
    const list = [];
    view.selected.forEach(key => {
      if (key.startsWith('G:')) list.push({ type: 'group', name: key.slice(2) });
      else if (key.startsWith('A:')) list.push({ type: 'article', name: key.slice(2) });
    });
    if (!list.length) list.push({ type: 'total', name: 'Итого' });
    return list;
  }

  function buildDynData(catalog, info) {
    const ents = dynEntities(catalog, info);
    const dates = info.dates;
    const metric = view.metric === 'qty' ? 'qty' : 'sum';
    const recs = getSales().filter(r => new Set(dates).has(r.date));
    const series = [];
    ents.forEach((e, i) => {
      const dm = new Map();
      recs.forEach(r => {
        let hit = false;
        if (e.type === 'total') hit = matchesQuery(r, view.search.trim(), catalog);
        else if (e.type === 'group') hit = effectiveGroup(r, catalog) === e.name;
        else hit = normArt(r.article) === normArt(e.name);
        if (!hit) return;
        const cur = dm.get(r.date) || { qty: 0, sum: 0 };
        cur.qty += Number(r.qty) || 0; cur.sum += Number(r.sum) || 0;
        dm.set(r.date, cur);
      });
      series.push({
        name: e.type === 'total' ? 'Итого' : (e.type === 'group' ? '🗂 ' + e.name : '🏷 ' + e.name),
        entity: e,
        color: PALETTE[i % PALETTE.length],
        values: dates.map(d => dm.has(d) ? round2(dm.get(d)[metric]) : 0)
      });
    });
    return { dates, series, metric };
  }

  function cutPluginFactory(getCtx) {
    return {
      id: 'slCuts',
      afterDatasetsDraw(chart) {
        const cs = getCtx();
        if (!cs) return;
        const { dates, metric } = cs;
        const xScale = chart.scales.x, yScale = chart.scales.y;
        if (!xScale || !yScale) return;
        const area = chart.chartArea;
        const ctx = chart.ctx;
        cuts.forEach(cut => {
          const idx = dates.indexOf(cut.date);
          if (idx < 0) return;
          const px = xScale.getPixelForValue(idx);
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke();
          ctx.setLineDash([]);
          // ярлык
          const label = '✂ ' + fmtShort(cut.date) + (cut.threshold != null ? ' · порог ' + fmtNum(cut.threshold, metric === 'qty' ? 0 : 2) : '');
          ctx.font = '700 11px Inter, system-ui, sans-serif';
          const w = ctx.measureText(label).width + 14;
          let lx = px + 6;
          if (lx + w > area.right) lx = px - 6 - w;
          ctx.fillStyle = 'rgba(239,68,68,.95)';
          roundRect(ctx, lx, area.top + 4, w, 20, 7); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(label, lx + 7, area.top + 18);
          // горизонталь порога
          if (cut.threshold != null) {
            const py = yScale.getPixelForValue(cut.threshold);
            if (py >= area.top && py <= area.bottom) {
              ctx.strokeStyle = 'rgba(79,70,229,.85)';
              ctx.setLineDash([3, 3]);
              ctx.beginPath(); ctx.moveTo(area.left, py); ctx.lineTo(area.right, py); ctx.stroke();
              ctx.setLineDash([]);
              const tl = (metric === 'qty' ? fmtNum(cut.threshold, 0) + ' шт' : fmtMoney(cut.threshold));
              ctx.font = '800 11px Inter, system-ui, sans-serif';
              const tw = ctx.measureText(tl).width + 12;
              ctx.fillStyle = 'rgba(79,70,229,.95)';
              roundRect(ctx, area.right - tw - 4, py - 22, tw, 18, 6); ctx.fill();
              ctx.fillStyle = '#fff';
              ctx.fillText(tl, area.right - tw + 2, py - 8);
            }
          }
          ctx.restore();
        });
      }
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  let dynCtxRef = { dates: [], series: [], metric: 'sum' };

  function renderDynTab(catalog, info) {
    const data = buildDynData(catalog, info);
    dynCtxRef = data;
    const labels = data.dates.map(fmtShort);
    const unit = data.metric === 'qty' ? 'шт' : '₽';

    const datasets = data.series.map(s => ({
      label: s.name,
      slEntity: s.entity || { type: 'total', name: s.name },
      data: s.values.slice(),
      borderColor: s.color,
      backgroundColor: hexA(s.color, .12),
      borderWidth: 2.5,
      tension: .35,
      fill: data.series.length === 1,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBackgroundColor: '#fff',
      pointBorderColor: s.color,
      pointBorderWidth: 2
    }));

    destroyChart('dyn');
    const cv = document.getElementById('slDynChart');
    if (!cv || typeof Chart === 'undefined') return;
    const chart = new Chart(cv.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, font: { weight: '700' } } },
          tooltip: {
            callbacks: {
              title: items => 'Дата: ' + (items.length ? data.dates[items[0].dataIndex] : ''),
              label: item => ' ' + item.dataset.label + ': ' + (data.metric === 'qty' ? fmtNum(item.parsed.y, 2) + ' шт' : fmtMoney(item.parsed.y))
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 60, autoSkip: true } },
          y: { beginAtZero: true, title: { display: true, text: 'Продажи, ' + unit }, ticks: { callback: v => data.metric === 'qty' ? fmtNum(v, 0) : fmtNum(v, 0) } }
        },
        onClick: (evt, els, ch) => {
          const area = ch.chartArea;
          if (!area) return;
          const { left, top, right, bottom } = area;
          if (evt.native && evt.native.offsetX >= left && evt.native.offsetX <= right && evt.native.offsetY >= top && evt.native.offsetY <= bottom) {
            openCutModal(ch, evt.native);
          }
        }
      },
      plugins: [cutPluginFactory(() => dynCtxRef)]
    });
    charts.dyn = chart;

    renderStackChart(catalog, info);
    renderTopChart(catalog, info);
  }

  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function renderStackChart(catalog, info) {
    destroyChart('stack');
    const cv = document.getElementById('slStackChart');
    if (!cv || typeof Chart === 'undefined') return;
    const data = seriesFor((r, c) => effectiveGroup(r, c));
    const sorted = data.series.slice().sort((a, b) => sumArr(b.values) - sumArr(a.values)).slice(0, 8);
    const labels = data.dates.map(fmtShort);
    charts.stack = new Chart(cv.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: sorted.map((s, i) => ({
          label: s.name, data: s.values,
          backgroundColor: PALETTE[i % PALETTE.length],
          borderRadius: 4, stack: 'g'
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } },
          tooltip: { callbacks: { label: item => ' ' + item.dataset.label + ': ' + (data.metric === 'qty' ? fmtNum(item.parsed.y, 2) + ' шт' : fmtMoney(item.parsed.y)) } }
        },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } }
      }
    });
  }

  function renderTopChart(catalog, info) {
    destroyChart('top');
    const cv = document.getElementById('slTopChart');
    if (!cv || typeof Chart === 'undefined') return;
    const recs = scopedRecords(info, catalog);
    const agg = new Map();
    recs.forEach(r => {
      const key = (r.seller ? r.seller.split(' ')[0] + ' ' + (r.seller.split(' ')[1] || '') : '—') + ' × ' + r.article;
      agg.set(key, (agg.get(key) || 0) + (Number(r.sum) || 0));
    });
    const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    charts.top = new Chart(cv.getContext('2d'), {
      type: 'bar',
      data: {
        labels: top.map(t => t[0]),
        datasets: [{ label: '₽', data: top.map(t => round2(t[1])), backgroundColor: '#4f46e5', borderRadius: 6 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => ' ' + fmtMoney(item.parsed.x) } } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }

  /* ---------- Живая динамика / воспроизведение ---------- */

  function stopLive() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    const btn = document.querySelector('#salesCard [data-sl-action="live"]');
    if (btn) { btn.textContent = '▶ Живая динамика'; btn.classList.remove('sl-btn-danger'); }
  }

  function toggleLive() {
    if (liveTimer) { stopLive(); return; }
    if (view.selected.length < 2) {
      const catalog = buildCatalog();
      const groups = [...new Set(scopedRecords(scopeInfo(), catalog).map(r => effectiveGroup(r, catalog)))].slice(0, 4);
      view.selected = groups.map(g => 'G:' + g);
      saveView();
      renderAll();
    }
    liveTimer = setInterval(() => {
      const ch = charts.dyn;
      if (!ch) return;
      ch.data.datasets.forEach(ds => {
        ds.data = ds.data.map(v => Math.max(0, round2(v * (1 + (Math.random() - 0.5) * 0.08))));
      });
      ch.update('none');
      ch.update();
    }, 1500);
    const btn = document.querySelector('#salesCard [data-sl-action="live"]');
    if (btn) { btn.textContent = '⏸ Остановить live'; btn.classList.add('sl-btn-danger'); }
    toast('Живая динамика запущена: значения обновляются каждые 1.5 с', 'success');
  }

  function stopPlay() {
    if (playState && playState.timer) clearInterval(playState.timer);
    playState = null;
    const bs = document.querySelector('#salesCard [data-sl-action="stop"]');
    const bp = document.querySelector('#salesCard [data-sl-action="play"]');
    if (bs) bs.disabled = true;
    if (bp) bp.disabled = false;
  }

  function startPlay() {
    const ch = charts.dyn;
    if (!ch) return;
    const n = ch.data.labels.length;
    if (!n) return;
    stopPlay();
    const originals = ch.data.datasets.map(ds => ds.data.slice());
    ch.data.datasets.forEach(ds => { ds.data = ds.data.map(() => null); });
    ch.update('none');
    playState = { i: 0, timer: null, originals };
    const bs = document.querySelector('#salesCard [data-sl-action="stop"]');
    const bp = document.querySelector('#salesCard [data-sl-action="play"]');
    if (bs) bs.disabled = false;
    if (bp) bp.disabled = true;
    playState.timer = setInterval(() => {
      if (!playState) return;
      const i = playState.i;
      if (i >= n) {
        stopPlay();
        ch.data.datasets.forEach((ds, k) => { ds.data = playStateOriginals(ch, k, originals); });
        ch.options.animation = { duration: 700 };
        ch.update();
        toast('Воспроизведение завершено', 'success');
        return;
      }
      ch.data.datasets.forEach(ds => { ds.data[i] = originals[ch.data.datasets.indexOf(ds)][i]; });
      ch.options.animation = { duration: 350 };
      ch.update();
      if (ch.options.scales && ch.options.scales.x) {
        const max = Math.min(n - 1, i + 6);
        ch.options.scales.x.min = Math.max(0, max - 7);
        ch.options.scales.x.max = max;
      }
      playState.i++;
    }, 450);
    toast('Воспроизвожу динамику по дням…', 'success');
  }

  function playStateOriginals(ch, k, originals) { return originals[k] ? originals[k].slice() : ch.data.datasets[k].data; }

  /* ---------- Вкладка «Группы» ---------- */

  function groupAgg(catalog, info) {
    const recs = scopedRecords(info, catalog);
    const map = new Map();
    recs.forEach(r => {
      const g = effectiveGroup(r, catalog);
      let it = map.get(g);
      if (!it) { it = { group: g, qty: 0, sum: 0, articles: new Set(), sellers: new Set() }; map.set(g, it); }
      it.qty += Number(r.qty) || 0; it.sum += Number(r.sum) || 0;
      it.articles.add(normArt(r.article));
      if (r.seller) it.sellers.add(r.seller);
    });
    return [...map.values()].map(x => ({ ...x, qty: round2(x.qty), sum: round2(x.sum), articles: x.articles.size, sellers: x.sellers.size }))
      .sort((a, b) => b.sum - a.sum);
  }

  function renderGroupsTab(catalog, info) {
    const gs = groupAgg(catalog, info);
    document.getElementById('slGroupsCount').textContent = gs.length + ' групп';
    const tagsBox = document.getElementById('slGroupTags');
    tagsBox.innerHTML = gs.map((g, i) => `
      <span class="sl-tag ${view.groupSelected === g.group ? 'active' : ''}" data-sl-action="pick-group" data-group="${esc(g.group)}">
        <span class="dot" style="background:${PALETTE[i % PALETTE.length]}"></span>${esc(g.group)} · ${fmtMoney(g.sum)}
      </span>`).join('') || '<div class="sl-empty">Нет групп в выбранном периоде</div>';

    destroyChart('grp');
    const cv = document.getElementById('slGroupChart');
    if (cv && typeof Chart !== 'undefined') {
      const top = gs.slice(0, 12);
      charts.grp = new Chart(cv.getContext('2d'), {
        type: 'bar',
        data: {
          labels: top.map(g => g.group),
          datasets: [
            { label: 'Сумма, ₽', data: top.map(g => g.sum), backgroundColor: '#4f46e5', borderRadius: 6, yAxisID: 'y' },
            { label: 'Шт', data: top.map(g => g.qty), backgroundColor: '#06b6d4', borderRadius: 6, yAxisID: 'y1', type: 'line', borderColor: '#06b6d4', borderWidth: 2, tension: .3 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
          plugins: { legend: { position: 'top', labels: { usePointStyle: true } } },
          scales: { y: { beginAtZero: true, position: 'left' }, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } } }
        }
      });
    }

    const total = gs.reduce((s, g) => s + g.sum, 0) || 1;
    const tbl = document.getElementById('slGroupTable');
    tbl.innerHTML = `
      <thead><tr><th>Группа</th><th class="num">Сумма, ₽</th><th class="num">Доля</th><th class="num">Кол-во, шт</th><th class="num">Артикулов</th><th class="num">Продавцов</th><th></th></tr></thead>
      <tbody>${gs.map(g => `
        <tr data-sl-action="pick-group" data-group="${esc(g.group)}">
          <td><b>${esc(g.group)}</b></td>
          <td class="num">${fmtMoney(g.sum)}</td>
          <td class="num">${Math.round(g.sum / total * 100)}%</td>
          <td class="num">${fmtNum(g.qty, 2)}</td>
          <td class="num">${g.articles}</td>
          <td class="num">${g.sellers}</td>
          <td class="num">${view.selected.includes('G:' + g.group) ? '✅ на графике' : '➕'}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="sl-empty">Нет данных</td></tr>'}
      </tbody>`;
  }

  /* ---------- Вкладка «Артикулы» ---------- */

  function skuAgg(catalog, info) {
    const recs = scopedRecords(info, catalog);
    const map = new Map();
    recs.forEach(r => {
      const key = normArt(r.article);
      let it = map.get(key);
      if (!it) { it = { article: r.article, key, name: '', qty: 0, sum: 0, days: new Set(), sellers: new Set() }; map.set(key, it); }
      if (!it.name && r.name) it.name = r.name;
      const ci = catalog.get(key);
      if (!it.name && ci && ci.name) it.name = ci.name;
      it.qty += Number(r.qty) || 0; it.sum += Number(r.sum) || 0;
      if (r.date) it.days.add(r.date);
      if (r.seller) it.sellers.add(r.seller);
    });
    return [...map.values()].map(x => ({ ...x, qty: round2(x.qty), sum: round2(x.sum), days: x.days.size, sellers: x.sellers.size }));
  }

  function renderSkusTab(catalog, info) {
    let skus = skuAgg(catalog, info);
    document.getElementById('slSkusCount').textContent = skus.length + ' артикулов';
    skus.sort((a, b) => (view.sortKey === 'name' ? String(a.name).localeCompare(String(b.name), 'ru') : (a[view.sortKey] || 0) - (b[view.sortKey] || 0)) * view.sortDir);
    const tbl = document.getElementById('slSkuTable');
    const head = `<thead><tr>
      <th data-sl-sort="article">Артикул</th><th data-sl-sort="name">Название</th><th>Группа</th>
      <th class="num" data-sl-sort="sum">Сумма, ₽</th><th class="num" data-sl-sort="qty">Кол-во, шт</th>
      <th class="num" data-sl-sort="days">Дней с продажами</th><th class="num" data-sl-sort="sellers">Продавцов</th><th></th>
    </tr></thead>`;
    const body = skus.slice(0, 400).map(s => {
      const sel = view.selected.includes('A:' + s.key);
      return `<tr class="${sel ? 'sel' : ''}" data-sl-action="pick-sku" data-key="${esc(s.key)}" data-name="${esc(s.article)}">
        <td><b>${esc(s.article)}</b></td>
        <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis">${esc(s.name || '—')}</td>
        <td>${esc(groupOverrides[s.key] || defaultGroup(s.article))}</td>
        <td class="num">${fmtMoney(s.sum)}</td>
        <td class="num">${fmtNum(s.qty, 2)}</td>
        <td class="num">${s.days}</td>
        <td class="num">${s.sellers}</td>
        <td class="num"><button type="button" class="sl-btn sl-btn-sm" data-sl-action="rename-group" data-key="${esc(s.key)}" data-cur="${esc(groupOverrides[s.key] || defaultGroup(s.article))}">✏️</button></td>
      </tr>`;
    }).join('');
    tbl.innerHTML = head + '<tbody>' + (body || '<tr><td colspan="8" class="sl-empty">Нет данных</td></tr>') + '</tbody>';
  }

  /* ---------- Вкладка «Отсечки» ---------- */

  function renderCutsTab(catalog, info) {
    const box = document.getElementById('slCutsList');
    if (!cuts.length) {
      box.innerHTML = '<div class="sl-empty">Отсечек пока нет.<br>Добавьте первую — или кликните по точке на графике «Динамика».</div>';
      return;
    }
    const ctx = cutContext();
    const metric = view.metric === 'qty' ? 'qty' : 'sum';
    box.innerHTML = '<div class="sl-cut-list">' + cuts.map(c => {
      const m = computeCutEffect(c, ctx);
      return `<div class="sl-cut-item">
        <div>
          <div class="sl-cut-name">✂️ ${esc(c.entityLabel || c.entity)} · ${fmtFull(c.date)}</div>
          <div class="sl-cut-dyn">Порог: <span class="sl-cut-sum">${c.threshold != null ? (metric === 'qty' ? fmtNum(c.threshold, 0) + ' шт' : fmtMoney(c.threshold)) : 'не задан'}</span>
          ${m ? ` · До: ${fmtNum(m.avgBefore, metric === 'qty' ? 0 : 2)}/день (${m.beforeDays} дн.) · После: ${fmtNum(m.avgAfter, metric === 'qty' ? 0 : 2)}/день (${m.afterDays} дн.)` : ' · нет данных относительно скоупа'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div>${m ? fmtDelta(m, metric) : ''}</div>
          <button type="button" class="sl-btn sl-btn-sm" data-sl-action="focus-cut" data-id="${esc(c.id)}">🎯 Показать</button>
          <button type="button" class="sl-btn sl-btn-sm sl-btn-danger" data-sl-action="del-cut" data-id="${esc(c.id)}">🗑</button>
        </div>
      </div>`;
    }).join('') + '</div>';
  }

  /* ---------- Модальное окно отсечки ---------- */

  function openCutModal(chart, nativeEvt) {
    const rect = chart.canvas.getBoundingClientRect();
    const x = nativeEvt.clientX - rect.left, y = nativeEvt.clientY - rect.top;
    const xs = chart.scales.x, idx = Math.round(xs.getValueForPixel(x));
    const dates = dynCtxRef.dates;
    if (idx < 0 || idx >= dates.length) return;
    const ds = chart.data.datasets[0];
    const entity = ds && ds.slEntity ? ds.slEntity : { type: 'total', name: 'Итого' };
    const val = estimatePointValue(chart, y);
    cutDraft = { date: dates[idx], entity: entity.type === 'total' ? 'ALL' : entity.name, entityType: entity.type, threshold: val, label: entity.name };
    const metricUnit = dynCtxRef.metric === 'qty' ? 'шт' : '₽';
    const body = document.getElementById('slCutModalBody');
    body.innerHTML = `
      <div class="sl-preview-box">
        Дата отсечки: <b>${fmtFull(cutDraft.date)}</b><br>
        Объект: <b>${esc(entity.name)}</b> (${entity.type === 'group' ? 'группа' : entity.type === 'article' ? 'артикул' : 'все продажи'})<br>
        Метрика: <b>${dynCtxRef.metric === 'qty' ? 'количество, шт' : 'сумма, ₽'}</b><br>
        Значение под курсором: <b>${val != null ? fmtNum(val, dynCtxRef.metric === 'qty' ? 0 : 2) + ' ' + metricUnit : '—'}</b>
      </div>
      <div class="sl-form-row"><label>Название отсечки</label><input class="sl-input" id="slCutName" value="Переценка ${fmtShort(cutDraft.date)}"></div>
      <div class="sl-form-row"><label>Дата отсечки</label><input class="sl-input" type="date" id="slCutDate" value="${esc(cutDraft.date)}" min="${esc(dates[0] || '')}" max="${esc(dates[dates.length - 1] || '')}"></div>
      <div class="sl-form-row"><label>Сумма порога (${metricUnit}) — точка переоценки на графике</label><input class="sl-input" type="number" step="any" min="0" id="slCutThreshold" value="${val != null ? val : ''}"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" class="sl-btn" data-sl-action="close-cut">Отмена</button>
        <button type="button" class="sl-btn sl-btn-primary" data-sl-action="save-cut">💾 Сохранить отсечку</button>
      </div>
      <div class="sl-note">Отсечка появится на графике как красная пунктирная вертикаль с ярлыком, а порог — синей горизонтальной линией. Во вкладке «Отсечки» система рассчитает динамику средних продаж ДО и ПОСЛЕ этой даты.</div>
    `;
    document.getElementById('slCutModal').classList.add('open');
  }

  function closeCutModal() {
    document.getElementById('slCutModal').classList.remove('open');
    cutDraft = null;
  }

  function saveCutFromModal() {
    if (!cutDraft) return;
    const date = document.getElementById('slCutDate').value;
    const thresholdRaw = document.getElementById('slCutThreshold').value;
    const name = document.getElementById('slCutName').value.trim();
    if (!date) { toast('Укажите дату отсечки', 'error'); return; }
    const cut = {
      id: uidSl('cut'),
      date,
      threshold: thresholdRaw === '' ? null : Math.max(0, Number(thresholdRaw)),
      entity: cutDraft.entity,
      type: cutDraft.entityType,
      entityLabel: name || cutDraft.label
    };
    cuts.push(cut);
    persistCuts();
    closeCutModal();
    toast('Отсечка добавлена: ' + fmtFull(date), 'success');
    renderAll();
  }

  /* ---------- Экспорт ---------- */

  function exportExcel() {
    if (typeof XLSX === 'undefined') { toast('Библиотека XLSX не найдена', 'error'); return; }
    const catalog = buildCatalog();
    const info = scopeInfo();
    const aoa = [['Дата', 'Артикул', 'Название', 'Группа', 'Продавец', 'Количество', 'Сумма']];
    scopedRecords(info, catalog)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .forEach(r => aoa.push([r.date, r.article, r.name || '', effectiveGroup(r, catalog), r.seller || '', Number(r.qty) || 0, round2(Number(r.sum) || 0)]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Продажи');
    XLSX.writeFile(wb, 'Продажи_' + (info.dates[0] || '') + '_' + (info.dates[info.dates.length - 1] || '') + '.xlsx');
    toast('Файл выгружен', 'success');
  }

  /* ---------- Импорт ---------- */

  async function importFiles(files) {
    const arr = [...(files || [])];
    if (!arr.length) return;
    if (api() && api().handleImportFiles) {
      await api().handleImportFiles(arr);
      return;
    }
    // Резервный путь: если 3SKU не проинициализирован — свой парсер через XLSX
    toast('Инициализирую общий парсер suadela…', 'success');
    if (!ensureSku3()) return;
    await api().handleImportFiles(arr);
  }

  function ensureSku3() {
    if (api() && api().getState) return true;
    if (typeof window.sku3RenderMarkup === 'function') {
      window.sku3RenderMarkup();
      try { window.sku3Init(); } catch (e) { console.error(e); }
      return !!(api() && api().getState);
    }
    toast('Не загружен js/sku3.js — раздел «Продажи» требует парсер suadela.', 'error');
    return false;
  }

  /* ========================= СОБЫТИЯ ========================= */

  function bindEvents() {
    const root = document.getElementById('salesCard');

    root.addEventListener('click', e => {
      const act = e.target.closest('[data-sl-action]');
      if (act) {
        switch (act.dataset.slAction) {
          case 'upload': document.getElementById('slFileInput').click(); return;
          case 'export': exportExcel(); return;
          case 'live': toggleLive(); return;
          case 'play': startPlay(); return;
          case 'stop': stopPlay(); renderAll(); return;
          case 'add-cut': {
            const dates = dynCtxRef.dates && dynCtxRef.dates.length ? dynCtxRef.dates : scopeInfo().dates;
            if (!dates.length) { toast('Сначала загрузите файлы продаж', 'error'); return; }
            const mid = Math.floor(dates.length / 2);
            const ent = (dynCtxRef.series && dynCtxRef.series[0] && dynCtxRef.series[0].entity) || { type: 'total', name: 'Итого' };
            const fakeChart = {
              canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
              scales: { x: { getValueForPixel: () => mid }, y: null },
              data: { datasets: [{ slEntity: ent }] }
            };
            openCutModal(fakeChart, { clientX: 100, clientY: 100 });
            return;
          }
          case 'save-cut': saveCutFromModal(); return;
          case 'close-cut': closeCutModal(); return;
          case 'del-cut': cuts = cuts.filter(c => c.id !== act.dataset.id); persistCuts(); renderAll(); return;
          case 'focus-cut': {
            const c = cuts.find(x => x.id === act.dataset.id);
            if (c) {
              const key = c.type === 'group' ? 'G:' + c.entity : c.type === 'article' ? 'A:' + c.entity : null;
              if (key && !view.selected.includes(key)) { view.selected = [key]; saveView(); }
              switchTab('dyn');
            }
            return;
          }
          case 'pick-group': {
            const g = act.dataset.group;
            const key = 'G:' + g;
            view.groupSelected = view.groupSelected === g ? '' : g;
            toggleSelect(key);
            return;
          }
          case 'pick-sku': {
            toggleSelect('A:' + act.dataset.key);
            return;
          }
          case 'rename-group': {
            e.stopPropagation();
            const key = act.dataset.key;
            const nv = prompt('Название группы для артикула ' + key + ':', act.dataset.cur || '');
            if (nv != null && nv.trim()) { groupOverrides[key] = nv.trim(); persistOverrides(); renderAll(); }
            return;
          }
        }
      }
      const tab = e.target.closest('[data-sl-tab]');
      if (tab) { switchTab(tab.dataset.slTab); return; }
      const th = e.target.closest('[data-sl-sort]');
      if (th) {
        const k = th.dataset.slSort;
        if (view.sortKey === k) view.sortDir *= -1; else { view.sortKey = k; view.sortDir = -1; }
        saveView();
        renderSkusTab(buildCatalog(), scopeInfo());
        return;
      }
      const seg = e.target.closest('[data-sl-scope]');
      if (seg) {
        view.scope = seg.dataset.slScope;
        saveView();
        document.querySelectorAll('#salesCard [data-sl-scope]').forEach(b => b.classList.toggle('active', b.dataset.slScope === view.scope));
        renderAll();
        return;
      }
      if (e.target.closest('.sl-modal.open')) { closeCutModal(); return; }
    });

    root.addEventListener('change', e => {
      if (e.target.id === 'slFileInput') { importFiles(e.target.files); e.target.value = ''; return; }
      if (e.target.id === 'slWeekSel') { saveView(); renderAll(); return; }
      if (e.target.id === 'slMetricSel') { view.metric = e.target.value; saveView(); renderAll(); return; }
      if (e.target.id === 'slDateFrom') { view.dateFrom = e.target.value; saveView(); renderAll(); return; }
      if (e.target.id === 'slDateTo') { view.dateTo = e.target.value; saveView(); renderAll(); return; }
    });

    root.addEventListener('input', e => {
      if (e.target.id === 'slSearchInput') {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => { view.search = e.target.value; saveView(); renderAll(); }, 350);
      }
    });

    const dz = document.getElementById('slDropZone');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, x => { x.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, x => { x.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', x => { if (x.dataTransfer && x.dataTransfer.files) importFiles(x.dataTransfer.files); });
    dz.addEventListener('click', e => { if (!e.target.closest('button')) document.getElementById('slFileInput').click(); });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeCutModal();
    });
  }

  let searchDebounce = null;

  function toggleSelect(key) {
    if (view.selected.includes(key)) view.selected = view.selected.filter(k => k !== key);
    else view.selected.push(key);
    saveView();
    renderAll();
  }

  function switchTab(t) {
    currentTab = t;
    renderTabs();
    stopLive(); stopPlay();
    const catalog = buildCatalog();
    const info = scopeInfo();
    if (t === 'dyn') renderDynTab(catalog, info);
    else if (t === 'groups') renderGroupsTab(catalog, info);
    else if (t === 'skus') renderSkusTab(catalog, info);
    else if (t === 'cuts') renderCutsTab(catalog, info);
  }

  /* ========================= ИНИЦИАЛИЗАЦИЯ ========================= */

  function attachEntityToDatasets() {
    // сохраняем ссылку на сущность в датасетах живого графика для клика-отсечки
    const ch = charts.dyn;
    if (!ch) return;
    ch.data.datasets.forEach((ds, i) => {
      if (dynCtxRef.series[i]) ds.slEntity = dynCtxRef.series[i].entity || { type: 'total', name: dynCtxRef.series[i].name };
    });
  }

  window.salesInit = function () {
    if (document.getElementById('salesCard').getAttribute('data-inited')) return;
    document.getElementById('salesCard').setAttribute('data-inited', '1');
    loadOverrides();
    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
      Chart.defaults.color = '#64748b';
    }
    bindEvents();
    document.querySelectorAll('#salesCard [data-sl-scope]').forEach(b => b.classList.toggle('active', b.dataset.slScope === view.scope));
    const ms = document.getElementById('slMetricSel'); if (ms) ms.value = view.metric;
    const si = document.getElementById('slSearchInput'); if (si) si.value = view.search || '';
    renderTabs();
    renderAll();
    // после построения графика привязываем сущности к датасетам
    attachEntityToDatasets();
    const origUpdate = charts.dyn ? charts.dyn.update.bind(charts.dyn) : null;
    if (charts.dyn && origUpdate) {
      charts.dyn.update = function (...args) { attachEntityToDatasets(); return origUpdate(...args); };
    }
  };

  window.salesHide = function () {
    const c = document.getElementById('salesCard');
    if (c) c.classList.add('hidden');
    stopLive(); stopPlay();
  };
})();
