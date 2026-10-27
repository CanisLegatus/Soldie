// Живая проверка интеграции R29 в galamart-analyst (headless Chrome)
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  // ── Генерация тестовых input1/input2 через сам XLSX в браузере ──
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

  const url = 'file://' + path.resolve(__dirname, 'galamart-analyst/index.html');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluateHandle(() => document.fonts.ready);
  // ждём загрузки defer-скриптов
  await page.waitForFunction(() => typeof window.r29RenderMarkup === 'function', { timeout: 15000 });

  const results = {};

  // 1. Переключение в режим R29
  await page.click('button[data-mode="r29"]');
  await new Promise(r => setTimeout(r, 500));

  results.cardVisible = await page.evaluate(() => {
    const c = document.getElementById('r29Card');
    return !!c && !c.classList.contains('hidden') && !!c.getAttribute('data-ready');
  });

  // 2. Проверка ключевых элементов и навешенных обработчиков (не null!)
  results.elementsOk = await page.evaluate(() => {
    const card = document.getElementById('r29Card');
    const ids = ['file1','file2','toModeSelect','status','tabs','gCount','gTO','gVP','gPieces',
      'breakdownBody','zoneTitle','zoneMeta','printSelectedBtn','printCategoryBtn','printAllSelectedBtn',
      'zCount','zTO','zVP','zPieces','groupCard','groupChips','addCodeInput','addCodeBtn',
      'filterInput','selectAllVisibleBtn','clearZoneBtn','tableBody','chips',
      'groupModalOverlay','groupModalClose','groupModalBody','groupModalClear','groupModalHint',
      'saveJsonBtn','loadJsonBtn','fileJson'];
    const missing = ids.filter(id => !card.querySelector('#' + id));
    return { missing, total: ids.length };
  });

  // 3. Статус-бар должен показать, что файлы не загружены (значит init прошёл)
  results.statusText = await page.evaluate(() => {
    const s = document.querySelector('#r29Card #status');
    return s ? s.textContent.trim().slice(0, 200) : null;
  });

  // 4. Генерируем testworkbook-файлы внутри страницы и «загружаем» их через DataTransfer
  results.loadFiles = await page.evaluate(async () => {
    function makeSheet(rows) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    }
    const rows1 = [
      ['Код', 'Товар', 'Цена'],
      [1001, 'Молоко 900мл', 89.9],
      [1002, 'Хлеб белый', 45.0],
      [1003, 'Сахар 1кг', 75.5],
      [1004, 'Чай чёрный 100гр', 120.0],
      [1005, 'Кофе молотый 250гр', 350.0],
      [1006, 'Сок яблочный 1л', 110.0],
      [1007, 'Печенье овсяное', 65.0],
      [1008, 'Конфеты шоколадные', 480.0],
      [1009, 'Вода 0.5л', 35.0],
      [1010, 'Йогурт 300мл', 79.0],
    ];
    const rows2 = [
      ['Код', 'Товар', 'Цена ТН, руб.', 'Цена маг, руб.', 'Себестоимость', 'Продано', 'Склад', 'Группа 1', 'Группа 2', 'Группа 3', 'ТО, руб', 'ТО СС, руб'],
      [1001, 'Молоко 900мл', 99, 105, 60, 120, 40, 'Бакалея', 'Молочное', 'Молоко'],
      [1002, 'Хлеб белый', 50, 55, 25, 300, 60, 'Бакалея', 'Хлеб', 'Хлеб белый'],
      [1003, 'Сахар 1кг', 85, 90, 55, 90, 30, 'Бакалея', 'Сыпучее', 'Сахар'],
      [1004, 'Чай чёрный 100гр', 130, 140, 80, 40, 20, 'Напитки', 'Чай', 'Чай чёрный'],
      [1005, 'Кофе молотый 250гр', 390, 420, 250, 15, 10, 'Напитки', 'Кофе', 'Кофе молотый'],
      [1006, 'Сок яблочный 1л', 120, 130, 70, 80, 25, 'Напитки', 'Соки', 'Сок'],
      [1007, 'Печенье овсяное', 70, 75, 40, 150, 50, 'Снеки', 'Печенье', 'Печенье'],
      [1008, 'Конфеты шоколадные', 520, 560, 300, 20, 8, 'Снеки', 'Конфеты', 'Конфеты'],
      [1009, 'Вода 0.5л', 40, 45, 15, 500, 200, 'Напитки', 'Вода', 'Вода'],
      [1010, 'Йогурт 300мл', 89, 95, 50, 60, 20, 'Бакалея', 'Молочное', 'Йогурт'],
      [9999, 'Товар вне input1', 100, 110, 60, 5, 5, 'Прочее', 'Прочее', 'Прочее'],
    ];
    rows2.slice(1).forEach(row => row.push(row[5] * row[3] * 0.8, row[5] * row[4]));
    const buf1 = makeSheet(rows1);
    const buf2 = makeSheet(rows2);
    const f1 = new File([buf1], 'input1.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const f2 = new File([buf2], 'input2.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dt1 = new DataTransfer(); dt1.items.add(f1);
    const dt2 = new DataTransfer(); dt2.items.add(f2);
    document.querySelector('#r29Card #file1').files = dt1.files;
    document.querySelector('#r29Card #file1').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('#r29Card #file2').files = dt2.files;
    document.querySelector('#r29Card #file2').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    return document.querySelector('#r29Card #status').textContent.slice(0, 300);
  });

  // 5. Табы зон сформированы?
  results.tabs = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('#r29Card #tabs .tab, #r29Card #tabs button')];
    return tabs.map(t => t.textContent.trim()).slice(0, 15);
  });

  // 6. Клик по каждому табу → сумма строк таблиц по всем зонам
  results.zoneTables = await page.evaluate(async () => {
    const tabs = [...document.querySelectorAll('#r29Card #tabs .tab, #r29Card #tabs button')];
    let total = 0;
    for (const t of tabs) { t.click(); await new Promise(r => setTimeout(r, 80)); total += document.querySelectorAll('#r29Card #tableBody tr').length; }
    tabs[0] && tabs[0].click();
    await new Promise(r => setTimeout(r, 150));
    return { tabCount: tabs.length, totalRowsAcrossZones: total };
  });

  // 7. Выбор первых трёх товаров кликами по строкам → статистика обновилась
  results.statsAfterSelect = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll('#r29Card #tableBody tr')];
    for (const tr of rows) tr.click();          // клик по всей строке — как у пользователя
    await new Promise(r => setTimeout(r, 300));
    const g = id => (document.querySelector('#r29Card #' + id) || {}).textContent;
    return { rowCount: rows.length, zCount: g('zCount'), zTO: g('zTO'), zVP: g('zVP'), zPieces: g('zPieces'),
             gCount: g('gCount'), gTO: g('gTO'), gVP: g('gVP'), gPieces: g('gPieces') };
  });

  // 7b. Кнопка «Выбрать все видимые» тоже работает
  results.selectAllVisible = await page.evaluate(async () => {
    document.querySelector('#r29Card #selectAllVisibleBtn').click();
    await new Promise(r => setTimeout(r, 250));
    const g = id => (document.querySelector('#r29Card #' + id) || {}).textContent;
    return { zCount: g('zCount'), gCount: g('gCount') };
  });

  // 8. Сохранение JSON: перехватываем createObjectURL, читаем Blob и сохраняем на диск
  results.saveJson = await page.evaluate(async () => {
    let capturedUrl = null;
    const origCreate = URL.createObjectURL.bind(URL);
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {};
    const blobs = [];
    const origBlob = window.Blob;
    URL.createObjectURL = (b) => { blobs.push(b); return 'blob:fake/' + blobs.length; };
    let err = null;
    try { document.querySelector('#r29Card #saveJsonBtn').click(); } catch (e) { err = e.message; }
    await new Promise(r => setTimeout(r, 300));
    URL.createObjectURL = origCreate;
    HTMLAnchorElement.prototype.click = origClick;
    if (!blobs.length) return { clicked: true, blobCaptured: false, err };
    const text = await blobs[0].text();
    window.__savedJson = text;
    return { clicked: true, blobCaptured: true, size: text.length, head: text.slice(0, 120), err };
  });

  // 8b. Сохраняем JSON на диск и потом загружаем обратно через fileJson
  const savedJsonText = await page.evaluate(() => window.__savedJson || null);
  if (savedJsonText) fs.writeFileSync('/tmp/r29_selection.json', savedJsonText);
  results.loadJsonRoundtrip = await page.evaluate(async (jsonText) => {
    if (!jsonText) return { skipped: true };
    // сначала очистим выбор: переключимся в другую зону и чистим текущую
    document.querySelector('#r29Card #clearZoneBtn').click();
    await new Promise(r => setTimeout(r, 200));
    const g0 = (document.querySelector('#r29Card #gCount') || {}).textContent;
    const f = new File([jsonText], 'selection.json', { type: 'application/json' });
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.querySelector('#r29Card #fileJson');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const g1 = (document.querySelector('#r29Card #gCount') || {}).textContent;
    return { clearedCount: g0, restoredCount: g1 };
  }, savedJsonText);

  // 9. Печать выбранных позиций (перехват window.print, чтобы не зависнуть)
  results.printSelected = await page.evaluate(async () => {
    let called = false;
    const orig = window.print;
    window.print = () => { called = true; };
    try {
      document.querySelector('#r29Card #printSelectedBtn').click();
      await new Promise(r => setTimeout(r, 400));
      const root = document.querySelector('#r29Card #print-root');
      window.print = orig;
      return { printCalled: called, rootHasContent: root && root.innerHTML.length > 100 };
    } catch (e) { window.print = orig; return { error: e.message }; }
  });

  // 10. Печать всей категории
  results.printCategory = await page.evaluate(async () => {
    let called = false;
    const orig = window.print;
    window.print = () => { called = true; };
    try {
      document.querySelector('#r29Card #printCategoryBtn').click();
      await new Promise(r => setTimeout(r, 400));
      window.print = orig;
      return { printCalled: called };
    } catch (e) { window.print = orig; return { error: e.message }; }
  });

  // 11. Печать всех выбранных (глобальный свод)
  results.printAll = await page.evaluate(async () => {
    let called = false;
    const orig = window.print;
    window.print = () => { called = true; };
    try {
      document.querySelector('#r29Card #printAllSelectedBtn').click();
      await new Promise(r => setTimeout(r, 400));
      window.print = orig;
      return { printCalled: called };
    } catch (e) { window.print = orig; return { error: e.message }; }
  });

  // 12. Модалка группы: клик по чипу товарной группы
  results.groupModal = await page.evaluate(async () => {
    const chip = document.querySelector('#r29Card #groupChips .chip, #r29Card #groupChips button');
    if (!chip) return { chipFound: false };
    chip.click();
    await new Promise(r => setTimeout(r, 200));
    const ov = document.querySelector('#r29Card #groupModalOverlay');
    const shown = ov && ov.classList.contains('show');
    if (shown) document.querySelector('#r29Card #groupModalClose').click();
    return { chipFound: true, modalShown: shown };
  });

  // 13. Смена режима ТО (toModeSelect)
  results.toMode = await page.evaluate(async () => {
    const sel = document.querySelector('#r29Card #toModeSelect');
    sel.value = 'item';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    sel.value = 'tn';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return {disabled:sel.disabled, selected:sel.value};
  });

  // 14. Добавление артикула вручную
  results.addCode = await page.evaluate(async () => {
    document.querySelector('#r29Card #addCodeInput').value = '1003';
    document.querySelector('#r29Card #addCodeBtn').click();
    await new Promise(r => setTimeout(r, 200));
    return document.querySelector('#r29Card #status').textContent.slice(0, 200);
  });

  // 15. Фильтр
  results.filter = await page.evaluate(async () => {
    const inp = document.querySelector('#r29Card #filterInput');
    inp.value = 'молоко';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const n = document.querySelectorAll('#r29Card #tableBody tr').length;
    inp.value = '';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return { visibleRows: n };
  });

  // 16. Switch обратно в другой режим — скрытие без ошибок
  await page.click('button[data-mode="vision"]');
  await new Promise(r => setTimeout(r, 300));
  results.hiddenOnSwitch = await page.evaluate(() => {
    const c = document.getElementById('r29Card');
    return c.classList.contains('hidden');
  });

  await browser.close();
  require('node:assert/strict').equal(results.toMode.disabled, true);
  require('node:assert/strict').equal(Number(results.statsAfterSelect.gTO.replace(/\s/g,'')), 18000);
  require('node:assert/strict').equal(Number(results.statsAfterSelect.gVP.replace(/\s/g,'')), 10500);
  require('node:assert/strict').equal(results.cardVisible, true);
  require('node:assert/strict').equal(results.elementsOk.missing.length, 0);
  require('node:assert/strict').equal(results.tabs.length > 0, true);
  require('node:assert/strict').equal(results.hiddenOnSwitch, true);
  require('node:assert/strict').equal(results.saveJson.blobCaptured, true);
  require('node:assert/strict').equal(results.printSelected.printCalled, true);
  require('node:assert/strict').deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
  console.log('=== JS ERRORS ===');
  console.log(errors.length ? errors.join('\n') : '(none)');

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
