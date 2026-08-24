Разбиваю. Структура папки:

```
📁 galamart-analyst/
│  📄 index.html
│  📁 js/
│     📄 core.js, markdown.js, browse.js, problems.js, dashboard.js,
│     📄 analysis.js, top100.js, cards.js, zones-gifts.js, app.js
│  📁 lib/
│     📄 xlsx.full.min.js   ← скачать: https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
│     📄 chart.umd.min.js   ← скачать: https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js
```

Функционал не менялся вообще — только раскладка. Запуск по-прежнему: двойной клик по `index.html`.

---

**`index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Менеджер уценки Галамарт (v12 · модульная сборка)</title>
  <!--
    v12 — РАСПИЛ на модули без изменения функционала.
    Структура:
      index.html      — разметка и стили
      js/core.js      — утилиты, парсер отчёта, настройки, агрегаторы
      js/markdown.js  — уценка: таблица, итоги, экспорт
      js/browse.js    — режим «Просмотр» и его фильтры
      js/problems.js  — панель «Проблемы»
      js/dashboard.js — дашборд и детализации
      js/analysis.js  — «Анализ» (страницы показателей)
      js/top100.js    — ТОП-100
      js/cards.js     — карточки товара и группы
      js/zones-gifts.js — зоны, мега-зоны, подарки
      js/app.js       — режимы, модалка, оркестрация, инициализация
      lib/            — xlsx и chart.js локально (без CDN)
  -->
  <style>
    :root {
      --primary: #2563eb; --primary-hover: #1d4ed8;
      --bg: #f1f5f9; --card: #ffffff; --text: #0f172a; --text-muted: #64748b;
      --border: #e2e8f0; --hover: #f8fafc;
      --success: #10b981; --success-bg: #d1fae5;
      --warn: #f59e0b; --warn-bg: #fef3c7;
      --error: #ef4444; --error-bg: #fee2e2;
      --radius: 12px; --shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; line-height: 1.4; }
    .container { max-width: 1600px; margin: 0 auto; }
    h1 { margin: 0 0 16px; font-size: 1.5rem; font-weight: 600; }
    .card { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; margin-bottom: 18px; }
    .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
    .control-group { display: flex; flex-direction: column; gap: 4px; min-width: 200px; }
    label { font-size: 0.8rem; font-weight: 500; color: var(--text-muted); }
    input[type="file"], input[type="date"], input[type="number"], input[type="text"], select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; background: #fff; transition: 0.2s; width: 100%; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
    button { background: var(--primary); color: #fff; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 0.85rem; transition: 0.2s; height: fit-content; white-space: nowrap; }
    button:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
    button:disabled { background: #94a3b8; cursor: not-allowed; opacity: 0.7; }
    .btn-export { background: #059669; }
    .btn-export:hover:not(:disabled) { background: #047857; }
    .btn-ghost { background: #64748b; }
    .btn-ghost:hover:not(:disabled) { background: #475569; }
    .btn-danger { background: #ef4444; }
    .btn-danger:hover:not(:disabled) { background: #dc2626; }
    .status { padding: 8px 12px; border-radius: 8px; margin-top: 10px; display: none; font-size: 0.85rem; white-space: pre-wrap; }
    .status.success { background: var(--success-bg); color: #065f46; display: block; }
    .status.error   { background: var(--error-bg);   color: #991b1b; display: block; }

    .mode-bar { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
    .mode-cluster { display: flex; flex-direction: column; gap: 3px; }
    .cluster-label { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 700; }
    .segmented { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #fff; }
    .seg-btn { background: #fff; color: var(--text); border-radius: 0; padding: 9px 13px; font-size: 0.83rem; font-weight: 500; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .seg-btn:hover:not(.active):not(:disabled) { background: var(--hover); color: var(--text); transform: none; }
    .seg-btn.active { background: var(--primary); color: #fff; }
    .seg-btn.active:hover:not(:disabled) { background: var(--primary-hover); transform: none; }

    .filters-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border); }
    .search-input { max-width: 280px; }
    .group-select { width: auto; min-width: 170px; max-width: 250px; }
    .cube-select { width: auto; min-width: 160px; max-width: 260px; }
    .hint { font-size: 0.72rem; color: var(--text-muted); }

    .cube-checks { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .cube-check { display: inline-flex; align-items: center; gap: 6px; background: #f8fafc; border: 1px solid var(--border); padding: 7px 10px; border-radius: 8px; font-size: 0.82rem; font-weight: 500; cursor: pointer; transition: 0.2s; user-select: none; margin: 0; color: var(--text); }
    .cube-check input { cursor: pointer; accent-color: var(--primary); }
    .cube-check:hover { border-color: var(--primary); }
    .cube-check:has(input:checked) { background: #eff6ff; border-color: var(--primary); color: var(--primary-hover); font-weight: 600; }

    .result-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
    .result-header h2 { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-muted); }

    .table-wrapper { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); max-height: 75vh; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8rem; white-space: nowrap; }
    thead { background: #f8fafc; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    th { padding: 10px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border); color: #334155; }
    td { padding: 8px; border-bottom: 1px solid var(--border); vertical-align: middle; transition: background 0.25s; }
    tr:hover td { background: var(--hover); }

    table.sortable th { cursor: pointer; user-select: none; }
    table.sortable th:hover { color: var(--primary); }
    table.sortable th[data-sort-dir] { color: var(--primary); }
    table.sortable th[data-sort-dir="desc"]::after { content: ' ▼'; font-size: 0.7em; }
    table.sortable th[data-sort-dir="asc"]::after { content: ' ▲'; font-size: 0.7em; }

    tr.row-edited td { background: #fefce8; }
    tr.row-edited:hover td { background: #fef9c3; }
    tr.row-edited td:first-child { box-shadow: inset 3px 0 0 var(--warn); }

    .md-totals { background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }
    .md-totals-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
    .md-total-value { font-size: 1.05rem; font-weight: 800; }
    .md-total { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; }
    .md-total.t-accent { background: #eff6ff; border-color: #bfdbfe; }
    .md-total.t-good { background: #f0fdf4; border-color: #bbf7d0; }
    .md-total.t-warn { background: var(--warn-bg); border-color: #fde68a; }
    .md-total.t-fire { background: var(--error-bg); border-color: #fecaca; }
    .md-total.t-fire .md-total-value { color: #991b1b; }
    .md-total.t-good .md-total-value { color: #065f46; }

    .truncate { max-width: 140px; overflow: hidden; text-overflow: ellipsis; cursor: help; position: relative; }
    .truncate:hover::after {
      content: attr(data-full);
      position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
      background: #1e293b; color: #fff; padding: 4px 8px; border-radius: 6px;
      font-size: 0.75rem; z-index: 100; pointer-events: none; white-space: normal;
      min-width: 140px; max-width: 300px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .price-input { width: 80px; font-weight: 600; text-align: center; }
    .refill-input { width: 64px; font-weight: 600; text-align: center; }
    .margin-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 500; min-width: 48px; text-align: center; }
    .m-green  { background: var(--success-bg); color: #065f46; }
    .m-yellow { background: var(--warn-bg);    color: #92400e; }
    .m-red    { background: var(--error-bg);   color: #991b1b; }

    .apply-btn { padding: 2px 6px; font-size: 0.7rem; background: var(--primary); color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-left: 4px; opacity: 0.8; transition: 0.2s; }
    .apply-btn:hover { opacity: 1; }

    .suggested      { color: var(--primary); font-weight: 600; }
    .suggested-fire { color: var(--error);   font-weight: 700; }

    .hidden { display: none !important; }
    .text-muted { color: var(--text-muted); }
    .fire-text { color: var(--error); font-weight: 700; }

    .info-badge { background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 6px; font-size: 0.75rem; }

    .ratio-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; }
    .ratio-ok   { background: var(--success-bg); color: #065f46; }
    .ratio-warn { background: var(--warn-bg);    color: #92400e; }
    .ratio-fire { background: var(--error-bg);   color: #991b1b; }

    .cube-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; }
    .cube-vneam { background: #fee2e2; color: #991b1b; }
    .cube-zo    { background: #fef3c7; color: #92400e; }
    .cube-zoset { background: #ffedd5; color: #9a3412; }
    .cube-other { background: #e0e7ff; color: #3730a3; }

    .reason-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 500; max-width: 160px; white-space: normal; line-height: 1.3; }
    .reason-ok     { background: #dcfce7; color: #166534; }
    .reason-soft   { background: #fef9c3; color: #854d0e; }
    .reason-hard   { background: #fee2e2; color: #991b1b; }
    .reason-dead   { background: #1e293b; color: #f1f5f9; }
    .reason-unsold { background: #ede9fe; color: #5b21b6; }

    .link-cell { color: var(--primary); cursor: pointer; border-bottom: 1px dashed transparent; }
    .link-cell:hover { border-bottom-color: var(--primary); }
    .icon-btn { background: transparent; color: var(--primary); padding: 2px 7px; font-size: 0.9rem; }
    .icon-btn:hover:not(:disabled) { background: #eff6ff; transform: none; }

    .dash-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 12px; }
    .dash-kpi { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px; cursor: pointer; transition: 0.2s; position: relative; }
    .dash-kpi:hover { border-color: var(--primary); box-shadow: var(--shadow); transform: translateY(-2px); }
    .dash-kpi .dk-icon { position: absolute; top: 12px; right: 12px; font-size: 1.15rem; }
    .dash-kpi .dk-label { font-size: 0.73rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
    .dash-kpi .dk-value { font-size: 1.35rem; font-weight: 800; margin: 5px 0 3px; }
    .dash-kpi .dk-sub { font-size: 0.73rem; color: var(--text-muted); }
    .dash-kpi .dk-open { font-size: 0.68rem; color: var(--primary); margin-top: 7px; font-weight: 600; }
    .dash-kpi.dk-alert { background: #fef2f2; border-color: #fecaca; }
    .dash-kpi.dk-good { background: #f0fdf4; border-color: #bbf7d0; }

    .dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; margin-top: 14px; }
    .dash-card { background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
    .dash-card h4 { margin: 0 0 10px; font-size: 0.85rem; color: #334155; }
    .dash-chart { position: relative; height: 240px; }
    .dash-tease-row { display: flex; gap: 6px; align-items: center; padding: 6px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
    .dash-tease-row:hover { background: #eff6ff; }

    .share-bar { background: #e2e8f0; border-radius: 4px; height: 8px; width: 80px; display: inline-block; vertical-align: middle; margin-right: 6px; overflow: hidden; }
    .share-bar div { background: var(--primary); height: 8px; border-radius: 4px; }

    .crumb-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 12px; font-size: 0.85rem; }
    .crumb { background: #eff6ff; border: 1px solid #bfdbfe; color: var(--primary-hover); padding: 5px 12px; border-radius: 16px; cursor: pointer; font-weight: 600; }
    .crumb:hover { background: #dbeafe; }
    .crumb.current { background: var(--primary); border-color: var(--primary); color: #fff; cursor: default; }
    .an-codes-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border); margin-bottom: 12px; }
    .an-codes-bar input { max-width: 480px; }

    .logi-bar { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px 14px; border-radius: 10px; font-size: 0.85rem; margin-bottom: 12px; }
    .cfg-panel { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
    .cfg-item { display: flex; flex-direction: column; gap: 4px; min-width: 130px; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .chip { background: #fff; border: 1px solid var(--border); color: var(--text); padding: 7px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 500; }
    .chip:hover:not(:disabled) { background: var(--hover); color: var(--text); transform: none; }
    .chip.active { background: var(--primary); border-color: var(--primary); color: #fff; }
    .problem-card { border: 1px solid var(--border); border-left: 5px solid #94a3b8; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; background: #fff; }
    .sev-0 { border-left-color: #94a3b8; }
    .sev-1 { border-left-color: var(--warn); }
    .sev-2 { border-left-color: #f97316; }
    .sev-3 { border-left-color: var(--error); }
    .problem-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
    .problem-type { font-size: 0.72rem; font-weight: 700; background: #f1f5f9; padding: 3px 8px; border-radius: 6px; white-space: nowrap; }
    .problem-name { font-size: 0.88rem; }
    .flag-top { font-size: 0.72rem; font-weight: 700; background: var(--warn-bg); color: #92400e; padding: 2px 7px; border-radius: 4px; }
    .problem-metrics { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .pstat { background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 5px 10px; display: flex; flex-direction: column; min-width: 82px; }
    .pstat-l { color: var(--text-muted); font-size: 0.68rem; }
    .pstat-v { font-weight: 700; font-size: 0.85rem; }
    .problem-rec { padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; }
    .rec-fire { background: var(--error-bg); color: #991b1b; }
    .rec-warn { background: var(--warn-bg); color: #92400e; }
    .rec-ok   { background: var(--success-bg); color: #065f46; }
    .rec-dark { background: #1e293b; color: #f1f5f9; }
    .top-summary { font-size: 0.85rem; color: var(--text-muted); margin: 10px 0; }

    .zones-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .zone-card { border: 1px solid var(--border); border-radius: 12px; padding: 14px; background: #fff; cursor: pointer; transition: 0.2s; position: relative; min-height: 150px; }
    .zone-card:hover { border-color: var(--primary); box-shadow: var(--shadow); transform: translateY(-2px); }
    .zone-name { font-weight: 700; font-size: 0.95rem; margin-bottom: 6px; padding-right: 26px; }
    .zone-pick { position: absolute; top: 10px; right: 10px; accent-color: var(--primary); width: 16px; height: 16px; cursor: pointer; }
    .zone-kv { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); margin-top: 3px; gap: 8px; }
    .zone-kv b { color: var(--text); }
    .mega-card { border: 2px solid var(--primary); background: linear-gradient(135deg, #eff6ff, #fff); border-radius: 14px; padding: 14px; margin-bottom: 12px; cursor: pointer; transition: 0.2s; position: relative; }
    .mega-card:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
    .mega-badge { font-size: 0.68rem; font-weight: 700; background: var(--primary); color: #fff; padding: 2px 8px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }
    .mega-tools { position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; }
    .mini-zone-chip { display: inline-block; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 3px 8px; font-size: 0.72rem; margin: 2px 4px 0 0; }
    .merge-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; background: #eff6ff; border: 1px dashed var(--primary); border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; }
    .zone-form { background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 8px; }
    .zone-form textarea, #zoneAddCodes { width: 100%; min-height: 64px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: 0.85rem; resize: vertical; background: #fff; }
    .trial-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 6px 8px; border: 1px dashed var(--border); border-radius: 8px; margin-bottom: 6px; font-size: 0.8rem; background: #fff; }
    .trial-row.on { border-color: var(--primary); background: #eff6ff; }
    .zone-scroll { max-height: 44vh; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }

    .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: flex-start; justify-content: center; padding: 30px 16px; z-index: 1000; overflow-y: auto; animation: fadeIn 0.2s; }
    .modal { background: #fff; border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); width: 100%; max-width: 1020px; padding: 22px; animation: slideUp 0.25s; }
    .modal h4 { margin: 14px 0 6px; font-size: 0.9rem; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    .modal-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
    .modal-head h3 { margin: 4px 0 4px; font-size: 1.05rem; white-space: normal; }
    .modal-close { background: #f1f5f9; color: #334155; padding: 6px 12px; }
    .modal-close:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; transform: none; }
    .back-btn { background: #eff6ff; color: var(--primary); padding: 5px 10px; font-size: 0.75rem; margin-right: 8px; }
    .back-btn:hover:not(:disabled) { background: #dbeafe; color: var(--primary-hover); transform: none; }
    .breadcrumb { font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }

    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 14px 0; }
    .kpi { background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .kpi-label { font-size: 0.72rem; color: var(--text-muted); margin-bottom: 3px; }
    .kpi-value { font-size: 1.05rem; font-weight: 700; }
    .kpi-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; font-weight: 400; }
    .kpi-accent { background: #eff6ff; border-color: #bfdbfe; }
    .kpi-warn   { background: var(--warn-bg); border-color: #fde68a; }
    .kpi-warn .kpi-value { color: #92400e; }
    .kpi-danger { background: var(--error-bg); border-color: #fecaca; }
    .kpi-danger .kpi-value { color: #991b1b; }

    .alerts { margin: 10px 0; display: flex; flex-direction: column; gap: 6px; }
    .alert-item { padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; }
    .alert-warn { background: var(--warn-bg); color: #92400e; }
    .alert-fire { background: var(--error-bg); color: #991b1b; }
    .alert-dark { background: #1e293b; color: #f1f5f9; }
    .alert-ok   { background: var(--success-bg); color: #065f46; }

    .tabs { display: flex; gap: 6px; margin: 4px 0 10px; flex-wrap: wrap; }
    .tab-btn { background: #f1f5f9; color: #334155; padding: 7px 14px; }
    .tab-btn:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; transform: none; }
    .tab-btn.active { background: var(--primary); color: #fff; }
    .tab-btn.active:hover:not(:disabled) { background: var(--primary-hover); }

    .mini-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 12px; }
    .mini-table th { padding: 6px 8px; background: #f8fafc; border-bottom: 2px solid var(--border); text-align: left; }
    .mini-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
    .mini-table tr.clickable:hover td { background: #eff6ff; cursor: pointer; }

    .chart-box { position: relative; height: 280px; margin: 14px 0; }
    .dates-row { font-size: 0.78rem; color: var(--text-muted); margin-top: 8px; }
  </style>
</head>
<body>
<div class="container">
  <h1>📉 Менеджер уценки Галамарт</h1>

  <div class="card">
    <div class="controls">
      <div class="control-group">
        <label>1. Загрузите отчёт</label>
        <input type="file" id="fileInput" accept=".xlsx,.xls,.csv">
      </div>
      <div class="control-group" style="min-width: 560px; flex: 1;">
        <label>Разделы</label>
        <div class="mode-bar">
          <div class="mode-cluster">
            <span class="cluster-label">Аналитика</span>
            <div class="segmented">
              <button type="button" class="seg-btn active" data-mode="dash">📊 Дашборд</button>
              <button type="button" class="seg-btn" data-mode="analysis">🔬 Анализ</button>
              <button type="button" class="seg-btn" data-mode="top100">🏆 ТОП-100</button>
              <button type="button" class="seg-btn" data-mode="issues">🚨 Проблемы</button>
            </div>
          </div>
          <div class="mode-cluster">
            <span class="cluster-label">Уценка</span>
            <div class="segmented">
              <button type="button" class="seg-btn" data-mode="kлизма">Клизма</button>
              <button type="button" class="seg-btn" data-mode="sellto">Продать до</button>
            </div>
          </div>
          <div class="mode-cluster">
            <span class="cluster-label">Инструменты</span>
            <div class="segmented">
              <button type="button" class="seg-btn" data-mode="browse">👁 Просмотр</button>
              <button type="button" class="seg-btn" data-mode="zones">🧱 Зоны</button>
              <button type="button" class="seg-btn" data-mode="gifts">🎁 Подарки</button>
            </div>
          </div>
        </div>
      </div>
      <div class="control-group hidden" id="dateGroup">
        <label id="dateLabel">2. Дата ввоза (до)</label>
        <input type="date" id="filterDate">
      </div>
      <button id="processBtn" disabled>Обработать</button>
    </div>

    <div id="browsePanel" class="hidden">
      <div class="filters-row">
        <input type="text" id="searchInput" class="search-input" placeholder="🔎 Название или список кодов (пробел/запятая)">
        <select id="groupSel1" class="group-select" data-all="Группа 1: все"></select>
        <select id="groupSel2" class="group-select" data-all="Группа 2: все"></select>
        <select id="groupSel3" class="group-select" data-all="Группа 3: все"></select>
        <select id="cubeSel" class="cube-select" data-all="КУБ: любой"></select>
        <div class="cube-checks">
          <label class="cube-check"><input type="checkbox" class="cube-check-input" value="vneam"> ВНЕ_АМ</label>
          <label class="cube-check"><input type="checkbox" class="cube-check-input" value="zo"> ЗО</label>
          <label class="cube-check"><input type="checkbox" class="cube-check-input" value="zoset"> ЗО сеть</label>
          <span class="hint">не отмечено и КУБ «любой» = все товары</span>
        </div>
        <button id="resetFiltersBtn" class="btn-ghost" type="button">✕ Сбросить</button>
      </div>
    </div>

    <div id="status" class="status"></div>
  </div>

  <div id="dashCard" class="card hidden">
    <div class="result-header">
      <h2 id="dashTitle">📊 Дашборд магазина</h2>
      <button id="dashRefreshBtn" class="btn-ghost" type="button">↻ Обновить</button>
    </div>
    <div id="dashContent"></div>
  </div>

  <div id="analysisCard" class="card hidden">
    <div class="result-header"><h2 id="anTitle">🔬 Анализ</h2></div>
    <div class="chip-row" id="anPageChips" style="margin-bottom:8px"></div>
    <div class="an-codes-bar">
      <input type="text" id="anCodesInput" placeholder="🔎 Произвольный список кодов (через пробел/запятую) — точечный срез">
      <button id="anCodesClearBtn" class="btn-ghost" type="button">✕ Очистить</button>
      <span class="hint">коды не зависят от выбранного показателя — это быстрый срез по списку</span>
    </div>
    <div id="anContent"></div>
  </div>

  <div id="result" class="card hidden">
    <div class="result-header">
      <h2 id="resultTitle">Результаты</h2>
      <button class="btn-export" id="exportBtn">⬇️ Выгрузить в Excel</button>
    </div>
    <div id="mdTotals" class="md-totals hidden"></div>
    <div class="table-wrapper">
      <table id="dataTable" class="sortable">
        <thead></thead>
        <tbody id="tableBody"></tbody>
      </table>
    </div>
  </div>

  <div id="topCard" class="card hidden">
    <div class="result-header"><h2 id="topTitle">🏆 ТОП-100</h2></div>
    <div id="topContent"></div>
  </div>

  <div id="issuesCard" class="card hidden">
    <div class="result-header"><h2 id="issuesTitle">🚨 Проблемы</h2></div>
    <div id="issuesContent"></div>
  </div>

  <div id="zonesCard" class="card hidden">
    <div class="result-header">
      <h2 id="zonesTitle">🧱 Коммерческие зоны</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="addZoneBtn" type="button">➕ Новая зона</button>
        <button id="saveZonesBtn" type="button" class="btn-export">💾 Сохранить в файл</button>
        <button id="loadZonesBtn" type="button" class="btn-ghost">📂 Загрузить из файла</button>
        <input type="file" id="zonesFileInput" accept=".json,application/json" class="hidden">
      </div>
    </div>
    <div id="zonesContent"></div>
  </div>

  <div id="giftsCard" class="card hidden">
    <div class="result-header"><h2 id="giftsTitle">🎁 Выбор подарка</h2></div>
    <div class="filters-row" style="margin-top:0;padding-top:0;border-top:none">
      <div class="control-group" style="min-width:150px">
        <label>Лимит по себестоимости, ₽</label>
        <input type="number" id="giftLimit" min="0" step="1" value="150">
      </div>
      <select id="giftSel1" class="group-select" data-all="Весь магазин"></select>
      <select id="giftSel2" class="group-select" data-all="Группа 2: все"></select>
      <select id="giftSel3" class="group-select" data-all="Группа 3: все"></select>
      <label class="cube-check"><input type="checkbox" id="giftInStock" checked> только со стоком</label>
      <span class="hint">показаны товары группы с себестоимостью не выше лимита</span>
    </div>
    <div id="giftsSummary" style="margin-top:12px"></div>
    <div id="giftsContent" style="margin-top:10px"></div>
  </div>
</div>

<div id="modalOverlay" class="modal-overlay hidden">
  <div class="modal" id="modalBox"></div>
</div>

<!-- Библиотеки локально (скачать и положить в папку lib/) -->
<script src="lib/xlsx.full.min.js"></script>
<script src="lib/chart.umd.min.js"></script>

<!-- Модули приложения -->
<script src="js/core.js"></script>
<script src="js/markdown.js"></script>
<script src="js/browse.js"></script>
<script src="js/problems.js"></script>
<script src="js/dashboard.js"></script>
<script src="js/analysis.js"></script>
<script src="js/top100.js"></script>
<script src="js/cards.js"></script>
<script src="js/zones-gifts.js"></script>
<script src="js/app.js"></script>
</body>
</html>
```

---

**`js/core.js`**

```js
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
const issuesCard      = document.getElementById('issuesCard');
const issuesTitle     = document.getElementById('issuesTitle');
const issuesContent   = document.getElementById('issuesContent');
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
let currentMode = 'dash';
let browseData = null;
let currentGroupPath = null;
let currentGroupItems = [];
let currentGroupTab = 'to';
let topMetric = 'to';
let topCodesValue = '';
let issueFilter = 'all';
let issueCfgOpen = false;
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
const DEFAULT_CFG = { orderDay: 5, deliveryDay: 4, safetyDays: 7, overDays: 90 };
function loadCfg() {
  try { return Object.assign({}, DEFAULT_CFG, JSON.parse(localStorage.getItem('galamart_cfg') || '{}')); }
  catch (e) { return Object.assign({}, DEFAULT_CFG); }
}
let cfg = loadCfg();
function saveCfg() { try { localStorage.setItem('galamart_cfg', JSON.stringify(cfg)); } catch (e) {} }
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
  const fileOk = fileInput.files.length && rawData.length > 0;
  const needDate = currentMode === 'kлизма' || currentMode === 'sellto';
  const filterOk = needDate ? !!filterDateInput.value : true;
  processBtn.disabled = !(fileOk && filterOk);
}
function escapeHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function truncateStr(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n-1) + '…' : s; }
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g,'').replace('%','').replace(',','.'));
  return isFinite(n) ? n : 0;
}
function fmt(n, d = 0) { return (Math.round(n * 10**d) / 10**d).toLocaleString('ru-RU', { maximumFractionDigits: d }); }
function fmtDays(d) { if (!isFinite(d)) return '∞'; if (d < 1) return '<1'; return String(Math.round(d)); }
function splitTokens(v) { return String(v || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean); }
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(1899, 11, 30);
    d.setDate(d.getDate() + val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    let d = new Date(val);
    if (isNaN(d.getTime())) {
      const p = val.split(/[\.\/-]/);
      if (p.length === 3) d = new Date(`${p[2]}-${p[1]}-${p[0]}`);
    }
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function fmtDate(val) { const d = parseDate(val); return d ? d.toLocaleDateString('ru-RU') : '—'; }
function roundTo9(price) { const r = Math.floor((price - 9) / 10) * 10 + 9; return Math.max(1, r); }
function genId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── КУБЫ ──
const CUBE_KEY = { 'ВНЕ_АМ': 'vneam', 'ЗО': 'zo', 'ЗО сеть': 'zoset' };
const CUBE_LABEL_BY_KEY = { vneam: 'ВНЕ_АМ', zo: 'ЗО', zoset: 'ЗО сеть' };
function cubeKind(val) {
  const v = String(val ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('вне_ам')) return 'ВНЕ_АМ';
  if (v === 'зо') return 'ЗО';
  if (v === 'зо сеть') return 'ЗО сеть';
  return null;
}
function cubeBadge(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '—';
  const k = cubeKind(v);
  const cls = k === 'ВНЕ_АМ' ? 'cube-vneam' : k === 'ЗО' ? 'cube-zo' : k === 'ЗО сеть' ? 'cube-zoset' : 'cube-other';
  return `<span class="cube-badge ${cls}">${escapeHtml(v)}</span>`;
}

// ── Продажи и сток ──
function dailyRate(r) {
  const stock = num(r['склад кол']), od = num(r['остатки, дней']), sold = num(r['продано (шт)']);
  if (od > 0 && od < 9999 && stock > 0) return stock / od;
  const imp = parseDate(r['дата ввоза']);
  if (imp && sold > 0) {
    const days = Math.max(1, Math.round((Date.now() - imp.getTime()) / 86400000));
    return sold / days;
  }
  return 0;
}
function stockDaysLeft(r) {
  const od = num(r['остатки, дней']), stock = num(r['склад кол']);
  if (od >= 9999) return { days: Infinity };
  if (od > 0) return { days: od };
  if (stock <= 0) return { days: 0 };
  const rate = dailyRate(r);
  return rate > 0 ? { days: stock / rate, approx: true } : { days: Infinity };
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
  const a = { sku: 0, stock: 0, stockSum: 0, sold: 0, to: 0, toss: 0, rate: 0, deadSum: 0, deadCount: 0 };
  rows.forEach(r => {
    a.sku++;
    const st = num(r['склад кол']); a.stock += st;
    const sSum = num(r['склад сумма, руб.']) || st * num(r['себ, руб.']);
    a.stockSum += sSum;
    a.sold += num(r['продано (шт)']);
    a.to += num(r['то, руб']); a.toss += num(r['то сс, руб']);
    const rate = dailyRate(r);
    a.rate += rate;
    if (st > 0 && num(r['продано (шт)']) === 0 && rate === 0) { a.deadCount++; a.deadSum += sSum; }
  });
  a.gp = a.to - a.toss;
  a.margin = a.to > 0 ? a.gp / a.to * 100 : 0;
  a.markup = a.toss > 0 ? a.gp / a.toss * 100 : 0;
  a.turnover = a.rate > 0 ? a.stock / a.rate : Infinity;
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
function isDeadRow(r) { return num(r['склад кол']) > 0 && num(r['продано (шт)']) === 0 && dailyRate(r) === 0; }
function itemFrozen(r) { return num(r['склад сумма, руб.']) || num(r['склад кол']) * num(r['себ, руб.']); }
function itemAgeDays(r) { const imp = parseDate(r['дата ввоза']); return imp ? Math.floor((Date.now() - imp.getTime()) / 86400000) : null; }
function itemMarkup(r) { const c = num(r['себ, руб.']); if (c <= 0) return null; return (num(r['цена маг, руб.']) - c) / c * 100; }
function scopeMarkupStock(scope) {
  let n = 0, d = 0;
  scope.forEach(r => { const st = num(r['склад кол']); if (st > 0) { const c = num(r['себ, руб.']); if (c > 0) { n += (num(r['цена маг, руб.']) - c) * st; d += c * st; } } });
  return d > 0 ? n / d * 100 : 0;
}

// ── Навигация ──
function hideAllPages() {
  resultEl.classList.add('hidden');
  dashCard.classList.add('hidden');
  analysisCard.classList.add('hidden');
  topCard.classList.add('hidden');
  issuesCard.classList.add('hidden');
  zonesCard.classList.add('hidden');
  giftsCard.classList.add('hidden');
}
function switchMode(mode) {
  const b = document.querySelector(`.seg-btn[data-mode="${mode}"]`);
  if (b) b.click();
}
function jumpToIssues(key) { issueFilter = key; switchMode('issues'); }

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
fileInput.addEventListener('change', () => {
  rawData = []; browseData = null; analogCache = null;
  hideAllPages(); updateBtn();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showStatus('Чтение структуры...', 'success');
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb   = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true, defval: '' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', range: 0 });
      if (rows.length < 4) throw new Error('Файл пуст или повреждён');

      const rawHeaders = rows[2].map(h => String(h).trim().toLowerCase().replace(/\s+/g, ' '));
      const canonBySig = new Map(CANON_HEADERS.map(c => [headerSig(c), c]));
      const headerMap = {};
      rawHeaders.forEach((h, i) => {
        const canon = canonBySig.get(headerSig(h));
        if (canon !== undefined) headerMap[i] = canon;
      });

      const foundCanon = new Set(Object.values(headerMap));
      const missing = REQUIRED_HEADERS.filter(r => !foundCanon.has(r));
      if (missing.length) throw new Error(`Не найдены колонки:\n${missing.join(', ')}\nПроверьте структуру файла.`);

      rawData = rows.slice(3).map(r => {
        const obj = {};
        for (const [i, canon] of Object.entries(headerMap)) obj[canon] = r[i] ?? '';
        return obj;
      });
      codeIndex = new Map();
      rawData.forEach(r => {
        const c = String(r['код'] ?? '').trim();
        if (c && !codeIndex.has(c)) codeIndex.set(c, r);
      });
      hideAllPages();
      if (currentMode === 'dash') renderDashboard();
      else if (currentMode === 'zones') renderZones();
      else if (currentMode === 'analysis') renderAnalysis();
      else if (currentMode === 'gifts') renderGifts();
      showStatus(`✅ Загружено: ${rawData.length.toLocaleString('ru-RU')} строк.`, 'success');
      updateBtn();
    } catch (err) { showStatus('❌ ' + err.message, 'error'); rawData = []; }
  };
  reader.readAsArrayBuffer(file);
});
```

---

**`js/markdown.js`**

```js
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
      const reason     = getPriceReason(curPrice, stockDays, daysLeft);
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
exportBtn.addEventListener('click', () => {
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
```

---

**`js/browse.js`**

```js
/* ══════════════════════════════════════════════════════════════
   browse.js — режим «Просмотр»: фильтры, поиск по списку кодов
   ══════════════════════════════════════════════════════════════ */

let searchTimer = null;
searchInput.addEventListener('input', () => {
  if (currentMode !== 'browse' || !browseData) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyBrowse, 150);
});
[groupSel1, groupSel2, groupSel3].forEach(sel => {
  sel.addEventListener('change', () => {
    if (currentMode !== 'browse' || !browseData) return;
    rebuildGroupOptions();
    applyBrowse();
  });
});
cubeSel.addEventListener('change', () => { if (currentMode === 'browse' && browseData) applyBrowse(); });
document.querySelectorAll('.cube-check-input').forEach(cb => {
  cb.addEventListener('change', () => { if (currentMode === 'browse' && browseData) applyBrowse(); });
});
resetFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  groupSel1.value = ''; groupSel2.value = ''; groupSel3.value = '';
  cubeSel.value = '';
  document.querySelectorAll('.cube-check-input').forEach(c => c.checked = false);
  rebuildGroupOptions();
  applyBrowse();
});

function rebuildGroupOptions() {
  if (!browseData) return;
  const uniq = (arr, key) => [...new Set(arr.map(r => String(r[key] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const fillSelect = (sel, vals) => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">${sel.dataset.all || 'все'}</option>` +
      vals.map(v => `<option value="${escapeHtml(v)}"${v === cur ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('');
  };
  fillSelect(groupSel1, uniq(browseData, 'группа 1'));
  let pool = browseData;
  if (groupSel1.value) pool = pool.filter(r => String(r['группа 1'] ?? '').trim() === groupSel1.value);
  fillSelect(groupSel2, uniq(pool, 'группа 2'));
  if (groupSel2.value) pool = pool.filter(r => String(r['группа 2'] ?? '').trim() === groupSel2.value);
  fillSelect(groupSel3, uniq(pool, 'группа 3'));
  fillSelect(cubeSel, uniq(browseData, 'кубы'));
}

function getBrowseFiltered() {
  const tokens = splitTokens(searchInput.value);
  const g1 = groupSel1.value, g2 = groupSel2.value, g3 = groupSel3.value;
  const exactCube = cubeSel.value.trim();
  const checks = new Set([...document.querySelectorAll('.cube-check-input:checked')].map(c => c.value));
  return browseData.filter(r => {
    if (g1 && String(r['группа 1'] ?? '').trim() !== g1) return false;
    if (g2 && String(r['группа 2'] ?? '').trim() !== g2) return false;
    if (g3 && String(r['группа 3'] ?? '').trim() !== g3) return false;
    const cubeVal = String(r['кубы'] ?? '').trim();
    if (exactCube && cubeVal !== exactCube) return false;
    if (checks.size) {
      const k = cubeKind(cubeVal);
      if (!k || !checks.has(CUBE_KEY[k])) return false;
    }
    if (tokens.length) {
      const code = String(r['код'] ?? '').toLowerCase();
      const name = String(r['товар'] ?? '').toLowerCase();
      if (!tokens.some(t => code.includes(t) || name.includes(t))) return false;
    }
    return true;
  });
}

function applyBrowse() {
  if (!browseData) return;
  const filtered = getBrowseFiltered();
  renderTable(filtered.slice(0, BROWSE_LIMIT), 'browse', 0);
  resultEl.classList.remove('hidden');
  const parts = [];
  const checked = [...document.querySelectorAll('.cube-check-input:checked')].map(c => CUBE_LABEL_BY_KEY[c.value]);
  if (checked.length) parts.push('КУБЫ: ' + checked.join(' + '));
  if (cubeSel.value) parts.push('КУБ: ' + cubeSel.value);
  const g = [groupSel1.value, groupSel2.value, groupSel3.value].filter(Boolean);
  if (g.length) parts.push(g.join(' / '));
  const q = searchInput.value.trim();
  if (q) parts.push(`поиск: «${q}»`);
  const suffix = parts.length ? ` (${parts.join(' · ')})` : '';
  const capped = filtered.length > BROWSE_LIMIT ? ` · показаны первые ${BROWSE_LIMIT}` : '';
  resultTitle.textContent = `Просмотр${suffix} — ${filtered.length.toLocaleString('ru-RU')} артикулов${capped}`;
  if (!filtered.length) showStatus('⚠️ Ничего не найдено — ослабьте фильтры.', 'error');
  else showStatus(`✅ Просмотр: ${filtered.length.toLocaleString('ru-RU')} артикулов.`, 'success');
}
```

---

**`js/problems.js`**

```js
/* ══════════════════════════════════════════════════════════════
   problems.js — панель «Проблемы»
   ══════════════════════════════════════════════════════════════ */

const ISSUE_TYPES = [
  { key: 'oos',       icon: '🚫', label: 'Обнуление стока',  desc: 'сток пуст при живых продажах' },
  { key: 'shortage',  icon: '📦', label: 'Дефицит · заказ',  desc: 'стока не хватит до поставки' },
  { key: 'dead',      icon: '🧊', label: 'Залежавшийся',     desc: 'нет продаж 14+ дней' },
  { key: 'over',      icon: '🏔', label: 'Затоваривание',    desc: 'запас выше порога' },
  { key: 'riskvneam', icon: '⚠️', label: 'Рискованный топ ВНЕ_АМ', desc: 'внематричный топ' }
];
const SORTS = {
  oos: (a, b) => b.toRub - a.toRub,
  shortage: (a, b) => (b.lvl - a.lvl) || a.daysLeft - b.daysLeft || b.toRub - a.toRub,
  dead: (a, b) => b.frozen - a.frozen,
  over: (a, b) => b.frozen - a.frozen,
  riskvneam: (a, b) => b.toRub - a.toRub
};

function getAnalogIndex() {
  if (analogCache) return analogCache;
  const g3 = new Map(), g2 = new Map(), g1 = new Map();
  rawData.forEach(r => {
    const ck = cubeKind(r['кубы']);
    if (ck === 'ЗО' || ck === 'ЗО сеть') return;
    if (num(r['склад кол']) <= 0) return;
    const to = num(r['то, руб']);
    if (to <= 0) return;
    const put = (map, key) => {
      if (!key) return;
      const cur = map.get(key);
      if (!cur || to > num(cur['то, руб'])) map.set(key, r);
    };
    put(g3, String(r['группа 3'] ?? '').trim());
    put(g2, String(r['группа 2'] ?? '').trim());
    put(g1, String(r['группа 1'] ?? '').trim());
  });
  analogCache = { g3, g2, g1 };
  return analogCache;
}
function findAnalog(r) {
  const idx = getAnalogIndex();
  const g3 = String(r['группа 3'] ?? '').trim(), g2 = String(r['группа 2'] ?? '').trim(), g1 = String(r['группа 1'] ?? '').trim();
  let c = (g3 && idx.g3.get(g3)) || (g2 && idx.g2.get(g2)) || (g1 && idx.g1.get(g1)) || null;
  if (c && String(c['код'] ?? '').trim() === String(r['код'] ?? '').trim()) c = null;
  return c ? { code: String(c['код'] ?? '').trim(), name: String(c['товар'] ?? ''), r: c } : null;
}

function buildProblems(log) {
  const horizon = log.arrivalIn + 7 + cfg.safetyDays;
  const topSet = new Set(
    [...rawData].sort((a, b) => num(b['то, руб']) - num(a['то, руб'])).slice(0, 100)
      .map(r => String(r['код'] ?? '').trim())
  );
  const problems = [];
  const now = Date.now();

  rawData.forEach(r => {
    const code = String(r['код'] ?? '').trim();
    const stock = num(r['склад кол']), sold = num(r['продано (шт)']);
    const toRub = num(r['то, руб']), cost = num(r['себ, руб.']);
    const rate = dailyRate(r), sdl = stockDaysLeft(r);
    const ck = cubeKind(r['кубы']);
    const frozen = num(r['склад сумма, руб.']) || stock * cost;
    const isTop = topSet.has(code);
    const transit = num(r['ост. трансф. + резерв (шт)']);
    const imp = parseDate(r['дата ввоза']);
    const ageDays = imp ? Math.floor((now - imp.getTime()) / 86400000) : null;

    if (stock <= 0 && sold > 0) {
      problems.push({ type: 'oos', lvl: 3, r, code, rate, toRub, transit, ck, isTop });
      return;
    }
    if (stock > 0 && rate > 0 && isFinite(sdl.days) && sdl.days < horizon) {
      const lvl = sdl.days < log.arrivalIn ? 3 : sdl.days < log.arrivalIn + 7 ? 2 : 1;
      const orderQty = Math.max(0, Math.ceil(rate * (log.arrivalIn + 7 + cfg.safetyDays) - stock));
      problems.push({ type: 'shortage', lvl, r, code, rate, toRub, ck, isTop, transit, daysLeft: sdl.days, orderQty });
      return;
    }
    if (isTop && ck === 'ВНЕ_АМ') {
      problems.push({ type: 'riskvneam', lvl: 2, r, code, toRub, stock, daysLeft: sdl.days, frozen, ck, isTop });
      return;
    }
    if (stock > 0 && sold === 0 && rate === 0 && (ageDays === null || ageDays >= 14)) {
      problems.push({ type: 'dead', lvl: 0, r, code, stock, frozen, ck, isTop, ageDays });
      return;
    }
    if (stock > 0 && rate > 0 && isFinite(sdl.days) && sdl.days > cfg.overDays) {
      problems.push({ type: 'over', lvl: 1, r, code, rate, toRub, ck, isTop, frozen, daysLeft: sdl.days });
      return;
    }
  });
  return problems;
}

function analogHtml(an) {
  if (!an) return ' Аналог не найден в группе.';
  return ` Аналог: <b class="link-cell" data-open-product data-code="${escapeHtml(an.code)}">${escapeHtml(an.code)} · ${escapeHtml(truncateStr(an.name, 50))}</b> (топ по ТО в этой группе, не ЗО, в наличии).`;
}

function problemRec(p, log) {
  const zoBlocked = p.ck === 'ЗО' || p.ck === 'ЗО сеть';
  const coverDays = log.arrivalIn + 7 + cfg.safetyDays;
  const whenOrder = log.dOrd === 0 ? 'сегодня' : `${WD[cfg.orderDay].toLowerCase()} ${fmtDate(log.orderDate)}`;

  if (p.type === 'oos') {
    if (zoBlocked) return { cls: 'rec-dark', html: `⛔ ЗО — отгрузки запрещены, заказать нельзя, но позиция топовая и теряет продажи.${analogHtml(findAnalog(p.r))}` };
    const qty = Math.max(1, Math.ceil(p.rate * coverDays));
    return { cls: 'rec-fire', html: `⚡ Позиция теряет продажи каждый день. Заказ ~<b>${qty} шт</b> ${whenOrder} → поставка ${fmtDate(log.arrivalDate)}.${p.transit > 0 ? ` Транзит/резерв: ${fmt(p.transit)} шт.` : ''}` };
  }
  if (p.type === 'shortage') {
    if (zoBlocked) return { cls: 'rec-dark', html: `⛔ ЗО — заказать нельзя, а сток уходит (~${fmtDays(p.daysLeft)} дн.).${analogHtml(findAnalog(p.r))}` };
    if (p.lvl === 3) {
      const gap = Math.max(1, Math.ceil(log.arrivalIn - p.daysLeft));
      return { cls: 'rec-fire', html: `🔴 Не успеет даже при срочном заказе: разрыв ~<b>${gap} дн.</b> (поставка только ${fmtDate(log.arrivalDate)}). Заказ ~<b>${p.orderQty} шт</b> + подумай над трансфером из другого магазина.` };
    }
    if (p.lvl === 2) return { cls: 'rec-warn', html: `🟠 Заказывать в ближайший заказ (${whenOrder}): ~<b>${p.orderQty} шт</b>. Поставка ${fmtDate(log.arrivalDate)}. Текущего стока хватит на ~${fmtDays(p.daysLeft)} дн.` };
    return { cls: 'rec-ok', html: `🟡 Плановый заказ: стока на ~${fmtDays(p.daysLeft)} дн. Ближайшее окно — ${whenOrder}, объём ~${p.orderQty} шт.` };
  }
  if (p.type === 'dead') return { cls: 'rec-dark', html: `🧊 Нет продаж${p.ageDays != null ? ` ${p.ageDays} дн.` : ''}, заморожено ≈ <b>${fmt(p.frozen)} ₽</b>. Проверить выкладку/цену или отправить в уценку.` };
  if (p.type === 'over') return { cls: 'rec-warn', html: `🏔 Стока на ~${fmtDays(p.daysLeft)} дн. (порог ${cfg.overDays}). Заморожено ≈ <b>${fmt(p.frozen)} ₽</b> — рассмотреть уценку или промо.` };
  return { cls: 'rec-warn', html: `⚠️ Внематричный товар в ТОП-100 (ТО ${fmt(p.toRub)} ₽). Риск перебоев/вывода. Решение: ввод в матрицу или обеспечение запаса.` };
}

function problemCard(p, log) {
  const meta = ISSUE_TYPES.find(t => t.key === p.type);
  const stat = (l, v) => `<div class="pstat"><span class="pstat-l">${l}</span><span class="pstat-v">${v}</span></div>`;
  const stats = [];
  stats.push(stat('Склад', p.type === 'oos' ? '0 шт' : fmt(num(p.r['склад кол'])) + ' шт'));
  if (p.rate > 0) stats.push(stat('Скорость', p.rate.toFixed(2) + ' шт/д'));
  if (p.daysLeft !== undefined) stats.push(stat('Хватит на', isFinite(p.daysLeft) ? fmtDays(p.daysLeft) + ' дн.' : '∞'));
  if (p.toRub) stats.push(stat('ТО', fmt(p.toRub) + ' ₽'));
  if (p.frozen) stats.push(stat('Заморожено', fmt(p.frozen) + ' ₽'));
  if (p.ageDays != null && p.type === 'dead') stats.push(stat('Без продаж', p.ageDays + ' дн.'));
  if (p.transit > 0) stats.push(stat('Транзит/резерв', fmt(p.transit) + ' шт'));
  if (p.type === 'shortage' && p.orderQty > 0) stats.push(stat('Заказ', '~' + p.orderQty + ' шт'));

  const rec = problemRec(p, log);
  const g1 = String(p.r['группа 1'] ?? '').trim();
  return `<div class="problem-card sev-${p.lvl}">
    <div class="problem-head">
      <span class="problem-type">${meta.icon} ${meta.label}</span>
      <span class="problem-name link-cell" data-open-product data-code="${escapeHtml(p.code)}"><b>${escapeHtml(p.code)}</b> — ${escapeHtml(truncateStr(p.r['товар'], 70))}</span>
      ${p.isTop ? '<span class="flag-top">🏆 ТОП-100</span>' : ''}
      ${cubeBadge(p.r['кубы'])}
      <span class="text-muted" style="margin-left:auto;font-size:.75rem">${escapeHtml(g1)}</span>
    </div>
    <div class="problem-metrics">${stats.join('')}</div>
    <div class="problem-rec ${rec.cls}">${rec.html}</div>
  </div>`;
}

function cfgPanelHtml() {
  const dayOpts = (selVal) => [1, 2, 3, 4, 5, 6, 0].map(d =>
    `<option value="${d}"${d === selVal ? ' selected' : ''}>${WD[d]}</option>`).join('');
  const log = getLogistics(cfg);
  return `<div class="cfg-panel">
    <div class="cfg-item"><label>День заказа</label><select id="cfgOrderDay">${dayOpts(cfg.orderDay)}</select></div>
    <div class="cfg-item"><label>День поставки</label><select id="cfgDeliveryDay">${dayOpts(cfg.deliveryDay)}</select></div>
    <div class="cfg-item"><label>Страховой запас, дн.</label><input type="number" id="cfgSafetyDays" min="0" max="30" value="${cfg.safetyDays}"></div>
    <div class="cfg-item"><label>Порог затоваривания, дн.</label><input type="number" id="cfgOverDays" min="30" max="365" value="${cfg.overDays}"></div>
    <div class="hint">Схема: заказ в ${WD[cfg.orderDay]} → поставка через ${log.lag} дн. (${WD[cfg.deliveryDay]}) → цикл 7 дн. Параметры сохраняются в браузере.</div>
  </div>`;
}

function renderIssues() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  const log = getLogistics(cfg);
  const all = buildProblems(log);

  const counts = { all: all.length };
  ISSUE_TYPES.forEach(t => counts[t.key] = all.filter(p => p.type === t.key).length);

  let list;
  if (issueFilter === 'all') {
    list = ISSUE_TYPES.flatMap(t => all.filter(p => p.type === t.key).sort(SORTS[t.key]));
  } else {
    list = all.filter(p => p.type === issueFilter).sort(SORTS[issueFilter]);
  }
  const shown = list.slice(0, ISSUES_LIMIT);

  const orderNote = log.dOrd === 0 ? ' — <b class="fire-text">сегодня!</b>' : ` через ${log.dOrd} дн.`;
  const timeline = `
    <div class="logi-bar">
      <span>📅 Сегодня: <b>${fmtDate(log.today)} (${WD[log.dow].toLowerCase()})</b></span>
      <span>🛒 Ближайший заказ: <b>${fmtDate(log.orderDate)} (${WD[cfg.orderDay].toLowerCase()})</b>${orderNote}</span>
      <span>🚚 Поставка при заказе сейчас: <b>${fmtDate(log.arrivalDate)}</b> (через ${log.arrivalIn} дн.)</span>
      <span>🛡 Страховой запас: <b>${cfg.safetyDays} дн.</b></span>
      <button class="btn-ghost" type="button" id="issueCfgToggle" style="margin-left:auto">⚙ Параметры логистики</button>
    </div>
    ${issueCfgOpen ? cfgPanelHtml() : ''}
  `;

  const chips = [`<button type="button" class="chip ${issueFilter === 'all' ? 'active' : ''}" data-issue-filter="all">Все (${counts.all})</button>`]
    .concat(ISSUE_TYPES.map(t =>
      `<button type="button" class="chip ${issueFilter === t.key ? 'active' : ''}" data-issue-filter="${t.key}">${t.icon} ${t.label} (${counts[t.key] || 0})</button>`))
    .join('');

  const cards = shown.length
    ? shown.map(p => problemCard(p, log)).join('')
    : '<div class="alert-item alert-ok">🎉 По этому типу проблем нет.</div>';
  const capNote = list.length > ISSUES_LIMIT ? `<div class="hint" style="margin-top:8px">Показаны первые ${ISSUES_LIMIT} из ${list.length}. Уточните фильтр типа.</div>` : '';

  issuesTitle.textContent = `🚨 Проблемы — ${counts.all} позиций требуют внимания`;
  issuesContent.innerHTML = timeline + `<div class="chip-row">${chips}</div>` + cards + capNote;
  issuesCard.classList.remove('hidden');
  showStatus(`✅ Проблем найдено: ${counts.all}.\n` + ISSUE_TYPES.map(t => `${t.icon} ${t.label}: ${counts[t.key] || 0}`).join(' · '), 'success');
}

issuesCard.addEventListener('click', e => {
  const chip = e.target.closest('[data-issue-filter]');
  if (chip) { issueFilter = chip.dataset.issueFilter; renderIssues(); return; }
  if (e.target.closest('#issueCfgToggle')) { issueCfgOpen = !issueCfgOpen; renderIssues(); return; }
  const p = e.target.closest('[data-open-product]');
  if (p) { openProduct(p.dataset.code, null); return; }
  const g = e.target.closest('[data-open-group]');
  if (g) openGroup(g.dataset.g1 || '', g.dataset.g2 || '', g.dataset.g3 || '');
});

issuesCard.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'cfgOrderDay')    { cfg.orderDay = +t.value;    saveCfg(); renderIssues(); }
  if (t.id === 'cfgDeliveryDay') { cfg.deliveryDay = +t.value; saveCfg(); renderIssues(); }
  if (t.id === 'cfgSafetyDays')  { cfg.safetyDays = Math.max(0, Math.min(30, +t.value || 0)); saveCfg(); renderIssues(); }
  if (t.id === 'cfgOverDays')    { cfg.overDays = Math.max(30, Math.min(365, +t.value || 90)); saveCfg(); renderIssues(); }
});
```

---

**`js/dashboard.js`**

```js
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

  const tease = [...problems].sort((a, b) => (b.lvl - a.lvl) || ((b.toRub || 0) - (a.toRub || 0))).slice(0, 5);
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
      datasets: [{ data: ISSUE_TYPES.map(t => problems.filter(p => p.type === t.key).length), backgroundColor: ['#ef4444', '#f97316', '#64748b', '#f59e0b', '#8b5cf6'], borderRadius: 4 }]
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
function drillShell(title, sub, tilesHtml, bodyHtml, pageKey) {
  modalBox.innerHTML = `
    <div class="modal-head">
      <div style="min-width:0">
        <div class="breadcrumb">📊 Дашборд · детализация</div>
        <h3>${title}</h3>
        <div class="text-muted">${sub}</div>
      </div>
      <div style="display:flex;gap:6px">
        ${pageKey ? `<button type="button" data-an-page-jump="${pageKey}">🔬 Полная страница →</button>` : ''}
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
```

---

**`js/analysis.js`**

```js
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
```

---

**`js/top100.js`**

```js
/* ══════════════════════════════════════════════════════════════
   top100.js — ТОП-100 магазина
   ══════════════════════════════════════════════════════════════ */

function renderTop100() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  const metricFn = METRIC_FNS[topMetric];
  const sorted = [...rawData].sort((a, b) => metricFn(b) - metricFn(a));
  let tops = sorted.slice(0, 100);

  const tokens = splitTokens(topCodesValue);
  if (tokens.length) {
    tops = tops.filter(r => {
      const code = String(r['код'] ?? '').toLowerCase();
      const name = String(r['товар'] ?? '').toLowerCase();
      return tokens.some(t => code.includes(t) || name.includes(t));
    });
  }

  const totalAll = rawData.reduce((s, r) => s + num(r['то, руб']), 0);
  const totalTop = tops.reduce((s, r) => s + num(r['то, руб']), 0);
  const share = totalAll > 0 ? (totalTop / totalAll * 100).toFixed(1) : '—';
  const unit = topMetric === 'qty' ? ' шт' : ' ₽';

  topTitle.textContent = `🏆 ТОП-100 магазина — ${METRIC_TITLES[topMetric]}`;

  const tabs = ['to', 'qty', 'gp'].map(k =>
    `<button type="button" class="tab-btn ${k === topMetric ? 'active' : ''}" data-top-metric="${k}">${METRIC_TAB_LABELS[k]}</button>`).join('');

  const rowsHtml = tops.map((r, i) => {
    const code = String(r['код'] ?? '').trim();
    const stock = num(r['склад кол']);
    const mk = rowGpMarkup(r);
    const flags = [
      stock <= 0 ? '🚫' : (isFinite(stockDaysLeft(r).days) && stockDaysLeft(r).days <= 14 ? '⏳' : ''),
      cubeKind(r['кубы']) ? '🏷' : ''
    ].filter(Boolean).join(' ');
    return `<tr>
      <td>${i + 1}</td>
      <td><span class="link-cell" data-open-product data-code="${escapeHtml(code)}">${escapeHtml(code)}</span></td>
      <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 60))}</td>
      <td>${escapeHtml(String(r['группа 1'] ?? '').trim() || '—')}</td>
      <td>${cubeBadge(r['кубы'])}</td>
      <td>${fmt(stock)}</td>
      <td>${daysBadgeR(r)}</td>
      <td style="font-weight:700">${fmt(metricFn(r))}${unit}</td>
      <td class="${rowGp(r) < 0 ? 'fire-text' : ''}">${fmt(rowGp(r))} ₽</td>
      <td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td>
      <td>${flags || '—'}</td>
    </tr>`;
  }).join('');

  topContent.innerHTML = `
    <div class="tabs">${tabs}</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px">
      <input type="text" id="topCodesFilter" class="search-input" style="max-width:360px" placeholder="🔎 Фильтр по списку кодов (пробел/запятая)" value="${escapeHtml(topCodesValue)}">
      ${tokens.length ? '<span class="hint">фильтр активен — показано ' + tops.length + ' из топ-100</span>' : ''}
    </div>
    <div class="top-summary">ТОП-100 даёт <b>${fmt(totalTop)} ₽</b> ТО — это <b>${share}%</b> всего ТО магазина (${fmt(totalAll)} ₽). 🚫 сток пуст · ⏳ стока ≤ 14 дн. · 🏷 проблемный КУБ.</div>
    <div class="table-wrapper" style="max-height:60vh">
      <table class="sortable">
        <thead><tr><th>№</th><th>Код</th><th>Товар</th><th>Группа 1</th><th>КУБЫ</th><th>Склад</th><th>Ост. дней</th><th>${METRIC_TITLES[topMetric]}</th><th>ВП</th><th>Наценка</th><th>Флаги</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="11">Ничего не найдено по фильтру</td></tr>'}</tbody>
      </table>
    </div>
  `;
  const tf = document.getElementById('topCodesFilter');
  if (tf) {
    tf.addEventListener('input', () => {
      topCodesValue = tf.value;
      clearTimeout(tf._t);
      tf._t = setTimeout(renderTop100, 200);
    });
  }
  topCard.classList.remove('hidden');
  showStatus(`✅ ТОП-100 рассчитан по метрике «${METRIC_TITLES[topMetric]}».`, 'success');
}

topCard.addEventListener('click', e => {
  const t = e.target.closest('[data-top-metric]');
  if (t) { topMetric = t.dataset.topMetric; renderTop100(); return; }
  const p = e.target.closest('[data-open-product]');
  if (p) openProduct(p.dataset.code, null);
});
```

---

**`js/cards.js`**

```js
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
```

---

**`js/zones-gifts.js`**

```js
/* ══════════════════════════════════════════════════════════════
   zones-gifts.js — коммерческие зоны, мега-зоны, подарки
   ══════════════════════════════════════════════════════════════ */

// ── Состояние зон ──
let zones = [];
let megas = [];
let zoneSel = new Set();
let zoneFormOpen = false;
let openZoneId = null;
let trialCodes = [];
let trialGroupVal = '';

function persistZones() { try { localStorage.setItem('galamart_zones', JSON.stringify({ zones, megas })); } catch (e) {} }
function loadZonesLS() {
  try {
    const d = JSON.parse(localStorage.getItem('galamart_zones') || 'null');
    if (d) { zones = d.zones || []; megas = d.megas || []; }
  } catch (e) {}
}
loadZonesLS();

// ── Аналитика зоны ──
function zoneStats(codesArr) {
  const seen = new Set(); const rowsArr = []; let missing = 0;
  (codesArr || []).forEach(c => {
    const k = String(c ?? '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    const r = codeIndex.get(k);
    if (r) rowsArr.push(r); else missing++;
  });
  const agg = rowsArr.reduce((a, r) => {
    a.stock += num(r['склад кол']);
    a.stockSum += num(r['склад сумма, руб.']) || num(r['склад кол']) * num(r['себ, руб.']);
    a.sold += num(r['продано (шт)']);
    a.to += num(r['то, руб']);
    a.toss += num(r['то сс, руб']);
    return a;
  }, { stock: 0, stockSum: 0, sold: 0, to: 0, toss: 0 });
  const rateSum = rowsArr.reduce((s, r) => s + dailyRate(r), 0);
  const cover = rateSum > 0 ? agg.stock / rateSum : Infinity;
  return { rows: rowsArr, missing, agg, rateSum, cover };
}

function zoneItemStatus(r, norm, log) {
  const stock = num(r['склад кол']), rate = dailyRate(r);
  const projected = Math.max(0, stock - rate * log.arrivalIn);
  if (!(norm > 0)) return { st: 'nonorm', projected, need: 0, qty: 0 };
  const need = norm * 1.1;
  if (projected < need) return { st: 'order', projected, need, qty: Math.ceil(need - projected) };
  return { st: 'ok', projected, need, qty: 0 };
}
function zoneStatusBadgeHtml(chk) {
  if (chk.st === 'nonorm') return '<span class="hint">норма не задана</span>';
  if (chk.st === 'order') return `<span class="ratio-badge ratio-fire">🔥 НУЖЕН ДОЗАКАЗ ~${chk.qty} шт</span>`;
  return '<span class="ratio-badge ratio-ok">✅ хватает</span>';
}
function zoneOrderInfo(z, log) {
  let orders = 0, qty = 0, normed = 0;
  z.codes.forEach(c => {
    const k = String(c ?? '').trim();
    const r = codeIndex.get(k);
    if (!r) return;
    const norm = (z.refill || {})[k] || 0;
    if (norm > 0) {
      normed++;
      const chk = zoneItemStatus(r, norm, log);
      if (chk.st === 'order') { orders++; qty += chk.qty; }
    }
  });
  return { orders, qty, normed };
}

// ── Карточки зон на странице ──
function zoneCardHtml(z, zlog) {
  const st = rawData.length ? zoneStats(z.codes) : null;
  const oi = rawData.length ? zoneOrderInfo(z, zlog) : null;
  const checked = zoneSel.has(z.id) ? ' checked' : '';
  const stats = st ? `
    <div class="zone-kv"><span>ТО</span><b>${fmt(st.agg.to)} ₽</b></div>
    <div class="zone-kv"><span>ВП</span><b class="${st.agg.gp < 0 ? 'fire-text' : ''}">${fmt(st.agg.gp)} ₽</b></div>
    <div class="zone-kv"><span>Продано</span><b>${fmt(st.agg.sold)} шт</b></div>
    <div class="zone-kv"><span>Склад</span><b>${fmt(st.agg.stock)} шт</b></div>
    <div class="zone-kv"><span>Покрытие</span><b>${coverBadge(st.cover)}</b></div>
    <div class="zone-kv"><span>🔥 Дозаказ к поставке</span><b class="${oi && oi.orders ? 'fire-text' : ''}">${oi ? (oi.orders ? `${oi.orders} поз. ~${oi.qty} шт` : 'нет') : '—'}</b></div>
    ${st.missing ? `<div class="zone-kv"><span>⚠️ Не найдено</span><b>${st.missing}</b></div>` : ''}
  ` : `<div class="hint">нет данных — загрузите отчёт</div>`;
  return `<div class="zone-card" data-zone-open="${z.id}">
    <input type="checkbox" class="zone-pick" data-zone-pick="${z.id}"${checked} title="Выбрать для объединения в мега-зону">
    <div class="zone-name">🧱 ${escapeHtml(z.name)}</div>
    <div class="zone-kv"><span>Артикулов</span><b>${z.codes.length}</b></div>
    ${stats}
  </div>`;
}

function megaCardHtml(m, zlog) {
  const childZones = m.zoneIds.map(id => zones.find(z => z.id === id)).filter(Boolean);
  const union = [...new Set(childZones.flatMap(z => z.codes))];
  const st = rawData.length ? zoneStats(union) : null;
  let orders = 0;
  if (rawData.length) childZones.forEach(z => orders += zoneOrderInfo(z, zlog).orders);
  const chips = childZones.map(z => `<span class="mini-zone-chip">🧱 ${escapeHtml(z.name)} · ${z.codes.length}</span>`).join('');
  const stats = st ? `
    <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:.82rem">
      <span>ТО: <b>${fmt(st.agg.to)} ₽</b></span>
      <span>ВП: <b>${fmt(st.agg.gp)} ₽</b></span>
      <span>Продано: <b>${fmt(st.agg.sold)} шт</b></span>
      <span>Склад: <b>${fmt(st.agg.stock)} шт</b></span>
      <span>Покрытие: ${coverBadge(st.cover)}</span>
      <span>🔥 Дозаказ: <b class="${orders ? 'fire-text' : ''}">${orders} поз.</b></span>
    </div>` : '';
  return `<div class="mega-card" data-mega-open="${m.id}">
    <div class="mega-tools">
      <button class="icon-btn" type="button" data-mega-rename="${m.id}" title="Переименовать">✎</button>
      <button class="icon-btn" type="button" data-mega-split="${m.id}" title="Разделить мега-зону">✖</button>
    </div>
    <div class="zone-name">🧩 ${escapeHtml(m.name)}<span class="mega-badge">МЕГА-ЗОНА</span></div>
    <div>${chips || '<span class="hint">зоны удалены</span>'}</div>
    ${stats}
  </div>`;
}

function renderZones() {
  zonesCard.classList.remove('hidden');
  const hasData = rawData.length > 0;
  const zlog = getLogistics(cfg);
  let html = '';
  if (!hasData) html += '<div class="alert-item alert-warn" style="margin-bottom:12px">📂 Отчёт ещё не загружен — статистика зон появится после загрузки файла. Создавать, сохранять и загружать зоны можно уже сейчас.</div>';

  if (zoneFormOpen) {
    html += `<div class="zone-form">
      <b>Новая коммерческая зона</b>
      <input type="text" id="newZoneName" placeholder="Название (например, «Сетка у входа»)">
      <textarea id="newZoneCodes" placeholder="Артикулы: через пробел, запятую или с новой строки"></textarea>
      <div style="display:flex;gap:8px">
        <button type="button" id="createZoneBtn">✔ Создать зону</button>
        <button type="button" class="btn-ghost" id="cancelZoneBtn">Отмена</button>
      </div>
    </div>`;
  }

  if (zoneSel.size >= 2) {
    html += `<div class="merge-bar">
      <span>Выбрано зон: <b>${zoneSel.size}</b></span>
      <input type="text" id="megaNameInput" placeholder="Название мега-зоны…" style="max-width:260px">
      <button type="button" id="megaMergeBtn">🧩 Объединить в мега-зону</button>
      <button type="button" class="btn-ghost" id="megaClearBtn">Снять выбор</button>
    </div>`;
  }

  if (megas.length) {
    html += '<h4 style="margin:6px 0 10px">🧩 Мега-зоны</h4>' + megas.map(m => megaCardHtml(m, zlog)).join('');
  }
  html += `<h4 style="margin:14px 0 10px">🧱 Зоны ${zones.length ? `(${zones.length})` : ''}</h4>`;
  if (!zones.length) {
    html += '<div class="alert-item alert-ok">Зон пока нет. Нажмите «➕ Новая зона» и создайте первую. Для каждого артикула можно задать норму выкладки (шт) — система проверит, хватит ли стока к ближайшей поставке (норма + 10% на кросс-выкладки), и подсветит «НУЖЕН ДОЗАКАЗ».</div>';
  } else {
    html += `<div class="zones-grid">${zones.map(z => zoneCardHtml(z, zlog)).join('')}</div>`;
    html += '<div class="hint" style="margin-top:10px">Клик по карточке — аналитика зоны и нормы выкладки. Галочка в углу — выбор для объединения в мега-зону.</div>';
  }
  zonesContent.innerHTML = html;
  zonesTitle.textContent = `🧱 Коммерческие зоны${zones.length ? ` — ${zones.length}` : ''}${megas.length ? ` · мега: ${megas.length}` : ''}`;
}

zonesCard.addEventListener('click', e => {
  if (e.target.closest('[data-zone-pick]')) return;
  const mr = e.target.closest('[data-mega-rename]');
  if (mr) { megaRename(mr.dataset.megaRename); return; }
  const ms = e.target.closest('[data-mega-split]');
  if (ms) { megaSplit(ms.dataset.megaSplit); return; }

  if (e.target.closest('#addZoneBtn')) { zoneFormOpen = !zoneFormOpen; renderZones(); return; }
  if (e.target.closest('#cancelZoneBtn')) { zoneFormOpen = false; renderZones(); return; }
  if (e.target.closest('#createZoneBtn')) {
    const name = (document.getElementById('newZoneName')?.value || '').trim() || `Зона ${zones.length + 1}`;
    const codes = [...new Set((document.getElementById('newZoneCodes')?.value || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
    if (!codes.length) { showStatus('⚠️ Укажите хотя бы один артикул.', 'error'); return; }
    zones.push({ id: genId('z'), name, codes, refill: {} });
    persistZones(); zoneFormOpen = false; renderZones();
    showStatus(`✅ Зона «${name}» создана: ${codes.length} артикулов.`, 'success');
    return;
  }
  if (e.target.closest('#megaMergeBtn')) {
    const name = (document.getElementById('megaNameInput')?.value || '').trim() || `Мега-зона ${megas.length + 1}`;
    megas.push({ id: genId('m'), name, zoneIds: [...zoneSel] });
    zoneSel.clear(); persistZones(); renderZones();
    showStatus(`🧩 Мега-зона «${name}» создана.`, 'success');
    return;
  }
  if (e.target.closest('#megaClearBtn')) { zoneSel.clear(); renderZones(); return; }
  if (e.target.closest('#saveZonesBtn')) { downloadZonesFile(); return; }
  if (e.target.closest('#loadZonesBtn')) { zonesFileInput.click(); return; }

  const mo = e.target.closest('[data-mega-open]');
  if (mo) { openMegaModal(mo.dataset.megaOpen); return; }
  const zo = e.target.closest('[data-zone-open]');
  if (zo) openZoneModal(zo.dataset.zoneOpen);
});

zonesCard.addEventListener('change', e => {
  const pick = e.target.closest('[data-zone-pick]');
  if (!pick) return;
  const id = pick.dataset.zonePick;
  if (pick.checked) zoneSel.add(id); else zoneSel.delete(id);
  renderZones();
});

function megaRename(id) {
  const m = megas.find(x => x.id === id); if (!m) return;
  const name = prompt('Новое название мега-зоны:', m.name);
  if (name && name.trim()) { m.name = name.trim(); persistZones(); renderZones(); if (!modalOverlay.classList.contains('hidden')) openMegaModal(id); }
}
function megaSplit(id) {
  const m = megas.find(x => x.id === id); if (!m) return;
  if (!confirm(`Разделить мега-зону «${m.name}»? Зоны останутся, объединение исчезнет.`)) return;
  megas = megas.filter(x => x.id !== id);
  persistZones(); closeModal(); renderZones();
  showStatus('Мега-зона разделена.', 'success');
}

function downloadZonesFile() {
  const data = { app: 'galamart-zones', version: 2, savedAt: new Date().toISOString(), zones, megas };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `galamart_zones_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
  showStatus(`💾 Сохранено: зон ${zones.length}, мега-зон ${megas.length}.`, 'success');
}

zonesFileInput.addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (!d || !Array.isArray(d.zones)) throw new Error('неверный формат файла');
      zones = d.zones.map(z => ({ id: z.id || genId('z'), name: String(z.name || 'Зона'), codes: (z.codes || []).map(String), refill: z.refill || {} }));
      megas = (d.megas || []).map(m => ({ id: m.id || genId('m'), name: String(m.name || 'Мега-зона'), zoneIds: (m.zoneIds || []).map(String) }));
      persistZones(); zoneSel.clear(); renderZones();
      showStatus(`📂 Загружено зон: ${zones.length}, мега-зон: ${megas.length}.`, 'success');
    } catch (err) { showStatus('❌ Не удалось загрузить зоны: ' + err.message, 'error'); }
  };
  rd.readAsText(f);
  e.target.value = '';
});

// ── Оверлей зоны ──
function openZoneModal(id) {
  const z = zones.find(x => x.id === id); if (!z) return;
  openZoneId = id; trialCodes = []; trialGroupVal = '';
  const hasData = rawData.length > 0;
  const st = hasData ? zoneStats(z.codes) : null;
  const zlog = getLogistics(cfg);
  const parentMega = megas.find(m => m.zoneIds.includes(id));
  const rows = st ? [...st.rows] : [];

  const enriched = rows.map(r => {
    const code = String(r['код'] ?? '').trim();
    const norm = (z.refill || {})[code] || 0;
    return { r, code, norm, chk: zoneItemStatus(r, norm, zlog) };
  });
  const rank = s => s === 'order' ? 0 : s === 'nonorm' ? 1 : 2;
  enriched.sort((a, b) => rank(a.chk.st) - rank(b.chk.st) || num(b.r['то, руб']) - num(a.r['то, руб']));

  const orderCount = enriched.filter(e => e.chk.st === 'order').length;
  const orderQty = enriched.reduce((s, e) => s + (e.chk.st === 'order' ? e.chk.qty : 0), 0);
  const gp = st ? st.agg.to - st.agg.toss : 0;
  const margin = st && st.agg.to > 0 ? gp / st.agg.to * 100 : 0;

  const tiles = st ? [
    tileHtml('ТО', fmt(st.agg.to) + ' ₽', 'kpi-accent'),
    tileHtml('Валовая прибыль', fmt(gp) + ' ₽', '', 'маржа ' + margin.toFixed(1) + '%'),
    tileHtml('Продано', fmt(st.agg.sold) + ' шт'),
    tileHtml('Склад', fmt(st.agg.stock) + ' шт', '', fmt(st.agg.stockSum) + ' ₽'),
    tileHtml('Покрытие стока', isFinite(st.cover) ? fmtDays(st.cover) + ' дн.' : '∞', !isFinite(st.cover) ? 'kpi-danger' : st.cover <= 14 ? 'kpi-danger' : st.cover <= 30 ? 'kpi-warn' : ''),
    tileHtml('🔥 Дозаказ', orderCount ? `${orderCount} поз.` : 'нет', orderCount ? 'kpi-danger' : 'kpi-accent', orderCount ? `~${orderQty} шт` : 'выкладка обеспечена')
  ].join('') : '';

  const itemsHtml = enriched.map(e => {
    const rate = dailyRate(e.r);
    const gpI = rowGp(e.r);
    return `<tr>
      <td><span class="link-cell" data-open-product data-code="${escapeHtml(e.code)}">${escapeHtml(e.code)}</span></td>
      <td style="white-space:normal">${escapeHtml(truncateStr(e.r['товар'], 44))}</td>
      <td>${cubeBadge(e.r['кубы'])}</td>
      <td class="${gpI < 0 ? 'fire-text' : ''}">${fmt(gpI)} ₽</td>
      <td>${fmt(num(e.r['склад кол']))}</td>
      <td>${rate.toFixed(2)}</td>
      <td style="${e.chk.st === 'order' ? 'color:#991b1b;font-weight:700' : ''}">${fmt(e.chk.projected)}</td>
      <td><input type="number" min="0" class="refill-input" data-refill-code="${escapeHtml(e.code)}" value="${e.norm}" title="Норма выкладки: сколько штук нужно для красивой выкладки"></td>
      <td data-status-cell="${escapeHtml(e.code)}">${zoneStatusBadgeHtml(e.chk)}</td>
      <td><button class="icon-btn" type="button" data-zone-remove-code="${escapeHtml(e.code)}" title="Убрать из зоны">✖</button></td>
    </tr>`;
  }).join('');

  modalBox.innerHTML = `
    <div class="modal-head">
      <div style="min-width:0">
        <div class="breadcrumb">🧱 Коммерческая зона${parentMega ? ` · входит в мега-зону «${escapeHtml(parentMega.name)}»` : ''}</div>
        <h3>${escapeHtml(z.name)}</h3>
        <div class="text-muted">${z.codes.length} артикулов${st && st.missing ? ` · ⚠️ не найдено в отчёте: ${st.missing}` : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn-ghost" data-zone-rename="${z.id}">✎ Переименовать</button>
        <button type="button" class="btn-danger" data-zone-delete="${z.id}">🗑 Удалить</button>
        <button type="button" class="modal-close" data-modal-close>✕</button>
      </div>
    </div>
    ${st ? `<div class="alert-item alert-warn" style="margin-bottom:8px">🚚 Ближайшая поставка: <b>${fmtDate(zlog.arrivalDate)}</b> (через ${zlog.arrivalIn} дн.). Правило: к моменту поставки остаток должен быть ≥ <b>норма выкладки + 10%</b> (кросс-выкладки). Иначе — «НУЖЕН ДОЗАКАЗ».</div>
    <div class="kpi-grid">${tiles}</div>` : '<div class="alert-item alert-warn">Загрузите отчёт, чтобы увидеть аналитику зоны.</div>'}
    ${st && rows.length ? '<div class="chart-box"><canvas id="modalCanvas"></canvas></div>' : ''}
    <h4>Состав зоны · нормы выкладки</h4>
    <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
      <textarea id="zoneAddCodes" placeholder="Коды для добавления (через пробел, запятую или с новой строки)…" style="flex:1;min-width:260px;min-height:38px"></textarea>
      <button type="button" data-zone-add-codes="${z.id}">➕ Добавить в зону</button>
    </div>
    ${rows.length ? `
      <div class="zone-scroll">
        <table class="mini-table sortable" style="margin-top:0">
          <thead><tr><th>Код</th><th>Товар</th><th>КУБЫ</th><th>ВП</th><th>Склад</th><th>Шт/дн</th><th>Останется к поставке</th><th>Норма, шт</th><th>Статус выкладки</th><th></th></tr></thead>
          <tbody id="zoneItemsBody">${itemsHtml}</tbody>
        </table>
      </div>
      <div id="zoneOrderSummary" style="margin-top:8px;font-size:.85rem;font-weight:600">${orderCount ? `🔥 Дозаказ: ${orderCount} позиций, ~${orderQty} шт` : '✅ Всё хватает для красивой выкладки до следующей поставки'}</div>
      <div class="hint">Норма — сколько штук нужно для красивой выкладки. Статус пересчитывается сразу при изменении нормы.</div>`
      : '<div class="hint">В зоне пока нет артикулов — добавьте выше или через примерку ниже.</div>'}
    <h4>🔮 Примерка артикулов</h4>
    <div class="hint" style="margin-bottom:6px">Быстрый топ по любой группе. «Примерить» — посмотреть вклад в зону, затем можно добавить в зону.</div>
    <div id="trialSection"></div>
  `;
  modalOverlay.classList.remove('hidden');
  if (st && rows.length) buildZoneChart(rows);
  fillTrialSection();
}

function updateZoneStatuses() {
  const z = zones.find(x => x.id === openZoneId); if (!z) return;
  const body = document.getElementById('zoneItemsBody'); if (!body) return;
  const zlog = getLogistics(cfg);
  let orders = 0, qtySum = 0;
  [...body.rows].forEach(tr => {
    const inp = tr.querySelector('[data-refill-code]'); if (!inp) return;
    const code = inp.dataset.refillCode;
    const norm = Math.max(0, +inp.value || 0);
    const r = codeIndex.get(code); if (!r) return;
    const chk = zoneItemStatus(r, norm, zlog);
    const cell = tr.querySelector('[data-status-cell]');
    if (cell) cell.innerHTML = zoneStatusBadgeHtml(chk);
    const projCell = tr.cells[6];
    if (projCell) { projCell.innerHTML = fmt(chk.projected); projCell.style.cssText = chk.st === 'order' ? 'color:#991b1b;font-weight:700' : ''; }
    if (chk.st === 'order') { orders++; qtySum += chk.qty; }
  });
  const el = document.getElementById('zoneOrderSummary');
  if (el) el.innerHTML = orders ? `🔥 Дозаказ: <b>${orders}</b> позиций, ~<b>${qtySum}</b> шт` : '✅ Всё хватает для красивой выкладки до следующей поставки';
}

function buildZoneChart(rows) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('modalCanvas');
  if (!ctx) return;
  const tops = [...rows].sort((a, b) => num(b['то, руб']) - num(a['то, руб'])).slice(0, 10);
  const labels = tops.map(r => String(r['код'] ?? ''));
  const vals = tops.map(r => num(r['то, руб']));
  const colors = tops.map(r => cubeKind(r['кубы']) ? '#ef4444' : '#2563eb');
  if (modalChart) modalChart.destroy();
  modalChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'ТО, руб.', data: vals, backgroundColor: colors, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
  });
}

function fillTrialSection() {
  const el = document.getElementById('trialSection'); if (!el) return;
  const z = zones.find(x => x.id === openZoneId); if (!z) return;
  if (!rawData.length) { el.innerHTML = '<div class="hint">Примерка доступна после загрузки отчёта.</div>'; return; }

  const groups = [...new Set(rawData.map(r => String(r['группа 1'] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const selHtml = `<select id="trialGroupSel" class="group-select" style="max-width:300px"><option value="">Весь магазин: топ по ТО</option>${groups.map(g => `<option value="${escapeHtml(g)}"${g === trialGroupVal ? ' selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select>`;

  const inZone = new Set(z.codes.map(c => String(c).trim()));
  const pool = rawData
    .filter(r => { const c = String(r['код'] ?? '').trim(); return c && !inZone.has(c) && !trialCodes.includes(c); })
    .filter(r => !trialGroupVal || String(r['группа 1'] ?? '').trim() === trialGroupVal)
    .sort((a, b) => num(b['то, руб']) - num(a['то, руб'])).slice(0, 10);

  const optHtml = pool.length
    ? pool.map(r => {
        const code = String(r['код'] ?? '').trim();
        return `<div class="trial-row">
          <b>${escapeHtml(code)}</b> ${escapeHtml(truncateStr(r['товар'], 44))} ${cubeBadge(r['кубы'])}
          <span class="text-muted" style="margin-left:auto">ТО ${fmt(num(r['то, руб']))} ₽ · ${fmt(num(r['продано (шт)']))} шт · склад ${fmt(num(r['склад кол']))}</span>
          <button type="button" class="icon-btn" data-trial-add="${escapeHtml(code)}" title="Примерить">➕ Примерить</button>
        </div>`;
      }).join('')
    : '<div class="hint">Все топы этой группы уже в зоне 🙂</div>';

  let trialHtml = '';
  if (trialCodes.length) {
    const zTO = zoneStats(z.codes).agg.to;
    let tTO = 0;
    trialHtml = trialCodes.map(c => {
      const r = codeIndex.get(c); if (!r) return '';
      const to = num(r['то, руб']); tTO += to;
      return `<div class="trial-row on">
        <b>${escapeHtml(c)}</b> ${escapeHtml(truncateStr(r['товар'], 44))}
        <span class="text-muted" style="margin-left:auto">ТО ${fmt(to)} ₽ · ${fmt(num(r['продано (шт)']))} шт</span>
        <button type="button" class="icon-btn" data-trial-commit="${escapeHtml(c)}" title="Добавить в зону">✔ В зону</button>
        <button type="button" class="icon-btn" data-trial-remove="${escapeHtml(c)}" title="Снять примерку">✖</button>
      </div>`;
    }).join('');
    trialHtml += `<div class="alert-item alert-ok" style="margin-top:6px">🔮 Зона сейчас: <b>${fmt(zTO)} ₽</b> ТО → с примеркой: <b>${fmt(zTO + tTO)} ₽</b> (+${fmt(tTO)} ₽)</div>`;
  }

  el.innerHTML = selHtml + '<div style="margin-top:8px">' + optHtml + '</div>' + (trialHtml ? '<h4 style="margin:10px 0 6px">Примеряемые</h4>' + trialHtml : '');
}

// ── Оверлей мега-зоны ──
function openMegaModal(id) {
  const m = megas.find(x => x.id === id); if (!m) return;
  const childZones = m.zoneIds.map(zi => zones.find(z => z.id === zi)).filter(Boolean);
  const union = [...new Set(childZones.flatMap(z => z.codes))];
  const st = rawData.length ? zoneStats(union) : null;
  const zlog = getLogistics(cfg);
  const gp = st ? st.agg.to - st.agg.toss : 0;
  const margin = st && st.agg.to > 0 ? gp / st.agg.to * 100 : 0;

  const tiles = st ? [
    tileHtml('ТО (совмещ.)', fmt(st.agg.to) + ' ₽', 'kpi-accent'),
    tileHtml('Валовая прибыль', fmt(gp) + ' ₽', '', 'маржа ' + margin.toFixed(1) + '%'),
    tileHtml('Продано', fmt(st.agg.sold) + ' шт'),
    tileHtml('Склад', fmt(st.agg.stock) + ' шт', '', fmt(st.agg.stockSum) + ' ₽'),
    tileHtml('Покрытие стока', isFinite(st.cover) ? fmtDays(st.cover) + ' дн.' : '∞', !isFinite(st.cover) ? 'kpi-danger' : st.cover <= 14 ? 'kpi-danger' : st.cover <= 30 ? 'kpi-warn' : ''),
    tileHtml('Артикулов (уник.)', fmt(union.length))
  ].join('') : '';

  const breakdown = childZones.map(z => {
    const zs = rawData.length ? zoneStats(z.codes) : null;
    const oi = rawData.length ? zoneOrderInfo(z, zlog) : null;
    return `<tr>
      <td><b>${escapeHtml(z.name)}</b></td>
      <td>${z.codes.length}</td>
      <td>${zs ? fmt(zs.agg.to) + ' ₽' : '—'}</td>
      <td>${zs ? fmt(zs.agg.gp) + ' ₽' : '—'}</td>
      <td>${zs ? fmt(zs.agg.sold) + ' шт' : '—'}</td>
      <td>${zs ? fmt(zs.agg.stock) + ' шт' : '—'}</td>
      <td>${zs ? coverBadge(zs.cover) : '—'}</td>
      <td>${oi ? (oi.orders ? `<span class="fire-text">${oi.orders} поз.</span>` : 'нет') : '—'}</td>
      <td><button type="button" class="icon-btn" data-zone-open-child="${z.id}">открыть →</button></td>
    </tr>`;
  }).join('');

  modalBox.innerHTML = `
    <div class="modal-head">
      <div style="min-width:0">
        <div class="breadcrumb">🧩 Мега-зона (объединённая статистика)</div>
        <h3>${escapeHtml(m.name)}</h3>
        <div class="text-muted">${childZones.length} зон · ${union.length} уникальных артикулов</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn-ghost" data-mega-rename="${m.id}">✎ Переименовать</button>
        <button type="button" class="btn-danger" data-mega-split="${m.id}">✖ Разделить</button>
        <button type="button" class="modal-close" data-modal-close>✕</button>
      </div>
    </div>
    ${st ? `<div class="kpi-grid">${tiles}</div>` : '<div class="alert-item alert-warn">Загрузите отчёт, чтобы увидеть аналитику.</div>'}
    ${st && st.rows.length ? '<div class="chart-box"><canvas id="modalCanvas"></canvas></div>' : ''}
    <h4>Разбивка по зонам</h4>
    <div class="zone-scroll">
      <table class="mini-table sortable" style="margin-top:0">
        <thead><tr><th>Зона</th><th>Артикулов</th><th>ТО</th><th>ВП</th><th>Продано</th><th>Склад</th><th>Покрытие</th><th>🔥 Дозаказ</th><th></th></tr></thead>
        <tbody>${breakdown || '<tr><td colspan="9" class="hint">зоны удалены</td></tr>'}</tbody>
      </table>
    </div>
  `;
  modalOverlay.classList.remove('hidden');
  if (st && st.rows.length) buildZoneChart(st.rows);
}

// ── Подарки ──
function giftRebuildOptions() {
  const uniq = (arr, key) => [...new Set(arr.map(r => String(r[key] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const fill = (sel, vals) => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">${sel.dataset.all || 'все'}</option>` +
      vals.map(v => `<option value="${escapeHtml(v)}"${v === cur ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('');
  };
  fill(giftSel1, uniq(rawData, 'группа 1'));
  let pool = rawData;
  if (giftSel1.value) pool = pool.filter(r => String(r['группа 1'] ?? '').trim() === giftSel1.value);
  fill(giftSel2, uniq(pool, 'группа 2'));
  if (giftSel2.value) pool = pool.filter(r => String(r['группа 2'] ?? '').trim() === giftSel2.value);
  fill(giftSel3, uniq(pool, 'группа 3'));
}

function renderGifts() {
  giftsCard.classList.remove('hidden');
  if (!rawData.length) {
    giftsSummary.innerHTML = '';
    giftsContent.innerHTML = '<div class="alert-item alert-warn">Сначала загрузите отчёт — тогда подбор подарков станет доступен.</div>';
    return;
  }
  giftRebuildOptions();
  const limit = +giftLimit.value || 0;
  const g1 = giftSel1.value, g2 = giftSel2.value, g3 = giftSel3.value;
  const onlyStock = giftInStock.checked;

  let items = rawData.filter(r => {
    const cost = num(r['себ, руб.']);
    if (cost <= 0 || cost > limit) return false;
    if (g1 && String(r['группа 1'] ?? '').trim() !== g1) return false;
    if (g2 && String(r['группа 2'] ?? '').trim() !== g2) return false;
    if (g3 && String(r['группа 3'] ?? '').trim() !== g3) return false;
    if (onlyStock && num(r['склад кол']) <= 0) return false;
    return true;
  }).sort((a, b) => num(b['то, руб']) - num(a['то, руб']));

  const total = items.length;
  const shown = items.slice(0, 500);
  const sumCost = items.reduce((s, r) => s + num(r['себ, руб.']), 0);
  const sumRetail = items.reduce((s, r) => s + num(r['цена маг, руб.']), 0);

  giftsTitle.textContent = `🎁 Выбор подарка — себестоимость до ${fmt(limit)} ₽`;
  giftsSummary.innerHTML = `<div class="alert-item alert-ok">Найдено <b>${fmt(total)}</b> позиций с себестоимостью ≤ ${fmt(limit)} ₽. Если взять по 1 шт каждой: по себестоимости ≈ <b>${fmt(sumCost)} ₽</b>, по рознице ≈ <b>${fmt(sumRetail)} ₽</b>. Сначала — самые продаваемые (обычно лучший подарок).</div>`;

  const rows = shown.map(r => {
    const code = String(r['код'] ?? '').trim();
    const cost = num(r['себ, руб.']);
    const mk = itemMarkup(r);
    return `<tr>
      <td><span class="link-cell" data-open-product data-code="${escapeHtml(code)}">${escapeHtml(code)}</span></td>
      <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 56))}</td>
      <td>${escapeHtml(String(r['группа 1'] ?? '').trim() || '—')}</td>
      <td>${escapeHtml(String(r['группа 2'] ?? '').trim() || '—')}</td>
      <td>${escapeHtml(String(r['группа 3'] ?? '').trim() || '—')}</td>
      <td>${cubeBadge(r['кубы'])}</td>
      <td><b>${fmt(cost, 2)} ₽</b></td>
      <td>${fmt(num(r['цена маг, руб.']), 2)} ₽</td>
      <td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td>
      <td>${fmt(num(r['склад кол']))}</td>
      <td>${fmt(num(r['продано (шт)']))}</td>
      <td>${fmt(num(r['то, руб']))} ₽</td>
      <td class="${rowGp(r) < 0 ? 'fire-text' : ''}">${fmt(rowGp(r))} ₽</td>
      <td>${daysBadgeR(r)}</td>
    </tr>`;
  }).join('');

  giftsContent.innerHTML = `
    <div class="zone-scroll" style="max-height:62vh">
      <table class="mini-table sortable" style="margin-top:0">
        <thead><tr><th>Код</th><th>Товар</th><th>Группа 1</th><th>Группа 2</th><th>Группа 3</th><th>КУБЫ</th><th>Себестоимость</th><th>Цена маг</th><th>Наценка</th><th>Склад</th><th>Продано</th><th>ТО</th><th>ВП</th><th>Ост. дней</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="14">Ничего не найдено — поднимите лимит или выберите другую группу.</td></tr>'}</tbody>
      </table>
    </div>
    ${total > 500 ? `<div class="hint">Показаны первые 500 из ${total}.</div>` : ''}
  `;
}

let giftTimer = null;
giftLimit.addEventListener('input', () => { clearTimeout(giftTimer); giftTimer = setTimeout(() => { if (rawData.length) renderGifts(); }, 200); });
[giftSel1, giftSel2, giftSel3].forEach(s => s.addEventListener('change', () => { if (rawData.length) renderGifts(); }));
giftInStock.addEventListener('change', () => { if (rawData.length) renderGifts(); });
giftsContent.addEventListener('click', e => {
  const p = e.target.closest('[data-open-product]');
  if (p) openProduct(p.dataset.code, null);
});
```

---

**`js/app.js`**

```js
/* ══════════════════════════════════════════════════════════════
   app.js — модальное ядро, переключение режимов, «Обработать»,
   проверка библиотек, инициализация
   ══════════════════════════════════════════════════════════════ */

// ── Модальное ядро ──
function closeModal() {
  modalOverlay.classList.add('hidden');
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

modalBox.addEventListener('click', e => {
  if (e.target.closest('[data-modal-close]')) return closeModal();

  const jump = e.target.closest('[data-an-page-jump]');
  if (jump) {
    anPage = jump.dataset.anPageJump;
    anCodesInput.value = '';
    closeModal();
    if (currentMode === 'analysis') renderAnalysis(); else switchMode('analysis');
    return;
  }

  const mkb = e.target.closest('[data-mk-bucket]');
  if (mkb) {
    const k = mkb.dataset.mkBucket;
    openProductListDrill(`🏷 Наценка: ${MK_LABELS[k]}`, rawData.filter(r => markupBucketKey(r) === k));
    return;
  }

  const zr = e.target.closest('[data-zone-rename]');
  if (zr) {
    const z = zones.find(x => x.id === zr.dataset.zoneRename);
    if (z) { const name = prompt('Новое название зоны:', z.name); if (name && name.trim()) { z.name = name.trim(); persistZones(); openZoneModal(z.id); } }
    return;
  }
  const zd = e.target.closest('[data-zone-delete]');
  if (zd) {
    const z = zones.find(x => x.id === zd.dataset.zoneDelete);
    if (z && confirm(`Удалить зону «${z.name}»?`)) {
      zones = zones.filter(x => x.id !== z.id);
      megas.forEach(m => m.zoneIds = m.zoneIds.filter(zi => zi !== z.id));
      const before = megas.length;
      megas = megas.filter(m => m.zoneIds.length >= 2);
      zoneSel.delete(z.id);
      persistZones(); closeModal(); renderZones();
      showStatus(`Зона «${z.name}» удалена.${megas.length < before ? ' Мега-зона с <2 зон распущена.' : ''}`, 'success');
    }
    return;
  }
  const zac = e.target.closest('[data-zone-add-codes]');
  if (zac) {
    const z = zones.find(x => x.id === zac.dataset.zoneAddCodes);
    const ta = document.getElementById('zoneAddCodes');
    if (z && ta) {
      const add = [...new Set(ta.value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
      const fresh = add.filter(c => !z.codes.includes(c));
      z.codes.push(...fresh);
      persistZones(); openZoneModal(z.id);
      showStatus(fresh.length ? `➕ Добавлено в зону: ${fresh.length} артикулов.` : 'Все указанные артикулы уже в зоне.', fresh.length ? 'success' : 'error');
    }
    return;
  }
  const zrc = e.target.closest('[data-zone-remove-code]');
  if (zrc) {
    const z = zones.find(x => x.id === openZoneId);
    if (z) {
      const code = zrc.dataset.zoneRemoveCode;
      z.codes = z.codes.filter(c => String(c).trim() !== code);
      if (z.refill) delete z.refill[code];
      persistZones(); openZoneModal(z.id);
    }
    return;
  }
  const ta = e.target.closest('[data-trial-add]');
  if (ta) { trialCodes.push(ta.dataset.trialAdd); fillTrialSection(); return; }
  const tc = e.target.closest('[data-trial-commit]');
  if (tc) {
    const z = zones.find(x => x.id === openZoneId);
    if (z) {
      const code = tc.dataset.trialCommit;
      if (!z.codes.includes(code)) z.codes.push(code);
      trialCodes = trialCodes.filter(c => c !== code);
      persistZones(); openZoneModal(z.id);
    }
    return;
  }
  const trm = e.target.closest('[data-trial-remove]');
  if (trm) { trialCodes = trialCodes.filter(c => c !== trm.dataset.trialRemove); fillTrialSection(); return; }

  const mr = e.target.closest('[data-mega-rename]');
  if (mr) { megaRename(mr.dataset.megaRename); return; }
  const ms = e.target.closest('[data-mega-split]');
  if (ms) { megaSplit(ms.dataset.megaSplit); return; }
  const zoc = e.target.closest('[data-zone-open-child]');
  if (zoc) { openZoneModal(zoc.dataset.zoneOpenChild); return; }

  const back = e.target.closest('[data-back-groups]');
  if (back) { try { return openGroup(...JSON.parse(back.dataset.backGroups)); } catch (_) { return; } }
  const tab = e.target.closest('[data-tab]');
  if (tab) { currentGroupTab = tab.dataset.tab; return renderGroupCard(); }
  const p = e.target.closest('[data-open-product]');
  if (p) return openProduct(p.dataset.code, currentGroupPath);
  const g = e.target.closest('[data-open-group]');
  if (g) return openGroup(g.dataset.g1 || '', g.dataset.g2 || '', g.dataset.g3 || '');
});

modalBox.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'trialGroupSel') { trialGroupVal = t.value; fillTrialSection(); return; }
  if (t.classList.contains('refill-input') && t.dataset.refillCode !== undefined) {
    const z = zones.find(x => x.id === openZoneId);
    if (z) {
      z.refill = z.refill || {};
      z.refill[t.dataset.refillCode] = Math.max(0, +t.value || 0);
      persistZones();
      updateZoneStatuses();
    }
  }
});

// ── Переключение режимов ──
segBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode === currentMode) return;
    currentMode = btn.dataset.mode;
    segBtns.forEach(b => b.classList.toggle('active', b === btn));
    dateGroup.classList.toggle('hidden', !(currentMode === 'kлизма' || currentMode === 'sellto'));
    browsePanel.classList.toggle('hidden', currentMode !== 'browse');
    dateLabel.textContent = currentMode === 'sellto' ? '2. Дата окончания продаж (до)' : '2. Дата ввоза (до)';
    filterDateInput.value = '';
    hideAllPages();
    if (rawData.length) {
      if (currentMode === 'browse' && browseData) { rebuildGroupOptions(); applyBrowse(); }
      if (currentMode === 'top100') renderTop100();
      if (currentMode === 'issues') renderIssues();
      if (currentMode === 'dash') renderDashboard();
      if (currentMode === 'analysis') renderAnalysis();
      if (currentMode === 'gifts') renderGifts();
    }
    if (currentMode === 'zones') renderZones();
    updateBtn();
  });
});

filterDateInput.addEventListener('change', updateBtn);

// ── Кнопка «Обработать» ──
processBtn.addEventListener('click', async () => {
  showStatus('Фильтрация и расчёт...', 'success');
  processBtn.disabled = true;
  await new Promise(r => setTimeout(r, 40));

  if (currentMode === 'browse') {
    browseData = rawData.slice();
    rebuildGroupOptions();
    hideAllPages();
    applyBrowse();
    processBtn.disabled = false;
    return;
  }
  if (currentMode === 'top100')   { hideAllPages(); renderTop100(); processBtn.disabled = false; return; }
  if (currentMode === 'issues')   { hideAllPages(); renderIssues(); processBtn.disabled = false; return; }
  if (currentMode === 'dash')     { hideAllPages(); renderDashboard(); processBtn.disabled = false; return; }
  if (currentMode === 'analysis') { hideAllPages(); renderAnalysis(); processBtn.disabled = false; return; }
  if (currentMode === 'zones')    { hideAllPages(); renderZones(); processBtn.disabled = false; return; }
  if (currentMode === 'gifts')    { hideAllPages(); renderGifts(); processBtn.disabled = false; return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const targetDate = new Date(filterDateInput.value);
  targetDate.setHours(23, 59, 59, 999);

  let daysLeft = 0, filtered = [], modeName = '';

  if (currentMode === 'kлизма') {
    filtered = rawData.filter(row => {
      const importDate = parseDate(row['дата ввоза']);
      if (!importDate || importDate > targetDate) return false;
      const excl = String(row['категория искл. из автоуценки'] ?? '').toLowerCase().trim();
      if (excl.includes('не клизма')) return false;
      return true;
    });
    let deadline = new Date(today.getFullYear(), today.getMonth(), 15);
    if (today > deadline) deadline = new Date(today.getFullYear(), today.getMonth() + 1, 15);
    daysLeft = Math.max(0, Math.ceil((deadline - today) / 86400000));
    modeName = 'Клизма';
  } else {
    filtered = rawData.filter(row => {
      const salesEnd = parseDate(row['дата окончания продаж']);
      if (!salesEnd || salesEnd > targetDate) return false;
      return true;
    });
    daysLeft = Math.max(0, Math.ceil((targetDate - today) / 86400000));
    modeName = 'Продать до';
  }

  if (!filtered.length) {
    showStatus('❌ Нет товаров по критериям. Проверьте дату или режим.', 'error');
    hideAllPages(); processBtn.disabled = false; return;
  }

  hideAllPages();
  renderTable(filtered, 'md', daysLeft);
  resultEl.classList.remove('hidden');
  resultTitle.textContent = `${modeName} — ${filtered.length.toLocaleString('ru-RU')} артикулов, дедлайн через ${daysLeft} дн.`;
  showStatus(`✅ Режим: ${modeName}. Найдено: ${filtered.length.toLocaleString('ru-RU')} артикулов.\nДо дедлайна: ${daysLeft} дн.\nВверху — живые итоги: как уценка влияет на валовую прибыль.`, 'success');
  processBtn.disabled = false;
});

// ── Проверка библиотек и старт ──
if (typeof XLSX === 'undefined') {
  showStatus('❌ Не найден файл lib/xlsx.full.min.js. Скачайте его с https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js и положите в папку lib/.', 'error');
}
if (typeof Chart === 'undefined') {
  showStatus('⚠️ Не найден файл lib/chart.umd.min.js — графики работать не будут. Скачайте с https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js и положите в папку lib/.', 'error');
}
updateBtn();
```

---

Чек-лист после сборки:
1. Открыл `index.html` → нет красных статусов про библиотеки.
2. Загрузил отчёт → дашборд собрался.
3. Пробежался по вкладкам: Анализ (провал по группам), ТОП-100, Проблемы, Клизма (итоги сверху), Просмотр, Зоны, Подарки.
4. Зоны сохранил/загрузил JSON.

Дальше по плану: выгрузки всего → история/динамика → сравнение с регионом и сетью. Скажи, когда проверишь сборку.
