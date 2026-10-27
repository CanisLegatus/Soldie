/* ══════════════════════════════════════════════════════════════
   r29.js — раздел «R29» (полная интеграция проекта r29/r29.html)
   Коммерческие зоны по ценовым сегментам: загрузка input1/input2,
   отбор товаров по сегментам, ТО/ВП/шт, контроль дублей, произвольные
   артикулы, сохранение/загрузка выбора (JSON) и печать документов.

   Логика перенесена из r29/r29.html без изменений поведения:
     • код изолирован в IIFE (нет конфликтов имён с core/app/vision);
     • стили ограничены селектором #r29Card (CSS-переменные наследуются);
     • разметка инжектируется один раз при первом открытии вкладки;
     • XLSX используется общий (из lib/), CDN не нужен;
     • печать адаптирована под хост-страницу (скрывает остальной UI).
   Точки входа: window.r29RenderMarkup(), window.r29Init(),
                window.r29Hide(), window.r29PrintAllSelected().
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Стили R29 (scope: #r29Card) ──
  var r29Style = document.createElement('style');
  r29Style.id = 'r29Styles';
  r29Style.textContent = `#r29Card {
      --bg: #eef2f7;
      --card: rgba(255,255,255,.94);
      --border: #dbe2ea;
      --border-strong: #c8d2dd;
      --text: #0f172a;
      --muted: #64748b;
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --primary-soft: #dbeafe;
      --danger: #ef4444;
      --danger-soft: #fee2e2;
      --warning-soft: #ffedd5;
      --success: #16a34a;
      --shadow: 0 10px 30px rgba(15, 23, 42, .08);
      --radius: 16px;
    }




#r29Card {
      box-sizing: border-box;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: var(--text);
      font-size: 14px;
      line-height: 1.45;
    }

    #r29Card *,
    #r29Card *::before,
    #r29Card *::after {
      box-sizing: border-box;
    }



#r29Card #r29App {
      max-width: 1600px;
      margin: 0 auto;
    }




#r29Card .card {
      background: var(--card);
      border: 1px solid rgba(219, 226, 234, .9);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(8px);
      padding: 16px;
      margin-bottom: 16px;
    }




#r29Card .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      position: sticky;
      top: 10px;
      z-index: 50;
    }




#r29Card .brand h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: -.02em;
    }




#r29Card .brand .subtitle {
      color: var(--muted);
      margin-top: 4px;
      max-width: 720px;
    }




#r29Card .top-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      align-items: center;
    }




#r29Card .btn {
      appearance: none;
      border: 1px solid var(--border-strong);
      background: #fff;
      color: var(--text);
      border-radius: 12px;
      padding: 9px 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      text-decoration: none;
      white-space: nowrap;
    }




#r29Card .btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(15, 23, 42, .10);
      background: #f8fafc;
    }




#r29Card .btn.primary {
      background: linear-gradient(135deg, var(--primary), var(--primary-dark));
      border-color: transparent;
      color: #fff;
    }




#r29Card .btn.primary:hover {
      background: linear-gradient(135deg, #1d4ed8, #1e40af);
    }




#r29Card .btn.soft {
      background: #f8fafc;
    }




#r29Card .btn.danger-soft {
      background: #fff5f5;
      border-color: #fecaca;
      color: #991b1b;
    }




#r29Card .btn.small {
      padding: 7px 10px;
      font-size: 13px;
      border-radius: 10px;
    }




#r29Card .file-btn {
      position: relative;
      overflow: hidden;
      background: #f8fafc;
    }




#r29Card .file-btn input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }




    select,

#r29Card input[type="text"] {
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      padding: 9px 11px;
      font-size: 14px;
      background: #fff;
      color: var(--text);
      outline: none;
      transition: border-color .15s ease, box-shadow .15s ease;
    }




    select:focus,

#r29Card input[type="text"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, .12);
    }




#r29Card .select-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-weight: 600;
    }




#r29Card .status {
      color: var(--muted);
      margin-top: 10px;
    }




#r29Card .hint {
      color: var(--muted);
      margin-top: 8px;
    }




#r29Card .section-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }




#r29Card .section-head h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -.01em;
    }




#r29Card .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
    }




#r29Card .kpi {
      background: linear-gradient(180deg, #ffffff, #f8fafc);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
      min-height: 84px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
    }




#r29Card .kpi .label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
    }




#r29Card .kpi .value {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -.02em;
    }




#r29Card .kpi.accent {
      background: linear-gradient(135deg, rgba(37,99,235,.12), rgba(37,99,235,.05));
      border-color: rgba(37,99,235,.18);
    }




#r29Card details {
      margin-top: 14px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }




#r29Card summary {
      cursor: pointer;
      font-weight: 700;
      color: var(--text);
      user-select: none;
    }




#r29Card .table-wrap {
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: #fff;
      max-height: 64vh;
    }




#r29Card .table-wrap.small {
      max-height: 220px;
    }




#r29Card table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      min-width: 1150px;
      font-size: 13px;
    }




#r29Card th,
    #r29Card td {
      padding: 9px 10px;
      border-bottom: 1px solid #edf2f7;
      vertical-align: middle;
      white-space: nowrap;
    }




#r29Card th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: rgba(248, 250, 252, .95);
      backdrop-filter: blur(4px);
      color: #334155;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
      border-bottom: 1px solid var(--border);
    }




#r29Card tbody tr {
      cursor: pointer;
      transition: background .12s ease;
    }




#r29Card tbody tr:nth-child(even):not(.row-selected):not(.row-red):not(.row-orange):not(.row-vp-issue) {
      background: #fafcff;
    }




#r29Card tbody tr:hover:not(.row-selected):not(.row-red):not(.row-orange):not(.row-vp-issue) {
      background: #f1f5f9;
    }




#r29Card tr.row-vp-issue {
      background: #fefce8;
      box-shadow: inset 3px 0 0 #eab308;
    }




#r29Card tr.row-selected {
      background: var(--primary-soft);
      box-shadow: inset 3px 0 0 var(--primary);
    }




#r29Card tr.row-red {
      background: var(--danger-soft);
      box-shadow: inset 3px 0 0 var(--danger);
    }




#r29Card tr.row-orange {
      background: var(--warning-soft);
      box-shadow: inset 3px 0 0 #f97316;
    }




#r29Card .right {
      text-align: right;
    }




#r29Card .center {
      text-align: center;
    }




#r29Card .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }




#r29Card .tab {
      border: 1px solid var(--border-strong);
      background: #fff;
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      transition: all .15s ease;
      box-shadow: 0 1px 2px rgba(15,23,42,.05);
    }




#r29Card .tab:hover {
      transform: translateY(-1px);
      background: #f8fafc;
    }




#r29Card .tab.active {
      background: linear-gradient(135deg, var(--primary), var(--primary-dark));
      border-color: transparent;
      color: #fff;
      box-shadow: 0 8px 18px rgba(37, 99, 235, .22);
    }




#r29Card .badge {
      min-width: 22px;
      padding: 2px 7px;
      border-radius: 999px;
      background: #e2e8f0;
      color: #111827;
      font-size: 12px;
      text-align: center;
      font-weight: 800;
    }




#r29Card .tab.active .badge {
      background: rgba(255,255,255,.92);
    }




#r29Card .zone-header {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: flex-start;
      margin-bottom: 12px;
    }




#r29Card .zone-title {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -.01em;
    }




#r29Card .zone-meta {
      color: var(--muted);
      margin-top: 6px;
    }




#r29Card .zone-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }




#r29Card .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }




    .toolbar .left,

#r29Card .toolbar .right-side {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }




#r29Card .toolbar input[type="text"] {
      min-width: 220px;
    }




#r29Card .chips {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }




#r29Card .chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid #cbd5e1;
      background: #f1f5f9;
      color: #111827;
      border-radius: 999px;
      padding: 5px 9px;
      cursor: pointer;
      user-select: none;
      font-weight: 700;
      transition: all .15s ease;
    }




#r29Card .chip:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(15,23,42,.08);
    }




#r29Card .chip-red {
      background: var(--danger-soft);
      border-color: #fca5a5;
      color: #7f1d1d;
    }




#r29Card .chip-orange {
      background: var(--warning-soft);
      border-color: #fdba74;
      color: #7c2d12;
    }




#r29Card .chip-muted {
      opacity: .72;
    }




#r29Card button.chip {
      font: inherit;
      appearance: none;
    }




#r29Card button.chip .badge {
      background: #e2e8f0;
      color: #111827;
    }




    /***********************

     * Group modal

     ***********************/



#r29Card.r29-open .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, .45);
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 40px 16px;
      z-index: 900;
      overflow: auto;
    }




#r29Card .modal-overlay.show {
      display: flex;
    }




#r29Card .modal-card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, .28);
      width: 100%;
      max-width: 1000px;
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 80px);
    }




#r29Card .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }




#r29Card .modal-head h3 {
      margin: 0;
      font-size: 17px;
      letter-spacing: -.01em;
    }




#r29Card .modal-body {
      padding: 12px 16px;
      overflow: auto;
    }




#r29Card .modal-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      flex-wrap: wrap;
    }




#r29Card #groupModalBody table {
      min-width: 0;
    }




#r29Card #groupModalBody th {
      position: static;
    }




    #groupModalBody th,

#r29Card #groupModalBody td {
      white-space: normal;
      word-break: break-word;
    }




#r29Card .muted {
      color: var(--muted);
    }




#r29Card .toast {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 1000;
      background: #111827;
      color: #fff;
      padding: 12px 14px;
      border-radius: 12px;
      box-shadow: 0 12px 30px rgba(0,0,0,.22);
      opacity: 0;
      transform: translateY(10px);
      transition: all .2s ease;
      pointer-events: none;
      max-width: 420px;
    }




#r29Card .toast.show {
      opacity: 1;
      transform: translateY(0);
    }




#r29Card .print-root {
      display: none;
    }




    @media (max-width: 900px) {
      .topbar {
        position: static;
        flex-direction: column;
      }

      .top-actions {
        justify-content: flex-start;
      }

      .zone-header {
        flex-direction: column;
      }

      .zone-actions {
        justify-content: flex-start;
      }
    }



    /***********************

     * Print styles

     ***********************/



    @media print and (min-width: 2160px) { /* legacy block from r29.html — neutralized for host page */
      @page {
        size: A4 landscape;
        margin: 10mm;
      }

      body {
        background: #fff;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #000;
      }

      #app,
      #toast,
      #groupModalOverlay {
        display: none !important;
      }

      .print-root {
        display: block !important;
        color: #000;
      }

      .print-page-header {
        border-bottom: 2px solid #000;
        padding-bottom: 8px;
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }

      .print-title {
        font-size: 18px;
        font-weight: 800;
        margin: 0 0 4px;
      }

      .print-subtitle {
        font-size: 12px;
        color: #111;
      }

      .print-date {
        font-size: 12px;
        text-align: right;
      }

      .print-section {
        page-break-inside: auto;
        margin-bottom: 18px;
      }

      .print-section-title {
        font-size: 14px;
        font-weight: 800;
        margin: 10px 0 8px;
      }

      .print-meta-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 6px;
        margin-bottom: 8px;
      }

      .print-meta-box {
        border: 1px solid #000;
        padding: 6px 7px;
        font-size: 11px;
        page-break-inside: avoid;
      }

      .print-meta-box .label {
        color: #333;
        margin-bottom: 3px;
      }

      .print-meta-box .value {
        font-size: 13px;
        font-weight: 800;
      }

      .print-table {
        width: 100%;
        border-collapse: collapse;
        page-break-inside: auto;
      }

      .print-table th,
      .print-table td {
        border: 1px solid #000;
        padding: 4px 6px;
        font-size: 10.5px;
        vertical-align: top;
        white-space: nowrap;
      }

      .print-table th {
        background: #f3f4f6 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        text-align: left;
      }

      .print-table tbody tr {
        page-break-inside: avoid;
      }

      .print-table .right {
        text-align: right;
      }

      .print-table .center {
        text-align: center;
      }

      .print-table .wrap {
        white-space: normal;
        word-break: break-word;
      }

      .print-table tfoot td {
        font-weight: 800;
      }

      .print-signatures {
        margin-top: 34px;
        display: flex;
        justify-content: space-between;
        gap: 40px;
        page-break-inside: avoid;
      }

      .print-signature {
        width: 240px;
        font-size: 11px;
      }

      .print-signature .line {
        border-top: 1px solid #000;
        padding-top: 4px;
        margin-top: 28px;
      }
    }
`;
  document.head.appendChild(r29Style);

  // ── Стили печати: во время window.print() показываем только #print-root ──
  var r29PrintStyle = document.createElement('style');
  r29PrintStyle.id = 'r29PrintStyles';
  r29PrintStyle.textContent = `@media print {
  body.galamart-printing-r29 > *:not(#r29PrintPortal) { display: none !important; }
}
#print-root .print-page-header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
#print-root .print-title { font-size: 18px; font-weight: 700; }
#print-root .print-subtitle { font-size: 12px; color: #444; margin-top: 2px; }
#print-root .print-date { font-size: 11px; text-align: right; }
#print-root .print-section { margin-bottom: 18px; page-break-inside: avoid; }
#print-root .print-section-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; background: #f1f5f9; padding: 6px 8px; border-radius: 6px; }
#print-root .print-meta-grid { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
#print-root .print-meta-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 10px; min-width: 110px; }
#print-root .print-meta-box .label { font-size: 10px; color: #555; text-transform: uppercase; }
#print-root .print-meta-box .value { font-size: 14px; font-weight: 700; }
#print-root table.print-table { width: 100%; border-collapse: collapse; font-size: 11px; }
#print-root table.print-table th, #print-root table.print-table td { border: 1px solid #94a3b8; padding: 4px 6px; }
#print-root table.print-table th { background: #e2e8f0; text-align: left; }
#print-root table.print-table .right { text-align: right; }
#print-root table.print-table .center { text-align: center; }
#print-root table.print-table .wrap { white-space: normal; }
#print-root .print-signatures { display: flex; gap: 24px; margin-top: 28px; }
#print-root .print-signature { flex: 1; }
#print-root .print-signature .line { border-top: 1px solid #000; padding-top: 4px; margin-top: 28px; }`;
  document.head.appendChild(r29PrintStyle);

  window.r29RenderMarkup = function () {
    var card = document.getElementById('r29Card');
    if (!card || card.getAttribute('data-ready')) return;
    card.innerHTML = `  <div id="r29App">
    <div class="topbar card">
      <div class="brand">
        <h1>Комм. зоны по ценовым сегментам</h1>
        <div class="subtitle">
          Загрузите <b>input1.xlsx</b> и <b>input2.xlsx</b>, выбирайте товары по ценовым сегментам,
          смотрите ТО, ВП и количество, отслеживайте дубли по товарным группам,
          добавляйте произвольные артикулы и печатайте документы.
        </div>
      </div>

      <div class="top-actions">
        <label class="btn file-btn">
          📂 input1.xlsx
          <input type="file" id="file1" accept=".xlsx,.xls,.csv" />
        </label>

        <label class="btn file-btn">
          📂 input2.xlsx
          <input type="file" id="file2" accept=".xlsx,.xls,.csv" />
        </label>

        <button id="saveJsonBtn" class="btn soft">💾 Сохранить выбор</button>
        <button id="loadJsonBtn" class="btn soft">📥 Загрузить выбор</button>
        <input type="file" id="fileJson" accept=".json,application/json" style="display:none" />

        <label class="select-label">
          ТО из отчёта
          <select id="toModeSelect" disabled>
            <option value="fact" selected>фактический ТО</option>
          </select>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="section-head">
        <h2>Состояние данных</h2>
      </div>

      <div id="status" class="status"></div>

      <div class="hint">
        Подсказка: клик по строке таблицы добавляет или убирает товар из текущей комм.зоны.
        Красная подсветка — цена товара отличается от текущей зоны.
        Оранжевая подсветка — товара нет в input1.
        Жёлтая подсветка и знак ⚠ — в input2 нет «Цены маг» или «Себестоимости», ВП товара не рассчитана (считается равной 0).
        ВП считается по формуле: <b>(Цена маг − Себестоимость) × Продано, шт</b>.
      </div>
    </div>

    <div class="card">
      <div class="section-head">
        <h2>Общая статистика выбранных товаров</h2>
        <button id="printAllSelectedBtn" class="btn small soft">🖨 Печать всех выбранных</button>
      </div>

      <div class="kpi-grid">
        <div class="kpi accent">
          <div class="label">Выбрано товаров</div>
          <div id="gCount" class="value">0</div>
        </div>

        <div class="kpi">
          <div class="label">ТО</div>
          <div id="gTO" class="value">0</div>
        </div>

        <div class="kpi">
          <div class="label">ВП</div>
          <div id="gVP" class="value">0</div>
        </div>

        <div class="kpi">
          <div class="label">Шт (продано)</div>
          <div id="gPieces" class="value">0</div>
        </div>
      </div>

      <details open>
        <summary>Разбивка по категориям</summary>
        <div class="table-wrap small" style="margin-top:10px;">
          <table>
            <thead>
              <tr>
                <th>Категория / цена</th>
                <th class="center">Выбрано товаров</th>
                <th class="right">ТО</th>
                <th class="right">ВП</th>
                <th class="right">Шт</th>
              </tr>
            </thead>
            <tbody id="breakdownBody"></tbody>
          </table>
        </div>
      </details>
    </div>

    <div class="card">
      <div class="section-head">
        <h2>Ценовые сегменты / комм.зоны</h2>
      </div>
      <div id="tabs" class="tabs"></div>
    </div>

    <div class="card">
      <div class="zone-header">
        <div>
          <h2 id="zoneTitle" class="zone-title">Текущая комм.зона</h2>
          <div id="zoneMeta" class="zone-meta"></div>
        </div>

        <div class="zone-actions">
          <button id="printSelectedBtn" class="btn small">🖨 Печать выбранных позиций</button>
          <button id="printCategoryBtn" class="btn small soft">🖨 Печать всей категории</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi accent">
          <div class="label">Выбрано в текущей зоне</div>
          <div id="zCount" class="value">0</div>
        </div>

        <div class="kpi">
          <div class="label">ТО текущей зоны</div>
          <div id="zTO" class="value">0</div>
        </div>

        <div class="kpi">
          <div class="label">ВП текущей зоны</div>
          <div id="zVP" class="value">0</div>
        </div>

        <div class="kpi">
          <div class="label">Шт текущей зоны</div>
          <div id="zPieces" class="value">0</div>
        </div>
      </div>
    </div>

    <div class="card" id="groupCard">
      <div class="section-head">
        <h2>Товарные группы выбранных</h2>
        <span id="groupSummary" class="muted"></span>
      </div>

      <div id="groupChips" class="chips" style="margin-top:0;"></div>
      <div id="vpIssueNote" class="hint"></div>

      <div class="hint">
        Счётчики общие для всех вкладок (ценовых сегментов).
        Красный чип — из одной группы выбрано 2 и более товаров (риск дублей по назначению).
        Клик по группе покажет, в какой вкладке и какие товары выбраны.
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="left">
          <input type="text" id="addCodeInput" placeholder="Введите артикул" />
          <button id="addCodeBtn" class="btn primary">➕ Добавить в текущую зону</button>
        </div>

        <div class="right-side">
          <input type="text" id="filterInput" placeholder="Фильтр по коду, товару или группе" />
          <button id="selectAllVisibleBtn" class="btn small soft">✅ Выбрать все видимые</button>
          <button id="clearZoneBtn" class="btn small danger-soft">🧹 Очистить текущую зону</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="center">✔</th>
              <th>Код</th>
              <th>Товар</th>
              <th>Группа</th>
              <th class="right">Цена</th>
              <th class="right">Цена маг, руб.</th>
              <th class="right">Цена тн, руб.</th>
              <th class="right">Себестоимость</th>
              <th class="right">Продано, шт</th>
              <th class="right">Склад, шт</th>
              <th class="right">ВП</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>

      <div id="chips" class="chips"></div>
    </div>
  </div>

  <div id="print-root" class="print-root"></div>

    <div id="groupModalOverlay" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-head">
        <h3 id="groupModalTitle">Группа</h3>
        <button id="groupModalClose" type="button" class="btn small soft">✕ Закрыть</button>
      </div>
      <div id="groupModalBody" class="modal-body"></div>
      <div class="modal-foot">
        <button id="groupModalClear" type="button" class="btn small danger-soft">U0001F9F9 Убрать всю группу из выбора</button>
        <span id="groupModalHint" class="muted"></span>
      </div>
    </div>
  </div>

  <div id="toast" class="toast"></div>`;
    card.setAttribute('data-ready', '1');
  };

  // ── Печать: переносим #print-root в портал в body и печатаем только его ──
  function r29DoPrint() {
    var c = document.getElementById('r29Card');
    var root = c ? c.querySelector('#print-root') : null;
    if (!root) return;
    var portal = document.getElementById('r29PrintPortal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'r29PrintPortal';
      document.body.appendChild(portal);
    }
    portal.innerHTML = '';
    portal.appendChild(root);
    document.body.classList.add('galamart-printing-r29');
    setTimeout(function () {
      window.print();
      document.body.classList.remove('galamart-printing-r29');
      if (root.parentNode === portal) c.appendChild(root);
    }, 80);
  }
  window.__r29DoPrint = r29DoPrint;

  window.r29Hide = function () {
    var c = document.getElementById('r29Card');
    if (c) c.classList.add('hidden');
  };

  window.r29Init = function () {
    var card = document.getElementById('r29Card');
    if (!card) return;
        const $ = (id) => { const el = document.getElementById(id); return el && card.contains(el) ? el : card.querySelector('#' + CSS.escape(id)); };

        const state = {
          raw1: null,
          raw2: null,

          items: new Map(),           // code -> item
          zones: [],                  // [{key,label,price,sort}]
          zonesByKey: new Map(),      // key -> zone
          nativeByZone: new Map(),    // zoneKey -> [codes]
          nativeSetByZone: new Map(), // zoneKey -> Set(codes)

          selection: new Map(),       // zoneKey -> Set(codes)

          activeZoneKey: null,
          toMode: 'fact',             // zone | item | tn
          filter: '',

          hasGroupCols: false,        // найдены ли «Группа 1/2/3» в input2
          groupModal: { open: false, name: null }
        };

        const NO_GROUP_LABEL = 'Без группы';

        /***********************
         * Utilities
         ***********************/

        function escapeHtml(value) {
          return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          }[ch]));
        }

        function safeNum(value) {
          const n = Number(value);
          return isFinite(n) ? n : 0;
        }

        function fmtNum(value, maxDigits = 2) {
          const n = safeNum(value);
          return n.toLocaleString('ru-RU', { maximumFractionDigits: maxDigits });
        }

        function fmtInt(value) {
          return fmtNum(value, 0);
        }

        function fmtCellNum(value) {
          if (value === null || value === undefined || value === '' || !isFinite(Number(value))) return '';
          return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
        }

        function cleanCode(value) {
          let s = String(value ?? '').trim();

          if (/^\d+\.0$/.test(s)) {
            s = s.replace(/\.0$/, '');
          }

          return s;
        }

        function getVpIssueText(hasMag, hasCost) {
          if (!hasMag && !hasCost) {
            return 'Нет данных «Цена маг» и «Себестоимость» — ВП не рассчитана (считается равной 0)';
          }
          if (!hasMag) {
            return 'Нет данных «Цена маг» — ВП не рассчитана (считается равной 0)';
          }
          return 'Нет данных «Себестоимость» — ВП не рассчитана (считается равной 0)';
        }

        function getItemGroupLabel(item) {
          if (!item) return '';
          return String(item.group3 || item.group2 || item.group1 || '').trim();
        }

        function getItemGroupHierarchy(item) {
          if (!item) return '';
          return [item.group1, item.group2, item.group3]
            .map(g => String(g || '').trim())
            .filter(Boolean)
            .join(' / ');
        }

        function toNumber(value) {
          if (value == null || value === '') return NaN;
          if (typeof value === 'number') return isFinite(value) ? value : NaN;

          let s = String(value).trim();
          if (!s) return NaN;

          s = s.replace(/\s/g, '');

          // минус в бухгалтерском формате: (1 234,50)
          let sign = 1;
          if (/^\(.*\)$/.test(s)) {
            sign = -1;
            s = s.slice(1, -1);
          }

          // юникодный минус − (U+2212)
          s = s.replace(/\u2212/g, '-');

          if (s.includes(',') && s.includes('.')) {
            const lastComma = s.lastIndexOf(',');
            const lastDot = s.lastIndexOf('.');

            if (lastComma > lastDot) {
              s = s.replace(/\./g, '').replace(',', '.');
            } else {
              s = s.replace(/,/g, '');
            }
          } else if (s.includes(',')) {
            const parts = s.split(',');

            if (parts.length > 2) {
              s = s.replace(/,/g, '');
            } else if (/,\d{3}$/.test(s)) {
              s = s.replace(/,/g, '');
            } else {
              s = s.replace(',', '.');
            }
          }

          const n = parseFloat(s);
          if (!isFinite(n)) return NaN;
          return sign === -1 ? -n : n;
        }

        function normalizePriceValue(value) {
          if (typeof value === 'number' && !isFinite(value)) {
            return { key: 'Без цены', label: 'Без цены', price: null, sort: null };
          }

          const num = toNumber(value);

          if (!isFinite(num)) {
            const s = String(value ?? '').trim();
            if (!s || s.toLowerCase() === 'nan') {
              return { key: 'Без цены', label: 'Без цены', price: null, sort: null };
            }
            return { key: s, label: s, price: null, sort: null };
          }

          if (Number.isInteger(num)) {
            const label = String(num);
            return { key: label, label, price: num, sort: num };
          }

          const label = String(num);
          return { key: label, label, price: num, sort: num };
        }

        function normHeader(value) {
          return String(value ?? '').toLowerCase().trim();
        }

        function getRowValue(row, index) {
          if (index < 0 || !row) return '';
          return row[index] ?? '';
        }

        function findCol(headers, keywords, exact = []) {
          const exactLower = exact.map(x => String(x).toLowerCase().trim());

          for (let i = 0; i < headers.length; i++) {
            if (exactLower.includes(headers[i])) return i;
          }

          const keywordsLower = keywords.map(x => String(x).toLowerCase().trim());

          for (let i = 0; i < headers.length; i++) {
            const h = headers[i] || '';
            if (keywordsLower.some(k => h.includes(k))) return i;
          }

          return -1;
        }

        function showToast(message) {
          const toast = $('toast');
          toast.textContent = message;
          toast.classList.add('show');

          clearTimeout(showToast._timer);
          showToast._timer = setTimeout(() => {
            toast.classList.remove('show');
          }, 2600);
        }

        /***********************
         * Excel reading
         ***********************/

        async function readWorksheetRows(file) {
          if (typeof XLSX === 'undefined') {
            throw new Error('Не загрузился SheetJS. Проверьте интернет или подключите xlsx.full.min.js локально.');
          }

          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });

          const sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error('В файле нет листов');

          const worksheet = workbook.Sheets[sheetName];

          return XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: false
          });
        }

        /***********************
         * Header detection
         ***********************/

        function findHeaderInput1(rows) {
          let bestIndex = -1;
          let bestScore = 0;

          const limit = Math.min(rows.length, 200);

          for (let i = 0; i < limit; i++) {
            const headers = (rows[i] || []).map(normHeader);

            const colCode = findCol(headers, ['код', 'артикул', 'sku'], ['код']);
            const colPrice = findCol(headers, ['цена'], ['цена']);
            const colTovar = findCol(headers, ['товар', 'название', 'наименование', 'name'], []);

            if (colCode >= 0 && colPrice >= 0) {
              let score = 2;
              if (colTovar >= 0) score += 1;

              if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
              }
            }
          }

          return bestIndex;
        }

        function scoreInput2Header(headers) {
          const colCode = findCol(headers, ['код', 'артикул', 'sku'], ['код']);
          if (colCode < 0) return -1;

          const colPriceTn = findCol(
            headers,
            ['цена тн'],
            ['цена тн, руб.', 'цена тн, руб', 'цена тн', 'цена тн руб']
          );

          const colPriceMag = findCol(
            headers,
            ['цена маг'],
            ['цена маг, руб.', 'цена маг, руб', 'цена маг. руб.', 'цена маг руб']
          );

          const colCost = findCol(headers, ['себ', 'себестоимость'], []);
          const colFactTO = headers.findIndex(h => /^то[,]?\s*руб[.]?$/.test(h));
          const colFactCost = headers.findIndex(h => /^то\s*сс[,]?\s*руб[.]?$/.test(h));
          const colSold = findCol(headers, ['продано'], []);
          const colStock = findCol(headers, ['склад'], ['склад кол', 'склад']);

          const extra = [colPriceTn, colPriceMag, colCost, colSold, colStock]
            .filter((value, index, arr) => value >= 0 && arr.indexOf(value) === index)
            .length;

          return 1 + extra;
        }

        function findHeaderInput2(rows) {
          let bestIndex = -1;
          let bestScore = 0;

          const limit = Math.min(rows.length, 200);

          for (let i = 0; i < limit; i++) {
            const headers = (rows[i] || []).map(normHeader);
            const score = scoreInput2Header(headers);

            if (score >= 4 && score > bestScore) {
              bestScore = score;
              bestIndex = i;
            }
          }

          if (bestIndex >= 0) return bestIndex;

          bestScore = 0;
          for (let i = 0; i < limit; i++) {
            const headers = (rows[i] || []).map(normHeader);
            const score = scoreInput2Header(headers);

            if (score >= 2 && score > bestScore) {
              bestScore = score;
              bestIndex = i;
            }
          }

          if (bestIndex >= 0) return bestIndex;

          return rows.length > 2 ? 2 : -1;
        }

        /***********************
         * Parse input1 / input2
         ***********************/

        function parseInput1(rows, errors) {
          const headerIndex = findHeaderInput1(rows);

          if (headerIndex < 0) {
            errors.push('input1: не удалось найти таблицу');
            return false;
          }

          const headers = (rows[headerIndex] || []).map(normHeader);

          const colCode = findCol(headers, ['код', 'артикул', 'sku'], ['код']);
          const colTovar = findCol(headers, ['товар', 'название', 'наименование', 'name'], []);
          const colPrice = findCol(headers, ['цена'], ['цена']);

          if (colCode < 0) {
            errors.push('input1: не найдена колонка Код');
            return false;
          }

          if (colPrice < 0) {
            errors.push('input1: не найдена колонка Цена');
            return false;
          }

          for (let r = headerIndex + 1; r < rows.length; r++) {
            const row = rows[r] || [];

            const code = cleanCode(getRowValue(row, colCode));
            if (!code) continue;

            const name = colTovar >= 0 ? String(getRowValue(row, colTovar) ?? '').trim() : '';
            const priceRaw = getRowValue(row, colPrice);
            const priceNorm = normalizePriceValue(priceRaw);

            const item = {
              code,
              name,
              inInput1: true,
              price: priceNorm.price,
              priceKey: priceNorm.key,
              nativeZoneKey: priceNorm.key,

              priceMag: null,
              priceTn: null,
              cost: null,
              sold: 0,
              stock: 0,
              factTO: 0,
            vp: 0,
              vpIssue: false,
              vpIssueText: '',

              group1: '',
              group2: '',
              group3: '',
              group: '',

              _input2Applied: false
            };

            const existing = state.items.get(code);
            if (existing) {
              Object.assign(existing, item);
            } else {
              state.items.set(code, item);
            }
          }

          return true;
        }

        function parseInput2(rows, errors) {
          const headerIndex = findHeaderInput2(rows);

          if (headerIndex < 0) {
            errors.push('input2: не удалось найти таблицу');
            return false;
          }

          const headers = (rows[headerIndex] || []).map(normHeader);

          const colCode = findCol(headers, ['код', 'артикул', 'sku'], ['код']);

          const colPriceTn = findCol(
            headers,
            ['цена тн'],
            ['цена тн, руб.', 'цена тн, руб', 'цена тн', 'цена тн руб']
          );

          const colPriceMag = findCol(
            headers,
            ['цена маг'],
            ['цена маг, руб.', 'цена маг, руб', 'цена маг. руб.', 'цена маг руб']
          );

          const colCost = findCol(headers, ['себ', 'себестоимость'], []);
          const colFactTO = headers.findIndex(h => /^то[,]?\s*руб[.]?$/.test(h));
          const colFactCost = headers.findIndex(h => /^то\s*сс[,]?\s*руб[.]?$/.test(h));
          const colSold = findCol(headers, ['продано'], []);
          const colStock = findCol(headers, ['склад'], ['склад кол', 'склад']);
          const colName = findCol(headers, ['товар', 'название', 'наименование', 'name'], []);

          const colG1 = findCol(headers, ['группа 1', 'группа1', 'group 1'], ['группа 1', 'группа1']);
          const colG2 = findCol(headers, ['группа 2', 'группа2', 'group 2'], ['группа 2', 'группа2']);
          const colG3 = findCol(headers, ['группа 3', 'группа3', 'group 3'], ['группа 3', 'группа3']);

          state.hasGroupCols = colG1 >= 0 || colG2 >= 0 || colG3 >= 0;

          if (colCode < 0) {
            errors.push('input2: не найдена колонка Код');
            return false;
          }

          const hasAnyUseful = [colPriceTn, colPriceMag, colCost, colSold, colStock]
            .some(index => index >= 0);

          if (!hasAnyUseful) {
            errors.push('input2: не найдены полезные колонки (цена, себестоимость, продано, склад и т.п.)');
            return false;
          }

          for (let r = headerIndex + 1; r < rows.length; r++) {
            const row = rows[r] || [];

            const code = cleanCode(getRowValue(row, colCode));
            if (!code) continue;

            const priceTn = toNumber(getRowValue(row, colPriceTn));
            const priceMag = toNumber(getRowValue(row, colPriceMag));
            const cost = toNumber(getRowValue(row, colCost));
            const sold = toNumber(getRowValue(row, colSold));
            const stock = toNumber(getRowValue(row, colStock));
            const name2 = colName >= 0 ? String(getRowValue(row, colName) ?? '').trim() : '';

            const g1 = colG1 >= 0 ? String(getRowValue(row, colG1) ?? '').trim() : '';
            const g2 = colG2 >= 0 ? String(getRowValue(row, colG2) ?? '').trim() : '';
            const g3 = colG3 >= 0 ? String(getRowValue(row, colG3) ?? '').trim() : '';

            const soldZero = isFinite(sold) ? sold : 0;
            const stockZero = isFinite(stock) ? stock : 0;

            // ВП = (Цена маг − Себестоимость) × Продано.
            // Если данных не хватает и были продажи — ВП не считаем (0) и помечаем товар.
            const factTO = toNumber(getRowValue(row, colFactTO));
            const factCost = toNumber(getRowValue(row, colFactCost));
            let vpRow = 0;
            let rowIssue = '';

            if (isFinite(factTO) && isFinite(factCost)) vpRow = factTO - factCost;
            else rowIssue = 'Нет фактического ТО или ТО СС в отчёте';

            let item = state.items.get(code);

            if (!item) {
              const priceForZone = isFinite(priceMag) ? priceMag : (isFinite(priceTn) ? priceTn : NaN);
              const priceNorm = normalizePriceValue(priceForZone);

              item = {
                code,
                name: name2 || '',
                inInput1: false,

                price: priceNorm.price,
                priceKey: priceNorm.key,
                nativeZoneKey: priceNorm.key,

                priceMag: isFinite(priceMag) ? priceMag : null,
                priceTn: isFinite(priceTn) ? priceTn : null,
                cost: isFinite(cost) ? cost : null,

                sold: 0,
                stock: 0,
                factTO: 0,
            vp: 0,
                vpIssue: false,
                vpIssueText: '',

                group1: '',
                group2: '',
                group3: '',
                group: '',

                _input2Applied: false
              };

              state.items.set(code, item);
            }

            if (!item._input2Applied) {
              item._input2Applied = true;
              item.sold = 0;
              item.stock = 0;
              item.vp = 0;
              item.factTO = 0;
              item.vpIssue = false;
              item.vpIssueText = '';
            }

            if (item.priceMag == null && isFinite(priceMag)) item.priceMag = priceMag;
            if (item.priceTn == null && isFinite(priceTn)) item.priceTn = priceTn;
            if (item.cost == null && isFinite(cost)) item.cost = cost;

            if (!item.name && name2) {
              item.name = name2;
            }

            if (!item.group1 && g1) item.group1 = g1;
            if (!item.group2 && g2) item.group2 = g2;
            if (!item.group3 && g3) item.group3 = g3;
            item.group = getItemGroupLabel(item);

            if ((item.price == null || !isFinite(item.price)) && isFinite(priceMag)) {
              const priceNorm = normalizePriceValue(priceMag);
              item.price = priceNorm.price;
              item.priceKey = priceNorm.key;
              item.nativeZoneKey = priceNorm.key;
            }

            item.sold += soldZero;
            item.stock += stockZero;
            item.vp += vpRow;
            item.factTO = (item.factTO || 0) + (isFinite(factTO) ? factTO : 0);

            if (rowIssue) {
              item.vpIssue = true;
              item.vpIssueText = rowIssue;
            }
          }

          return true;
        }

        /***********************
         * Data rebuilding
         ***********************/

        function rebuildData() {
          if (!state.raw1 || !state.raw2) {
            renderAll();
            updateStatus((state.raw1 || state.raw2) ? 'Ожидание второго файла...' : '');
            return;
          }

          state.items.clear();
          state.hasGroupCols = false;

          const errors = [];

          const ok1 = parseInput1(state.raw1, errors);
          const ok2 = parseInput2(state.raw2, errors);

          if (!ok1 || !ok2) {
            renderAll();
            updateStatus(errors.join(' | '));
            return;
          }

          for (const set of state.selection.values()) {
            for (const code of set) {
              ensureItemForCode(code);
            }
          }

          normalizeSelectionKeys();
          buildZones();
          buildNativeByZone();
          ensureSelectionForZones();

          if (!state.activeZoneKey || !state.zonesByKey.has(state.activeZoneKey)) {
            state.activeZoneKey = state.zones[0]?.key ?? null;
          }

          renderAll();
          updateStatus('Данные готовы');
        }

        /***********************
         * Selection / zones
         ***********************/

        function normalizeSelectionKeys() {
          const codeToZone = new Map();

          for (const [zoneKey, set] of state.selection.entries()) {
            const normZone = normalizePriceValue(zoneKey).key;

            for (const codeRaw of set) {
              const code = cleanCode(codeRaw);
              if (!code) continue;

              codeToZone.set(code, normZone);
            }
          }

          const newSelection = new Map();

          for (const [code, zoneKey] of codeToZone.entries()) {
            if (!newSelection.has(zoneKey)) {
              newSelection.set(zoneKey, new Set());
            }
            newSelection.get(zoneKey).add(code);
          }

          state.selection = newSelection;
        }

        function ensureZoneByKey(rawKey) {
          const norm = normalizePriceValue(rawKey);
          const key = norm.key;

          if (!state.zonesByKey.has(key)) {
            const zone = {
              key,
              label: norm.label,
              price: norm.price,
              sort: norm.sort
            };

            state.zonesByKey.set(key, zone);
            state.zones.push(zone);
          }

          return state.zonesByKey.get(key);
        }

        function sortZones() {
          state.zones.sort((a, b) => {
            const aNull = a.sort == null ? 1 : 0;
            const bNull = b.sort == null ? 1 : 0;

            if (aNull !== bNull) return aNull - bNull;
            if (a.sort != null && b.sort != null) return a.sort - b.sort;

            return String(a.label).localeCompare(String(b.label), 'ru');
          });
        }

        function buildZones() {
          state.zones = [];
          state.zonesByKey.clear();

          for (const item of state.items.values()) {
            if (item.inInput1) {
              ensureZoneByKey(item.price ?? item.priceKey ?? null);
            }
          }

          if (state.zones.length === 0) {
            ensureZoneByKey('Без цены');
          }

          for (const zoneKey of state.selection.keys()) {
            ensureZoneByKey(zoneKey);
          }

          sortZones();
        }

        function buildNativeByZone() {
          state.nativeByZone.clear();
          state.nativeSetByZone.clear();

          for (const zone of state.zones) {
            state.nativeByZone.set(zone.key, []);
            state.nativeSetByZone.set(zone.key, new Set());
          }

          for (const item of state.items.values()) {
            const zoneKey = item.nativeZoneKey;

            if (zoneKey && state.nativeSetByZone.has(zoneKey)) {
              state.nativeByZone.get(zoneKey).push(item.code);
              state.nativeSetByZone.get(zoneKey).add(item.code);
            }
          }

          for (const [, codes] of state.nativeByZone.entries()) {
            codes.sort(compareCodesByVp);
          }
        }

        function ensureSelectionForZones() {
          for (const zone of state.zones) {
            if (!state.selection.has(zone.key)) {
              state.selection.set(zone.key, new Set());
            }
          }
        }

        function ensureItemForCode(codeRaw) {
          const code = cleanCode(codeRaw);

          if (state.items.has(code)) {
            return state.items.get(code);
          }

          const item = {
            code,
            name: '(нет в исходных данных)',
            inInput1: false,

            price: null,
            priceKey: null,
            nativeZoneKey: null,

            priceMag: null,
            priceTn: null,
            cost: null,

            sold: 0,
            stock: 0,
            factTO: 0,
            vp: 0,
            vpIssue: false,
            vpIssueText: '',

            group1: '',
            group2: '',
            group3: '',
            group: '',

            _input2Applied: false
          };

          state.items.set(code, item);
          return item;
        }

        function removeCodeFromAllZones(codeRaw) {
          const code = cleanCode(codeRaw);

          for (const set of state.selection.values()) {
            set.delete(code);
          }
        }

        function addCodeToZone(codeRaw, zoneKeyRaw) {
          const code = cleanCode(codeRaw);
          if (!code) return;

          const zone = ensureZoneByKey(zoneKeyRaw);
          ensureItemForCode(code);

          removeCodeFromAllZones(code);

          if (!state.selection.has(zone.key)) {
            state.selection.set(zone.key, new Set());
          }

          state.selection.get(zone.key).add(code);
        }

        function toggleCodeInActiveZone(codeRaw) {
          if (!state.activeZoneKey) return;

          const code = cleanCode(codeRaw);
          const activeSet = state.selection.get(state.activeZoneKey) || new Set();

          if (activeSet.has(code)) {
            removeCodeFromAllZones(code);
          } else {
            addCodeToZone(code, state.activeZoneKey);
          }
        }

        /***********************
         * Stats
         ***********************/

        function getToModeLabel() { return 'факт из отчёта'; }
        function getItemTO(item) { return safeNum(item?.factTO); }

        function computeZoneStats(zoneKey) {
          const set = state.selection.get(zoneKey) || new Set();

          let count = 0;
          let to = 0;
          let vp = 0;
          let pieces = 0;

          for (const code of set) {
            const item = ensureItemForCode(code);

            count += 1;
            to += getItemTO(item, zoneKey);
            vp += safeNum(item.vp);
            pieces += safeNum(item.sold);
          }

          return { count, to, vp, pieces };
        }

        function computeRowsTotals(codes, zoneKey) {
          let count = 0;
          let to = 0;
          let vp = 0;
          let pieces = 0;

          for (const code of codes) {
            const item = ensureItemForCode(code);

            count += 1;
            to += getItemTO(item, zoneKey);
            vp += safeNum(item.vp);
            pieces += safeNum(item.sold);
          }

          return { count, to, vp, pieces };
        }

        /***********************
         * Rendering
         ***********************/

        function updateStatus(extra = '') {
          const parts = [];

          if (typeof XLSX === 'undefined') {
            parts.push('❌ Не загрузился SheetJS через CDN. Нужен интернет или локальный файл библиотеки.');
          }

          parts.push(state.raw1 ? '✅ input1 загружен' : '⚪ input1 не загружен');
          parts.push(state.raw2 ? '✅ input2 загружен' : '⚪ input2 не загружен');

          if (state.raw1 && state.raw2) {
            parts.push(`Товаров в памяти: ${state.items.size}`);
            parts.push(
              state.hasGroupCols
                ? '✅ В input2 найдены колонки товарных групп («Группа 1/2/3»)'
                : '⚠ В input2 не найдены колонки «Группа 1/2/3» — счётчики групп работать не будут'
            );
          }

          if (extra) {
            parts.push(extra);
          }

          $('status').innerHTML = parts
            .map(p => `<div>${escapeHtml(p)}</div>`)
            .join('');
        }

        function renderTabs() {
          const tabsEl = $('tabs');
          tabsEl.innerHTML = '';

          if (!state.zones.length) {
            tabsEl.innerHTML = '<span class="muted">Пока нет ценовых сегментов. Загрузите оба файла.</span>';
            return;
          }

          for (const zone of state.zones) {
            const count = state.selection.get(zone.key)?.size || 0;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tab' + (zone.key === state.activeZoneKey ? ' active' : '');

            const label = document.createElement('span');
            label.textContent = zone.label;

            btn.appendChild(label);

            if (count > 0) {
              const badge = document.createElement('span');
              badge.className = 'badge';
              badge.textContent = String(count);
              btn.appendChild(badge);
            }

            btn.addEventListener('click', () => {
              state.activeZoneKey = zone.key;
              renderAll();
            });

            tabsEl.appendChild(btn);
          }
        }

        function renderTopStats() {
          let total = { count: 0, to: 0, vp: 0, pieces: 0 };
          const rows = [];

          for (const zone of state.zones) {
            const stats = computeZoneStats(zone.key);

            if (stats.count > 0) {
              rows.push({ zone, stats });

              total.count += stats.count;
              total.to += stats.to;
              total.vp += stats.vp;
              total.pieces += stats.pieces;
            }
          }

          $('gCount').textContent = fmtInt(total.count);
          $('gTO').textContent = fmtNum(total.to);
          $('gVP').textContent = fmtNum(total.vp);
          $('gPieces').textContent = fmtInt(total.pieces);

          const tbody = $('breakdownBody');

          if (!rows.length) {
            tbody.innerHTML = `
              <tr>
                <td colspan="5" class="muted">Нет выбранных товаров</td>
              </tr>
            `;
            return;
          }

          tbody.innerHTML = rows.map(({ zone, stats }) => {
            return `
              <tr>
                <td>${escapeHtml(zone.label)}</td>
                <td class="center">${fmtInt(stats.count)}</td>
                <td class="right">${fmtNum(stats.to)}</td>
                <td class="right">${fmtNum(stats.vp)}</td>
                <td class="right">${fmtInt(stats.pieces)}</td>
              </tr>
            `;
          }).join('');
        }

        function renderCurrentTabStats() {
          const zone = state.activeZoneKey ? state.zonesByKey.get(state.activeZoneKey) : null;

          if (!zone) {
            $('zoneTitle').textContent = 'Текущая комм.зона';
            $('zCount').textContent = '0';
            $('zTO').textContent = '0';
            $('zVP').textContent = '0';
            $('zPieces').textContent = '0';
            $('zoneMeta').textContent = 'Зона не выбрана';
            return;
          }

          const stats = computeZoneStats(zone.key);
          const nativeCount = state.nativeByZone.get(zone.key)?.length || 0;

          $('zoneTitle').textContent = `Текущая комм.зона: ${zone.label}`;

          $('zCount').textContent = fmtInt(stats.count);
          $('zTO').textContent = fmtNum(stats.to);
          $('zVP').textContent = fmtNum(stats.vp);
          $('zPieces').textContent = fmtInt(stats.pieces);

          $('zoneMeta').innerHTML = `
            Цена зоны: <b>${fmtCellNum(zone.price) || '—'}</b><br />
            Товаров в категории всего: <b>${fmtInt(nativeCount)}</b><br />
            Режим расчёта ТО: <b>${escapeHtml(getToModeLabel())}</b>
          `;
        }

        function compareCodesByVp(a, b) {
          const itemA = state.items.get(a) || {};
          const itemB = state.items.get(b) || {};

          const vpDiff = safeNum(itemB.vp) - safeNum(itemA.vp);
          if (vpDiff !== 0) return vpDiff;

          return String(a).localeCompare(String(b), 'ru');
        }

        function getVisibleCodesForActiveZone() {
          if (!state.activeZoneKey) return [];

          const nativeSet = state.nativeSetByZone.get(state.activeZoneKey) || new Set();
          const nativeArr = state.nativeByZone.get(state.activeZoneKey) || [];
          const selectedSet = state.selection.get(state.activeZoneKey) || new Set();

          const externalSelected = [...selectedSet].filter(code => !nativeSet.has(code));

          let codes = [...nativeArr, ...externalSelected];

          const filter = state.filter.trim().toLowerCase();

          if (filter) {
            codes = codes.filter(code => {
              const item = state.items.get(code) || ensureItemForCode(code);

              return String(code).toLowerCase().includes(filter) ||
                     String(item.name || '').toLowerCase().includes(filter) ||
                     String(item.group || '').toLowerCase().includes(filter);
            });
          }

          codes.sort(compareCodesByVp);

          return codes;
        }

        function getItemHighlightClass(item) {
          if (!item) return '';

          if (!item.inInput1) return 'row-orange';

          if (state.activeZoneKey && item.nativeZoneKey !== state.activeZoneKey) {
            return 'row-red';
          }

          return '';
        }

        function renderTable() {
          const tbody = $('tableBody');

          if (!state.activeZoneKey) {
            tbody.innerHTML = `
              <tr>
                <td colspan="11" class="muted">Нет активной комм.зоны. Загрузите файлы.</td>
              </tr>
            `;
            return;
          }

          const codes = getVisibleCodesForActiveZone();
          const selectedSet = state.selection.get(state.activeZoneKey) || new Set();

          if (!codes.length) {
            tbody.innerHTML = `
              <tr>
                <td colspan="11" class="muted">В этой зоне пока нет товаров для отображения.</td>
              </tr>
            `;
            return;
          }

          const html = codes.map(code => {
            const item = state.items.get(code) || ensureItemForCode(code);
            const isSelected = selectedSet.has(code);

            const classes = [];
            if (item.vpIssue) classes.push('row-vp-issue');
            if (isSelected) classes.push('row-selected');

            const highlight = getItemHighlightClass(item);
            if (highlight) classes.push(highlight);

            const groupHierarchy = getItemGroupHierarchy(item);
            const groupCell = item.group
              ? `<td title="${escapeHtml(groupHierarchy)}">${escapeHtml(item.group)}</td>`
              : `<td class="muted" title="${escapeHtml(groupHierarchy)}">—</td>`;

            const vpCell = item.vpIssue
              ? `<td class="right" title="${escapeHtml(item.vpIssueText || '')}">⚠ —</td>`
              : `<td class="right">${fmtCellNum(item.vp)}</td>`;

            return `
              <tr data-code="${escapeHtml(code)}" class="${classes.join(' ')}">
                <td class="center">${isSelected ? '✔' : ''}</td>
                <td>${escapeHtml(code)}</td>
                <td>${escapeHtml(item.name || '')}</td>
                ${groupCell}
                <td class="right">${fmtCellNum(item.price)}</td>
                <td class="right">${fmtCellNum(item.priceMag)}</td>
                <td class="right">${fmtCellNum(item.priceTn)}</td>
                <td class="right">${fmtCellNum(item.cost)}</td>
                <td class="right">${fmtCellNum(item.sold)}</td>
                <td class="right">${fmtCellNum(item.stock)}</td>
                ${vpCell}
              </tr>
            `;
          }).join('');

          tbody.innerHTML = html;
        }

        function renderChips() {
          const chipsEl = $('chips');

          if (!state.activeZoneKey) {
            chipsEl.innerHTML = '';
            return;
          }

          const selectedSet = state.selection.get(state.activeZoneKey) || new Set();

          if (!selectedSet.size) {
            chipsEl.innerHTML = '<span class="muted">В текущей зоне нет выбранных товаров.</span>';
            return;
          }

          const codes = [...selectedSet].sort((a, b) => String(a).localeCompare(String(b), 'ru'));

          chipsEl.innerHTML = codes.map(code => {
            const item = state.items.get(code) || ensureItemForCode(code);

            let cls = 'chip';

            if (!item.inInput1) {
              cls += ' chip-orange';
            } else if (item.nativeZoneKey !== state.activeZoneKey) {
              cls += ' chip-red';
            }

            const title = item.name ? `${code} — ${item.name}` : code;

            return `
              <span class="${cls}" data-code="${escapeHtml(code)}" title="${escapeHtml(title)}">
                ${escapeHtml(code)} ✕
              </span>
            `;
          }).join('');
        }

        function renderAll() {
          renderTabs();
          renderTopStats();
          renderCurrentTabStats();
          renderGroupBar();
          renderTable();
          renderChips();

          if (state.groupModal.open) {
            renderGroupModal();
          }
        }

        /***********************
         * Товарные группы (глобальный счётчик)
         ***********************/

        function collectSelectedEntries() {
          const entries = [];

          for (const zone of state.zones) {
            const set = state.selection.get(zone.key);
            if (!set || !set.size) continue;

            for (const code of set) {
              const item = ensureItemForCode(code);
              entries.push({ code, item, zone });
            }
          }

          return entries;
        }

        function computeGroupBuckets(entries) {
          const map = new Map();

          for (const entry of entries) {
            const group = String(entry.item.group || '').trim() || NO_GROUP_LABEL;

            if (!map.has(group)) {
              map.set(group, []);
            }
            map.get(group).push(entry);
          }

          return map;
        }

        function renderGroupBar() {
          const chipsEl = $('groupChips');
          const summaryEl = $('groupSummary');
          const noteEl = $('vpIssueNote');

          const entries = collectSelectedEntries();

          const issueCount = entries.filter(entry => entry.item.vpIssue).length;
          noteEl.innerHTML = issueCount
            ? `⚠ Товаров с неполными данными для ВП среди выбранных: <b>${fmtInt(issueCount)}</b> — итоги ТО/ВП неполные. Загрузите отчёт с колонками «ТО, руб» и «ТО СС, руб» (жёлтые строки).`
            : '';

          if (!entries.length) {
            summaryEl.textContent = '';
            chipsEl.innerHTML = '<span class="muted">Пока нет выбранных товаров. Выберите товары в любой вкладке — здесь появятся счётчики товарных групп.</span>';
            return;
          }

          if (!state.raw2 || !state.hasGroupCols) {
            summaryEl.textContent = `Выбрано товаров: ${fmtInt(entries.length)}`;
            chipsEl.innerHTML = '<span class="muted">В input2 не найдены колонки «Группа 1 / Группа 2 / Группа 3» — счётчики групп недоступны.</span>';
            return;
          }

          const buckets = computeGroupBuckets(entries);

          const groups = [...buckets.entries()].sort((a, b) => {
            const aNoGroup = a[0] === NO_GROUP_LABEL ? 1 : 0;
            const bNoGroup = b[0] === NO_GROUP_LABEL ? 1 : 0;

            if (aNoGroup !== bNoGroup) return aNoGroup - bNoGroup;
            if (b[1].length !== a[1].length) return b[1].length - a[1].length;

            return String(a[0]).localeCompare(String(b[0]), 'ru');
          });

          const namedCount = groups.filter(([name]) => name !== NO_GROUP_LABEL).length;
          summaryEl.textContent = `Выбрано товаров: ${fmtInt(entries.length)} · Групп: ${fmtInt(namedCount)}`;

          chipsEl.innerHTML = groups.map(([name, list]) => {
            let cls = 'chip';

            if (list.length >= 2) cls += ' chip-red';
            if (name === NO_GROUP_LABEL) cls += ' chip-muted';

            const title = list.length >= 2
              ? 'Из этой группы выбрано несколько товаров — нажмите, чтобы проверить на дубли'
              : 'Нажмите, чтобы посмотреть, где выбран товар этой группы';

            return `
              <button type="button" class="${cls}" data-group="${escapeHtml(name)}" title="${escapeHtml(title)}">
                ${escapeHtml(name)}: <span class="badge">${fmtInt(list.length)}</span>
              </button>
            `;
          }).join('');
        }

        function openGroupModal(name) {
          state.groupModal.open = true;
          state.groupModal.name = name;

          renderGroupModal();

          if (state.groupModal.open) {
            $('groupModalOverlay').classList.add('show');
          }
        }

        function closeGroupModal() {
          state.groupModal.open = false;
          state.groupModal.name = null;
          $('groupModalOverlay').classList.remove('show');
        }

        function renderGroupModal() {
          const name = state.groupModal.name;

          const entries = collectSelectedEntries();
          const buckets = computeGroupBuckets(entries);
          const list = buckets.get(name) || [];

          if (!list.length) {
            closeGroupModal();
            return;
          }

          $('groupModalTitle').textContent = name === NO_GROUP_LABEL
            ? 'Товары без группы'
            : `Группа: ${name}`;

          $('groupModalClear').textContent = `🧹 Убрать всю группу из выбора (${list.length})`;
          $('groupModalHint').textContent = '«Перейти» открывает вкладку товара, ✕ убирает товар из выбора.';

          const rowsHtml = list.map((entry, index) => {
            const hierarchy = getItemGroupHierarchy(entry.item) || '—';
            const price = entry.item.price ?? entry.item.priceMag ?? entry.item.priceTn ?? null;

            const vpCell = entry.item.vpIssue
              ? `<td class="right" title="${escapeHtml(entry.item.vpIssueText || '')}">⚠ —</td>`
              : `<td class="right">${fmtCellNum(entry.item.vp)}</td>`;

            return `
              <tr>
                <td class="center">${index + 1}</td>
                <td>${escapeHtml(entry.zone.label)}</td>
                <td>${escapeHtml(entry.code)}</td>
                <td>${escapeHtml(entry.item.name || '')}</td>
                <td class="muted">${escapeHtml(hierarchy)}</td>
                <td class="right">${fmtCellNum(price)}</td>
                ${vpCell}
                <td class="center" style="white-space:nowrap;">
                  <button type="button" class="btn small soft" data-action="goto" data-zone="${escapeHtml(entry.zone.key)}">📍 Перейти</button>
                  <button type="button" class="btn small danger-soft" data-action="remove" data-code="${escapeHtml(entry.code)}" title="Убрать из выбора">✕</button>
                </td>
              </tr>
            `;
          }).join('');

          $('groupModalBody').innerHTML = `
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Вкладка (зона)</th>
                  <th>Код</th>
                  <th>Товар</th>
                  <th>Иерархия групп</th>
                  <th class="right">Цена</th>
                  <th class="right">ВП</th>
                  <th class="center">Действия</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          `;
        }

        function removeGroupFromSelection(name) {
          const entries = collectSelectedEntries();
          const buckets = computeGroupBuckets(entries);
          const list = buckets.get(name) || [];

          for (const entry of list) {
            removeCodeFromAllZones(entry.code);
          }

          return list.length;
        }

        /***********************
         * JSON save / load
         ***********************/

        function saveSelectionToJson() {
          const payload = {
            version: 1,
            savedAt: new Date().toISOString(),
            toMode: state.toMode,
            activeZoneKey: state.activeZoneKey,
            selection: {}
          };

          for (const [zoneKey, set] of state.selection.entries()) {
            if (set.size > 0) {
              payload.selection[zoneKey] = [...set];
            }
          }

          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = 'selection.json';
          document.body.appendChild(a);
          a.click();
          a.remove();

          URL.revokeObjectURL(url);
          showToast('Выбор сохранён в JSON');
        }

        async function loadSelectionFromJson(file) {
          const text = await file.text();
          const obj = JSON.parse(text);

          const loadedSelection = new Map();

          if (obj.selection && typeof obj.selection === 'object') {
            for (const [zoneKey, codes] of Object.entries(obj.selection)) {
              if (!Array.isArray(codes)) continue;

              loadedSelection.set(
                zoneKey,
                new Set(codes.map(cleanCode).filter(Boolean))
              );
            }
          }

          state.selection = loadedSelection;

          state.toMode = 'fact';
          $('toModeSelect').value = 'fact';

          let desiredActiveKey = obj.activeZoneKey
            ? normalizePriceValue(obj.activeZoneKey).key
            : null;

          normalizeSelectionKeys();

          for (const set of state.selection.values()) {
            for (const code of set) {
              ensureItemForCode(code);
            }
          }

          buildZones();

          if (desiredActiveKey) {
            const zone = ensureZoneByKey(desiredActiveKey);
            desiredActiveKey = zone.key;
            sortZones();
          }

          buildNativeByZone();
          ensureSelectionForZones();

          if (desiredActiveKey && state.zonesByKey.has(desiredActiveKey)) {
            state.activeZoneKey = desiredActiveKey;
          } else {
            state.activeZoneKey = state.zones[0]?.key ?? null;
          }

          renderAll();
          updateStatus('Выбор загружен из JSON');
          showToast('Выбор загружен из JSON');
        }

        /***********************
         * Printing
         ***********************/

        function getDisplayPriceForPrint(item, zone) {
          return item?.price ?? item?.priceMag ?? item?.priceTn ?? zone?.price ?? null;
        }

        function buildPrintDocument({ title, subtitle, sections }) {
          const dateStr = new Date().toLocaleString('ru-RU');

          let html = `
            <div class="print-page-header">
              <div>
                <div class="print-title">${escapeHtml(title)}</div>
                <div class="print-subtitle">${escapeHtml(subtitle || '')}</div>
              </div>
              <div class="print-date">
                Дата формирования: <b>${escapeHtml(dateStr)}</b><br />
                Расчёт ТО: <b>${escapeHtml(getToModeLabel())}</b>
              </div>
            </div>
          `;

          sections.forEach(section => {
            const totals = computeRowsTotals(section.codes, section.zone.key);

            const rowsHtml = section.codes.map((code, index) => {
              const item = state.items.get(code) || ensureItemForCode(code);
              const displayPrice = getDisplayPriceForPrint(item, section.zone);

              return `
                <tr>
                  <td class="center">${index + 1}</td>
                  <td>${escapeHtml(code)}</td>
                  <td class="wrap">${escapeHtml(item.name || '')}</td>
                  <td class="right">${fmtCellNum(displayPrice)}</td>
                  <td class="right">${fmtCellNum(item.sold)}</td>
                  <td class="right">${fmtCellNum(item.stock)}</td>
                  <td class="right">${fmtCellNum(item.vp)}</td>
                </tr>
              `;
            }).join('');

            html += `
              <div class="print-section">
                <div class="print-section-title">
                  ${escapeHtml(section.sectionLabel)}: ${escapeHtml(section.zone.label)}
                </div>

                <div class="print-meta-grid">
                  <div class="print-meta-box">
                    <div class="label">Позиций</div>
                    <div class="value">${fmtInt(totals.count)}</div>
                  </div>

                  <div class="print-meta-box">
                    <div class="label">Цена зоны</div>
                    <div class="value">${fmtCellNum(section.zone.price) || '—'}</div>
                  </div>

                  <div class="print-meta-box">
                    <div class="label">ТО</div>
                    <div class="value">${fmtNum(totals.to)}</div>
                  </div>

                  <div class="print-meta-box">
                    <div class="label">ВП</div>
                    <div class="value">${fmtNum(totals.vp)}</div>
                  </div>

                  <div class="print-meta-box">
                    <div class="label">Шт</div>
                    <div class="value">${fmtInt(totals.pieces)}</div>
                  </div>
                </div>

                <table class="print-table">
                  <thead>
                    <tr>
                      <th style="width:4%;">№</th>
                      <th style="width:14%;">Код</th>
                      <th style="width:38%;">Товар</th>
                      <th class="right" style="width:10%;">Цена</th>
                      <th class="right" style="width:11%;">Продано</th>
                      <th class="right" style="width:11%;">Склад</th>
                      <th class="right" style="width:12%;">ВП</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${rowsHtml}
                  </tbody>

                  <tfoot>
                    <tr>
                      <td colspan="4">Итого</td>
                      <td class="right">${fmtInt(totals.pieces)}</td>
                      <td class="right"></td>
                      <td class="right">${fmtNum(totals.vp)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            `;
          });

          html += `
            <div class="print-signatures">
              <div class="print-signature">
                <div class="line">Категорийный менеджер</div>
              </div>
              <div class="print-signature">
                <div class="line">Руководитель</div>
              </div>
              <div class="print-signature">
                <div class="line">Дата / подпись</div>
              </div>
            </div>
          `;

          $('print-root').innerHTML = html;
        }

        function printCurrentCategory(mode) {
          if (!state.activeZoneKey) {
            showToast('Нет активной категории');
            return;
          }

          const zone = state.zonesByKey.get(state.activeZoneKey);
          if (!zone) return;

          let codes = [];
          let sectionLabel = '';

          if (mode === 'selected') {
            codes = [...(state.selection.get(zone.key) || new Set())];
            sectionLabel = 'Выбранные позиции';
          } else {
            codes = [...(state.nativeByZone.get(zone.key) || [])];
            sectionLabel = 'Вся категория';
          }

          if (!codes.length) {
            showToast(
              mode === 'selected'
                ? 'В текущей категории нет выбранных позиций'
                : 'В текущей категории нет товаров'
            );
            return;
          }

          codes.sort(compareCodesByVp);

          buildPrintDocument({
            title: 'Коммерческая зона / ценовой сегмент',
            subtitle: `${sectionLabel} · Категория: ${zone.label}`,
            sections: [
              {
                zone,
                sectionLabel,
                codes
              }
            ]
          });

          window.__r29DoPrint();
        }

        window.__r29BuildPrintDocument = function () {
          const sections = [];

          for (const zone of state.zones) {
            const codes = [...(state.selection.get(zone.key) || new Set())];

            if (codes.length) {
              codes.sort(compareCodesByVp);

              sections.push({
                zone,
                sectionLabel: 'Выбранные позиции',
                codes
              });
            }
          }

          if (!sections.length) {
            showToast('Нет выбранных товаров для печати');
            return false;
          }

          buildPrintDocument({
            title: 'Выбранные позиции по всем категориям',
            subtitle: 'Сводный документ по выбранным комм.зонам',
            sections
          });

          return true;
        };

        /***********************
         * Events
         ***********************/

        $('file1').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          try {
            state.raw1 = await readWorksheetRows(file);
            showToast('input1 прочитан');
            rebuildData();
          } catch (err) {
            console.error(err);
            showToast(`Ошибка чтения input1: ${err.message}`);
            updateStatus(`Ошибка чтения input1: ${err.message}`);
          } finally {
            e.target.value = '';
          }
        });

        $('file2').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          try {
            state.raw2 = await readWorksheetRows(file);
            showToast('input2 прочитан');
            rebuildData();
          } catch (err) {
            console.error(err);
            showToast(`Ошибка чтения input2: ${err.message}`);
            updateStatus(`Ошибка чтения input2: ${err.message}`);
          } finally {
            e.target.value = '';
          }
        });

        $('toModeSelect').addEventListener('change', (e) => {
          state.toMode = e.target.value;
          renderAll();
        });

        $('addCodeBtn').addEventListener('click', () => {
          const code = cleanCode($('addCodeInput').value);

          if (!code) return;

          if (!state.activeZoneKey) {
            showToast('Сначала загрузите файлы, чтобы появилась активная комм.зона.');
            return;
          }

          addCodeToZone(code, state.activeZoneKey);
          $('addCodeInput').value = '';
          renderAll();
          showToast(`Артикул ${code} добавлен в зону`);
        });

        $('addCodeInput').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            $('addCodeBtn').click();
          }
        });

        $('filterInput').addEventListener('input', (e) => {
          state.filter = e.target.value;
          renderTable();
        });

        $('selectAllVisibleBtn').addEventListener('click', () => {
          if (!state.activeZoneKey) return;

          const codes = getVisibleCodesForActiveZone();

          for (const code of codes) {
            addCodeToZone(code, state.activeZoneKey);
          }

          renderAll();
          showToast('Видимые товары добавлены в текущую зону');
        });

        $('clearZoneBtn').addEventListener('click', () => {
          if (!state.activeZoneKey) return;

          const set = state.selection.get(state.activeZoneKey);
          if (set) set.clear();

          renderAll();
          showToast('Текущая зона очищена');
        });

        $('tableBody').addEventListener('click', (e) => {
          const tr = e.target.closest('tr[data-code]');
          if (!tr) return;

          const code = tr.dataset.code;
          toggleCodeInActiveZone(code);
          renderAll();
        });

        $('chips').addEventListener('click', (e) => {
          const chip = e.target.closest('.chip[data-code]');
          if (!chip) return;

          const code = chip.dataset.code;
          removeCodeFromAllZones(code);
          renderAll();
          showToast(`Артикул ${code} убран из выбора`);
        });

        $('groupChips').addEventListener('click', (e) => {
          const chip = e.target.closest('[data-group]');
          if (!chip) return;

          openGroupModal(chip.dataset.group);
        });

        $('groupModalClose').addEventListener('click', () => {
          closeGroupModal();
        });

        $('groupModalOverlay').addEventListener('click', (e) => {
          if (e.target === $('groupModalOverlay')) {
            closeGroupModal();
          }
        });

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && state.groupModal.open) {
            closeGroupModal();
          }
        });

        $('groupModalBody').addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-action]');
          if (!btn) return;

          const action = btn.dataset.action;

          if (action === 'goto') {
            const zoneKey = btn.dataset.zone;
            const zone = state.zonesByKey.get(zoneKey);

            if (zone) {
              state.activeZoneKey = zoneKey;
              closeGroupModal();
              renderAll();

              const tableCard = $('tableBody')?.closest('.card');
              tableCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });

              showToast(`Открыта вкладка: ${zone.label}`);
            }
          } else if (action === 'remove') {
            const code = btn.dataset.code;
            removeCodeFromAllZones(code);
            renderAll(); // если группа опустеет, окно закроется автоматически
            showToast(`Товар ${code} убран из выбора`);
          }
        });

        $('groupModalClear').addEventListener('click', () => {
          const name = state.groupModal.name;
          if (name == null) return;

          const removed = removeGroupFromSelection(name);
          closeGroupModal();
          renderAll();
        r29ObserveUI();
          showToast(`Группа «${name}» убрана из выбора (${removed} шт)`);
        });

        $('saveJsonBtn').addEventListener('click', () => {
          saveSelectionToJson();
        });

        $('loadJsonBtn').addEventListener('click', () => {
          $('fileJson').click();
        });

        $('fileJson').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          try {
            await loadSelectionFromJson(file);
          } catch (err) {
            console.error(err);
            showToast(`Ошибка загрузки JSON: ${err.message}`);
            updateStatus(`Ошибка загрузки JSON: ${err.message}`);
          } finally {
            e.target.value = '';
          }
        });

        $('printSelectedBtn').addEventListener('click', () => {
          printCurrentCategory('selected');
        });

        $('printCategoryBtn').addEventListener('click', () => {
          printCurrentCategory('category');
        });

        $('printAllSelectedBtn').addEventListener('click', () => {
          window.r29PrintAllSelected();
        });

        /***********************
         * Init
         ***********************/

        updateStatus();
        renderAll();
  };

  // ── Печать свода выбранных позиций (адаптация window.print из r29.html) ──
  // ── Показ/скрытие окна группы и тоста (они не внутри #r29App, fixed-позиционирование работает только без трансформ у предков) ──
  function r29SyncOpenState() {
    var c = document.getElementById('r29Card');
    if (!c || !c.getAttribute('data-ready')) return;
    var overlay = c.querySelector('#groupModalOverlay');
    var toast = c.querySelector('#toast');
    var open = !!overlay && overlay.classList.contains('show');
    var toastOn = !!toast && toast.classList.contains('show');
    c.classList.toggle('r29-modal-open', open);
    c.classList.toggle('r29-toast-active', toastOn);
    c.classList.toggle('r29-open', open || toastOn);
  }
  function r29ObserveUI() {
    var c = document.getElementById('r29Card');
    if (!c || typeof MutationObserver === 'undefined') return;
    try {
      var mo = new MutationObserver(r29SyncOpenState);
      ['groupModalOverlay', 'toast'].forEach(function (id) {
        var el = c.querySelector('#' + id);
        if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
      });
    } catch (_) {}
    r29SyncOpenState();
  }

  window.r29PrintAllSelected = function () {
    var c = document.getElementById('r29Card');
    if (!c || !c.getAttribute('data-ready')) return false;
    if (typeof window.__r29BuildPrintDocument !== 'function') return false;
    if (!window.__r29BuildPrintDocument()) return false;
    r29DoPrint();
    return true;
  };
})();
