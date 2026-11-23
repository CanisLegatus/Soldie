const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');

test('briefing reuses real imports and prints a single A4, plus an explicitly timed current-day report', async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1320, height: 1000 });
    await page.emulateTimezone('Europe/Moscow');
    await page.evaluateOnNewDocument(() => {
      const NativeDate = Date;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : ['2026-11-23T14:00:00+03:00'])); }
        static now() { return new NativeDate('2026-11-23T14:00:00+03:00').getTime(); }
      };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../../galamart-analyst/index.html')).href + '#briefing');
    await page.evaluate(() => sku3Api.ready);
    const text = selector => page.$eval(selector, el => el.innerText);
    const setDay = date => page.$eval('#briefingDate', (el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, date);
    const exportA4 = async () => {
      const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
      assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 1);
      const size = pdf.match(/\/MediaBox \[0 0 (\S+) (\S+)\]/);
      assert.ok(size && Math.abs(Number(size[1]) - 595) < 1 && Math.abs(Number(size[2]) - 842) < 1);
    };

    assert.match(await text('#briefingStore'), /Нет загруженных магазинов/);
    for (const [prefix, kind] of [['Рейтинг', 1], ['Статистика', 2]]) {
      const name = fs.readdirSync(path.join(__dirname, '..')).find(file => file.startsWith(prefix) && file.endsWith('.xlsx'));
      const bytes = [...fs.readFileSync(path.join(__dirname, '..', name))];
      await page.evaluate((data, filename, flag) =>
        vIngest(flag, XLSX.read(new Uint8Array(data), { type: 'array', cellDates: true }), filename), bytes, name, kind);
    }
    await page.select('#briefingStore', 'влд бородинская 14');
    assert.equal(await page.$eval('#briefingDate', el => el.value), '2026-11-22');
    assert.match(await text('.briefing-ring strong'), /86,1/);
    assert.match(await text('.briefing-month-info'), /115,5.*%/);
    assert.match(await text('.briefing-month-info'), /\+822\s645/);
    assert.match(await text('.briefing-kpi-card:nth-child(3)'), /154\s*%[\s\S]*\+2,9\s*п\. п\./);
    assert.match(await text('.briefing-today'), /День завершён[\s\S]*204\s307\s*₽/);
    assert.match(await text('.briefing-today tbody tr:first-child td:last-child'), /122,2/);
    assert.match(await text('.briefing-departments'), /нет планов отделов/);
    assert.match(await text('.briefing-sku'), /Нет данных акции/);
    assert.equal(await page.$$eval('.briefing-dept-grid tbody tr', rows => rows.length), 23);
    assert.equal(await page.$eval('.briefing-dept-grid tbody th', el => getComputedStyle(el).whiteSpace), 'normal');
    await page.click('#briefingGenerate');
    assert.equal(await text('#briefingStatus'), 'Брифинг сформирован.');
    await page.click('#briefingPreview');
    assert.equal(await page.$eval('#briefingPreview', el => el.getAttribute('aria-pressed')), 'true');
    await page.emulateMediaType('print');
    assert.equal(await page.$eval('.briefing-controls', el => getComputedStyle(el).display), 'none');
    assert.equal(await page.$eval('#su-sidebar', el => getComputedStyle(el).display), 'none');
    await exportA4();
    await page.evaluate(() => {
      for (const table of document.querySelectorAll('.briefing-dept-grid table')) {
        const body = table.tBodies[0];
        if (body.rows.length < 12) body.append(body.lastElementChild.cloneNode(true));
        for (const row of body.rows) {
          row.cells[0].firstElementChild.textContent = 'Длинное название товарного отдела для проверки переноса текста в две строки';
        }
      }
      const focus = document.querySelector('.briefing-focus div');
      const additional = document.createElement('p');
      additional.textContent = 'Приоритет с длинным названием группы товаров и описанием действия для команды магазина.';
      focus.append(additional);
    });
    await exportA4();
    await page.emulateMediaType(null);

    await page.select('#briefingPeriod', 'week');
    assert.match(await text('.briefing-kpi'), /16\.11\.2026 — 22\.11\.2026/);
    assert.match(await text('.briefing-departments'), /Нет продаж по товарным группам/);
    await setDay('2026-11-23');
    assert.match(await text('.briefing-today'), /время среза неизвестно/);
    assert.equal(await text('.briefing-today tbody tr:first-child td:nth-child(3)'), '—');
    assert.match(await text('.briefing-month-info'), /Факт на 22\.11\.2026/);
    assert.match(await text('.briefing-data-note'), /последний закрытый день/);

    await page.evaluate(() => {
      const plan = XLSX.utils.book_new();
      const heading = 'Отчёт за 23.11.2026 - 23.11.2026';
      const time = 'Сформировано 23.11.2026 12:15';
      for (const [name, target, fact] of [['ТО План-Факт', 100, 40], ['Чеки План-Факт', 100, 50]]) {
        XLSX.utils.book_append_sheet(plan, XLSX.utils.aoa_to_sheet([
          [heading], [time], ['Магазин', 'Регион', '', '', 'План', '23.11.2026'],
          ['Проверочный', 'Регион', '', 'План', '', target], ['', '', '', 'Факт', '', fact]
        ]), name);
      }
      XLSX.utils.book_append_sheet(plan, XLSX.utils.aoa_to_sheet([
        [heading], ['Магазин', 'Дата', 'Себестоимость, тыс.руб.', 'Выручка, тыс.руб.', 'Кол-во чеков, шт', 'План ВП, тыс.руб.'],
        ['Проверочный', '23.11.2026', 20, 40, 50, 45], ['Проверочный', '23.11.2026', 20, 40, 50, 45]
      ]), 'Продажи');
      vIngest(1, plan, 'intraday.xlsx');
      const state = sku3Api.getState();
      Object.assign(state.settings, {
        storeName: 'Проверочный', employees: [{ id: 'seller', name: 'Иванова Мария Петровна' }], startDate: '2026-11-23', endDate: '2026-11-23', planChecks: 100,
        skus: [
          { id: 'a', name: 'Товар А', articles: ['101'], planUnits: 6 },
          { id: 'b', name: 'Товар Б', articles: ['102'], planUnits: 4 },
          { id: 'c', name: 'Товар В', articles: ['103'], planUnits: 10 }
        ]
      });
      state.imports = [{ date: '2026-11-23', file: 'cashiers.xlsx', at: new Date().toISOString() }];
      state.sales = ['101', '102', '103'].map(article => ({ date: '2026-11-23', article, seller: 'Иванова Мария Петровна', qty: 2 }));
      state.checks = [{ date: '2026-11-23', seller: '__STORE__', checks: 50 }];
      window.dispatchEvent(new Event('sku3-data-changed'));
    });
    await page.select('#briefingStore', 'проверочный');
    assert.match(await text('.briefing-today'), /Данные на 12:15/);
    assert.match(await text('.briefing-today tbody tr:nth-child(3)'), /1\s000\s₽\s+800\s₽\s+1\s200\s₽/);
    assert.match(await text('.briefing-today tbody tr:nth-child(4)'), /45\s000\s₽\s+20\s000\s₽\s+25\s000\s₽/);
    assert.match(await text('.briefing-sku'), /12\s*%[\s\S]*20\s*%[\s\S]*14\s*шт\./);
    assert.equal(await page.$$eval('.briefing-sku li', rows => rows.length), 3);
    await exportA4();
    await page.evaluate(() => { window.print = () => { window.printCount = (window.printCount || 0) + 1; }; });
    await page.click('#briefingPrint');
    await page.click('#briefingPdf');
    assert.equal(await page.evaluate(() => window.printCount), 2);
    assert.match(await text('#briefingStatus'), /Сохранить как PDF/);
    await page.click('[data-mode="vision"]');
    assert.equal(await page.$eval('#briefingCard', el => el.classList.contains('hidden')), true);
    assert.equal(await page.$eval('body', el => el.classList.contains('briefing-active')), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
