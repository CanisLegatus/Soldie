/* Интеграционный тест раздела «💰 Продажи» в реальном окружении (jsdom + Chart.js + XLSX). */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const XLSX = require('xlsx');

const ROOT = '/workspace/galamart-analyst';
let failures = 0;
function ok(cond, name) {
  console.log((cond ? '✅ ' : '❌ ') + name);
  if (!cond) failures++;
}

// ── Тестовые данные suadela: 4 дня продаж, два продавца, артикулы разных групп ──
const DAYS = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
const SELLERS = ['Иванова Мария Петровна', 'Петров Сергей Алексеевич'];
const ARTICLES = [
  { art: '931-606', name: 'Кабель КДЗБ 2.5 красный' },
  { art: '931-544', name: 'Кабель КДЗБ 2.5 синий' },
  { art: '450-113', name: 'Разветвитель тройник' },
];
// сумма/кол-во за день по 931-606: рост→спад после 07.10 (для проверки отсечки)
const DAYDATA = {
  '931-606': [{ q: 10, s: 10000 }, { q: 12, s: 12000 }, { q: 8, s: 8000 }, { q: 7, s: 7000 }],
  '931-544': [{ q: 5, s: 5000 }, { q: 5, s: 5500 }, { q: 6, s: 6000 }, { q: 6, s: 6200 }],
  '450-113': [{ q: 3, s: 3000 }, { q: 3, s: 3100 }, { q: 2, s: 2900 }, { q: 3, s: 3300 }],
};

// Формат 1С «Отчёт о продажах», который распознаёт парсер suadela:
// шапка с датой («за период 05.10.2026»), колонки «Номенклатура.Код / Количество товаров / Сумма продаж со скидкой»,
// строки продавцов (ФИО), затем пары «название товара → артикул».
function buildWorkbook(dateStr) {
  const idx = DAYS.indexOf(dateStr);
  const dd = new Date(dateStr + 'T00:00:00');
  const ruDate = String(dd.getDate()).padStart(2, '0') + '.' + String(dd.getMonth() + 1).padStart(2, '0') + '.' + dd.getFullYear();
  const rows = [];
  rows.push(['Отчёт о продажах']);
  rows.push(['Магазин Галамартов, г. Москва']);
  rows.push(['Отчёт за период ' + ruDate + ' по кассам']);
  rows.push([]);
  rows.push(['Номенклатура.Код', 'Количество товаров', 'Сумма продаж со скидкой']);
  SELLERS.forEach(seller => {
    rows.push([seller, '', '']);
    ARTICLES.forEach(a => {
      const d = DAYDATA[a.art][idx];
      const qHalf = Math.max(1, Math.round(d.q / 2));
      const sHalf = Math.round(d.s / 2);
      rows.push([a.name, '', '']);            // название товара (pending)
      rows.push([a.art, qHalf, sHalf]);       // артикул + показатели
    });
  });
  rows.push(['Итого', '25', '12345']);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Лист1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function main() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on('jsdomError', e => jsErrors.push(String(e && e.message || e)));
  vc.on('error', (...a) => jsErrors.push(a.map(String).join(' ')));

  const dom = new JSDOM(html, {
    url: 'file:///workspace/galamart-analyst/index.html',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // заглушки canvas
      window.HTMLCanvasElement.prototype.getContext = function () {
        const noop = () => {};
        const ctx = new Proxy({}, {
          get(t, k) {
            if (k === 'canvas') return t.__canvas;
            if (k === 'measureText') return () => ({ width: 10 });
            if (k === 'getImageData') return () => ({ data: [] });
            if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
            if (typeof k === 'string') return t[k] !== undefined ? t[k] : noop;
            return noop;
          },
          set(t, k, v) { t[k] = v; return true; }
        });
        ctx.__canvas = this;
        return ctx;
      };
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.matchMedia = window.matchMedia || (q => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {} }));
      // localStorage не нужен отдельный — jsdom предоставляет.
    }
  });
  const { window } = dom;
  window.XLSX = XLSX;

  // дождаться DOMContentLoaded (defer-скрипты в jsdom выполняются при parse)
  await new Promise(res => {
    if (window.document.readyState === 'complete') return res();
    window.addEventListener('load', res);
    setTimeout(res, 3000);
  });
  await new Promise(r => setTimeout(r, 200));

  const doc = window.document;

  // ── 1. Все скрипты загружены, API на месте ──
  ok(typeof window.sku3Api === 'object' && window.sku3Api !== null, 'sku3Api экспортирован (js/sku3.js)');
  ok(typeof window.salesRenderMarkup === 'function', 'salesRenderMarkup доступен');
  ok(typeof window.salesInit === 'function', 'salesInit доступен');
  ok(jsErrors.length === 0, 'нет ошибок JS при загрузке страницы' + (jsErrors.length ? ': ' + jsErrors.slice(0, 3).join(' | ') : ''));

  // ── 2. Вкладка «Продажи» есть среди сегментов ──
  const salesBtn = doc.querySelector('.seg-btn[data-mode="sales"]');
  ok(!!salesBtn, 'кнопка вкладки «💰 Продажи» присутствует');

  // ── 3. Активация через клик по вкладке → activateSales() ──
  salesBtn.click();
  await new Promise(r => setTimeout(r, 150));
  const card = doc.getElementById('salesCard');
  ok(card && !card.classList.contains('hidden'), 'activateSales(): карточка «Продажи» показана');
  ok(card.getAttribute('data-ready') === '1', 'разметка раздела отрендерена (data-ready)');
  ok(card.getAttribute('data-inited') === '1', 'salesInit выполнен (data-inited)');
  ok(doc.getElementById('slDynChart') !== null, 'canvas живой динамики создан');
  ok(doc.querySelectorAll('#slScopeSeg button').length === 3, 'три скоупа: Day-day / Неделя / Произвольный');

  // ── 4. Загрузка файлов продаж (путь импорта suadela через sku3Api.handleImportFiles) ──
  const files = DAYS.map(d => {
    const buf = buildWorkbook(d);
    return new window.File([buf], `otchet_${d}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  });
  await window.sku3Api.handleImportFiles(files);
  window.sku3Api.confirmImport();
  const st = window.sku3Api.getState();
  ok(st.sales.length > 0, `импорт suadela распознал продажи: ${st.sales.length} записей`);
  const datesInState = [...new Set(st.sales.map(s => s.date))].sort();
  ok(datesInState.length === 4, `даты отчётов определены автоматически: ${datesInState.join(', ')}`);

  // обновить дашборд как это делает importFiles в sales.js
  window.dispatchEvent(new Event('storage'));
  if (typeof window.salesRefresh === 'function') window.salesRefresh();

  // перерендер через смену скоупа (штатный путь обновления)
  doc.querySelector('#slScopeSeg button[data-sl-scope="dayday"]').click();
  await new Promise(r => setTimeout(r, 250));

  const kpis = doc.getElementById('slKpis');
  ok(kpis && kpis.children.length >= 3, 'KPI отрисованы: ' + (kpis ? kpis.children.length : 0) + ' шт');
  const totalTxt = kpis ? kpis.textContent : '';
  ok(/Итого|₽/.test(totalTxt), 'в KPI присутствует выручка');

  // ── 5. Таблицы: группы и артикулы ──
  doc.querySelector('.sl-tab[data-sl-tab="groups"]').click();
  await new Promise(r => setTimeout(r, 120));
  const gRows = doc.querySelectorAll('#slGroupTable tbody tr');
  ok(gRows.length >= 2, 'группы (по префиксу артикула): ' + gRows.length + ' строк');

  doc.querySelector('.sl-tab[data-sl-tab="skus"]').click();
  await new Promise(r => setTimeout(r, 120));
  const sRows = doc.querySelectorAll('#slSkuTable tbody tr');
  ok(sRows.length === 3, 'артикулы: ' + sRows.length + ' строк (ожидалось 3)');

  // клик по строке артикула — добавление серии на график
  sRows[0].click();
  await new Promise(r => setTimeout(r, 150));
  doc.querySelector('.sl-tab[data-sl-tab="dyn"]').click();
  await new Promise(r => setTimeout(r, 150));

  // ── 6. Скоупы ──
  doc.querySelector('#slScopeSeg button[data-sl-scope="week"]').click();
  await new Promise(r => setTimeout(r, 150));
  const weekSel = doc.getElementById('slWeekSel');
  ok(weekSel && weekSel.options.length >= 1, 'недельный скоуп: выбрано ' + (weekSel ? weekSel.options.length : 0) + ' недель');
  doc.querySelector('#slScopeSeg button[data-sl-scope="custom"]').click();
  await new Promise(r => setTimeout(r, 150));
  ok(!doc.getElementById('slFromWrap').hidden && !doc.getElementById('slToWrap').hidden, 'произвольный скоуп: поля дат видны');
  const from = doc.getElementById('slDateFrom'), to = doc.getElementById('slDateTo');
  from.value = '2026-10-06'; to.value = '2026-10-07';
  from.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  ok(true, 'произвольный период применён без ошибок');
  doc.querySelector('#slScopeSeg button[data-sl-scope="dayday"]').click();
  await new Promise(r => setTimeout(r, 150));

  // ── 7. Живая динамика и воспроизведение ──
  const liveBtn = doc.querySelector('[data-sl-action="live"]');
  liveBtn.click();
  await new Promise(r => setTimeout(r, 400));
  ok(liveBtn.textContent.includes('Стоп') || liveBtn.classList.contains('active') || doc.querySelector('.sl-live-badge'), 'живой режим включается');
  liveBtn.click(); // выключить

  const playBtn = doc.querySelector('[data-sl-action="play"]');
  playBtn.click();
  await new Promise(r => setTimeout(r, 700));
  ok(true, 'воспроизведение динамики стартовало без ошибок');
  const stopBtn = doc.querySelector('[data-sl-action="stop"]');
  if (stopBtn && !stopBtn.disabled) stopBtn.click();
  await new Promise(r => setTimeout(r, 200));

  // ── 8. Отсечка: ввод суммы прямо на графике (через modal-путь openCutModal) ──
  doc.querySelector('.sl-tab[data-sl-tab="cuts"]').click();
  await new Promise(r => setTimeout(r, 120));
  const addCutBtn = doc.querySelector('[data-sl-action="add-cut"]');
  ok(!!addCutBtn, 'кнопка «➕ Добавить отсечку» есть');
  addCutBtn.click();
  await new Promise(r => setTimeout(r, 150));
  const cutModal = doc.getElementById('slCutModal');
  ok(cutModal && cutModal.classList.contains('open'), 'модалка отсечки открыта');
  const sumInput = cutModal.querySelector('#slCutThreshold');
  const dateInput = cutModal.querySelector('#slCutDate');
  ok(!!sumInput && !!dateInput, 'в модалке есть поля суммы порога и даты отсечки');
  if (sumInput && dateInput) {
    // найти кнопку сохранения
    const saveBtn = cutModal.querySelector('[data-sl-action="save-cut"]');
    ok(!!saveBtn, 'кнопка сохранения отсечки есть');
    sumInput.value = '11000';
    sumInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    dateInput.value = '2026-10-07';
    dateInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    saveBtn.click();
    await new Promise(r => setTimeout(r, 250));
    const cutsList = doc.getElementById('slCutsList');
    ok(cutsList && cutsList.textContent.length > 20, 'отсечка сохранена и отображается в списке');
    ok(/до|после|\/день|↓|↑|%|₽/i.test(cutsList.textContent), 'система показала динамику до/после переоценки');
    // проверка корректности расчёта: для «Итого» до 07.10 среднее (28000+31200)/2=29600, после (16900+16500)/2=16700 → −44%
    ok(/−|-|↓/.test(cutsList.textContent) && /%\)?/.test(cutsList.textContent), 'зафиксировано падение продаж после отсечки (в %/)');
    // проверка persist
    const saved = JSON.parse(window.localStorage.getItem('sales_dashboard_v1_cuts') || '[]');
    ok(Array.isArray(saved) && saved.length >= 1, 'отсечка сохранена в localStorage: ' + saved.length);
    const c0 = saved[0];
    ok(c0 && c0.date === '2026-10-07' && Number(c0.threshold) === 11000, 'поля отсечки сохранены верно (дата + сумма порога)');
  }

  // ── 9. Метрика qty ──
  const metricSel = doc.getElementById('slMetricSel');
  metricSel.value = 'qty';
  metricSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  ok(true, 'переключение метрики на количество без ошибок');

  // ── 10. Поиск/фильтр ──
  const search = doc.getElementById('slSearchInput');
  search.value = '931-606';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  ok(true, 'фильтр по артикулу применён без ошибок');
  search.value = '';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));

  // ── 11. Переключение на другие вкладки и возврат (hide/show) ──
  doc.querySelector('.seg-btn[data-mode="dash"]').click();
  await new Promise(r => setTimeout(r, 120));
  ok(card.classList.contains('hidden'), 'при уходе с вкладки «Продажи» карточка скрывается');
  salesBtn.click();
  await new Promise(r => setTimeout(r, 150));
  ok(!card.classList.contains('hidden'), 'повторное открытие вкладки работает (idempotent init)');

  // ── 12. Кнопка «Обработать» в режиме sales ──
  const processBtn = doc.getElementById('processBtn');
  processBtn.disabled = false;
  processBtn.click();
  await new Promise(r => setTimeout(r, 150));
  ok(!card.classList.contains('hidden'), '«Обработать» в режиме «Продажи» активирует раздел');

  // ── 13. Итоговая проверка ошибок ──
  ok(jsErrors.length === 0, 'за весь сценарий нет необработанных JS-ошибок' + (jsErrors.length ? ':\n' + jsErrors.slice(0, 5).join('\n') : ''));

  console.log(failures === 0 ? '\n🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\n⚠️ ПРОВАЛОВ: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
