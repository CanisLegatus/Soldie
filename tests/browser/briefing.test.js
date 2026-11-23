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
    const exportA4 = async (landscape = false) => {
      const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
      assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 1);
      const size = pdf.match(/\/MediaBox \[0 0 (\S+) (\S+)\]/);
      assert.ok(size);
      assert.ok(Math.abs(Number(size[1]) - (landscape ? 842 : 595)) < 1 &&
        Math.abs(Number(size[2]) - (landscape ? 595 : 842)) < 1, size[0]);
    };

    assert.match(await text('#briefingStore'), /Нет загруженных магазинов/);
    for (const [prefix, kind] of [['Рейтинг', 1], ['Статистика', 2]]) {
      const name = fs.readdirSync(path.join(__dirname, '..')).find(file => file.startsWith(prefix) && file.endsWith('.xlsx'));
      const bytes = [...fs.readFileSync(path.join(__dirname, '..', name))];
      await page.evaluate((data, filename, flag) =>
        vIngest(flag, XLSX.read(new Uint8Array(data), { type: 'array', cellDates: true }), filename), bytes, name, kind);
    }
    await page.select('#briefingStore', 'влд бородинская 14');
    assert.equal(await page.$eval('#briefingDate', el => el.value), '2026-11-23');
    assert.match(await text('.briefing-today'), /План на сегодня/);
    assert.match(await text('.briefing-focus'), /312 чеков со средним чеком 694 ₽/);
    assert.match(await text('.briefing-month-info'), /Срез на 22\.11\.2026/);
    assert.match(await text('.briefing-competition'), /5 из 305/);
    await setDay('2026-11-22');
    assert.match(await text('.briefing-ring strong'), /86,1/);
    assert.match(await text('.briefing-month-info'), /115,5.*%/);
    assert.match(await text('.briefing-month-info'), /\+822\s645/);
    assert.match(await text('.briefing-competition'), /Место по РФ\s+5 из 305\s+К сети\s+\+14,4\s+п\. п\.\s+К региону\s+\+6,9/);
    const cards = await page.$$eval('.briefing-kpi-card', elements =>
      elements.map(el => [el.querySelector('strong').innerText.replace(/\s+/g, ' '), el.classList.contains('good'), getComputedStyle(el).backgroundColor]));
    assert.deepEqual(cards, ['115,5 %', '116,1 %', '153,2 %', '108 %'].map(value => [value, true, 'rgb(229, 244, 233)']));
    assert.match(await text('.briefing-kpi-card:nth-child(3)'), /План 151,1\s*%[\s\S]*Факт 154\s*%/);
    assert.match(await text('.briefing-kpi-card:first-child'), /Факт 6\s136\s758/);
    await page.$eval('#briefingWatch', el => {
      el.value = '117';
      document.getElementById('briefingGood').value = '118';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await page.$eval('.briefing-kpi-card:first-child', el => getComputedStyle(el).backgroundColor), 'rgb(253, 232, 230)');
    await page.$eval('#briefingWatch', el => {
      el.value = '90';
      document.getElementById('briefingGood').value = '100';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.match(await text('.briefing-today'), /План на день[\s\S]*День завершён[\s\S]*204\s307\s*₽/);
    assert.match(await text('.briefing-day-goal:first-child'), /275\s079\s*₽[\s\S]*122,2/);
    assert.equal(await page.$('.briefing-departments'), null);
    assert.match(await text('.briefing-sku'), /Нет данных акции/);
    assert.equal(await page.$$eval('.briefing-chart', rows => rows.length), 2);
    assert.equal(await page.$$eval('.briefing-chart .briefing-chart-day', rows => rows.length), 60);
    assert.equal(await page.$$eval('.briefing-chart-day.selected[data-date="2026-11-22"]', rows => rows.length), 2);
    assert.equal(await page.$$eval('.briefing-chart-day[data-date="2026-11-23"] .fact', rows => rows.length), 0);
    assert.equal(await page.$$eval('.briefing-chart-day[data-date="2026-11-23"] .plan', rows => rows.length), 2);
    await page.click('#briefingGenerate');
    assert.equal(await text('#briefingStatus'), 'Брифинг сформирован.');
    await page.click('#briefingPreview');
    assert.equal(await page.$eval('#briefingPreview', el => el.getAttribute('aria-pressed')), 'true');
    await page.emulateMediaType('print');
    assert.equal(await page.$eval('.briefing-controls', el => getComputedStyle(el).display), 'none');
    assert.equal(await page.$eval('#su-sidebar', el => getComputedStyle(el).display), 'none');
    await exportA4();
    await page.emulateMediaType(null);
    await page.select('#briefingOrientation', 'landscape');
    assert.equal(await page.$eval('#briefingCard', el => el.classList.contains('briefing-landscape')), true);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('soldie.briefing.v1')).orientation), 'landscape');
    await exportA4(true);

    await page.select('#briefingPeriod', 'week');
    assert.match(await text('.briefing-kpi'), /16\.11\.2026 — 22\.11\.2026/);
    assert.equal(await page.$$eval('.briefing-chart-day', rows => rows.length), 14);
    await setDay('2026-11-23');
    assert.match(await text('.briefing-today'), /время среза неизвестно/);
    assert.match(await text('.briefing-day-goal:first-child'), /Факт —/);
    assert.match(await text('.briefing-month-info'), /Факт на 22\.11\.2026/);
    assert.match(await text('.briefing-data-note'), /последний закрытый день/);
    assert.match(await text('.briefing-competition'), /5 из 305/);

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
    assert.match(await text('.briefing-today'), /План на сегодня[\s\S]*Данные на 12:15/);
    assert.match(await text('.briefing-day-goal:first-child'), /100\s000\s₽[\s\S]*40\s000\s₽[\s\S]*60\s000\s₽/);
    assert.match(await text('.briefing-day-detail:first-child'), /План 1\s000\s₽\s+Факт 800\s₽\s+Нужен на оставшиеся чеки 1\s200\s₽/);
    assert.match(await text('.briefing-day-detail:last-child'), /План 45\s000\s₽\s+Факт 20\s000\s₽\s+Осталось 25\s000\s₽/);
    assert.match(await text('.briefing-sku'), /12\s*%[\s\S]*20\s*%[\s\S]*14\s*шт\./);
    assert.equal(await page.$$eval('.briefing-sku li', rows => rows.length), 3);
    await exportA4(true);
    await page.select('#briefingOrientation', 'portrait');
    await exportA4();
    await page.evaluate(() => { window.print = () => { window.printCount = (window.printCount || 0) + 1; }; });
    await page.click('#briefingPrint');
    await page.click('#briefingPdf');
    assert.equal(await page.evaluate(() => window.printCount), 2);
    assert.match(await text('#briefingStatus'), /Сохранить как PDF/);
    await page.evaluate(() => { window.AndroidBridge = { printDailyBriefing: landscape => { window.nativeOrientation = landscape; } }; });
    await page.select('#briefingOrientation', 'landscape');
    await page.click('#briefingPrint');
    assert.equal(await page.evaluate(() => window.nativeOrientation), true);
    await page.click('[data-mode="vision"]');
    assert.equal(await page.$eval('#briefingCard', el => el.classList.contains('hidden')), true);
    assert.equal(await page.$eval('body', el => el.classList.contains('briefing-active')), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
