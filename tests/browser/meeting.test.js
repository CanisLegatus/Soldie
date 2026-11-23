const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1300, height: 900 });
    await page.emulateTimezone('Europe/Moscow');
    await page.evaluateOnNewDocument(() => {
      const NativeDate = Date;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : ['2026-11-23T09:00:00+03:00'])); }
        static now() { return new NativeDate('2026-11-23T09:00:00+03:00').getTime(); }
      };
    });
    const url = pathToFileURL(path.resolve(__dirname, '../../galamart-analyst/index.html')).href;
    await page.goto(url);
    const coveredDates = await page.evaluate(() => {
      const workbook = XLSX.utils.book_new();
      for (const [name, date, fact] of [['Октябрь', '31.10.2026', 15], ['Ноябрь', '1.11.2026', 30]]) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
          ['Магазин', '', '', '', 'План', date], ['Наш магазин', '', '', 'Факт', '', fact]
        ]), name);
      }
      const series = VisionMeeting.readPlan(workbook).dailyTO['наш магазин'];
      return [series.isoDates, series.fact.d];
    });
    assert.deepEqual(coveredDates, [['2026-10-31', '2026-11-01'], [15, 30]]);
    await page.evaluate(() => {
      window.meetingStatsBook = factor => {
        const heading = ['LFL 1,2', 'LFL 2', '№', 'Магазин', 'Регион', 'ФО', 'Дата технического открытия'];
        const stores = [['Наш магазин', 'Север', 'A', 1, 300], ['Другой', 'Север', 'B', 2, 100], ['Третий', 'Юг', 'A', 3, 80]];
        const rows = stores.map(([name, region, lfl, id, to]) => {
          const row = [lfl, lfl, id, name, region, 'ФО', '01.01.2018'];
          Object.entries({ 8:300, 12:to * 1.1, 14:to, 15:to / 1.2, 16:20, 20:to / 4, 22:to / 5, 23:to / 6, 24:20,
            29:to * .8, 32:25, 33:to * 5, 36:to * 3, 37:66.67, 38:to * 2, 39:to * 1.5, 40:33.33,
            43:500, 44:450, 45:11.11, 46:200 }).forEach(([i, value]) => {
            row[i] = [12, 14, 15, 20, 22, 23, 29, 33, 36, 38, 39].includes(Number(i)) ? value * factor : value;
          });
          if (factor < 1 && id === 1) row[46] = undefined;
          return row;
        });
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([heading, ...rows]), 'статистика расширенная');
        return book;
      };
      vIngest(2, meetingStatsBook(1), 'month.xlsx');
      const dates = Array.from({ length:30 }, (_, i) => `${i+1}.11.26`);
      const plan = XLSX.utils.book_new();
      for (const [sheetName, suffix, factor] of [['ТО План-Факт', '', 1], ['Чеки План-Факт', ' чеков', 2]]) {
        const rows = [['Магазин', '', '', '', 'План', ...dates]];
        for (const [name, scale] of [['Наш магазин', 3], ['Другой', 2], ['Третий', 1]]) {
          const fact = dates.map((_, i) => i < 22 ? (i + 1) * scale * factor : null);
          rows.push([name, '', '', 'Факт' + suffix, '', ...fact],
            [name, '', '', 'План' + suffix, '', ...dates.map(() => 15 * scale * factor)],
            [name, '', '', 'Прогноз' + suffix, '', ...dates.map(() => 16 * scale * factor)]);
        }
        XLSX.utils.book_append_sheet(plan, XLSX.utils.aoa_to_sheet(rows), sheetName);
      }
      // Vision calculates network forecast ratios from stores with both forecasts and plans.
      XLSX.utils.book_append_sheet(plan, XLSX.utils.aoa_to_sheet([
        ['№', 'Магазин', 'ТО-прогноз, тыс', 'ТО-прогноз выполнения', 'ВП-прогноз, тыс', 'ВП-прогноз выполнения'],
        [1, 'Наш магазин', 363, 110, 90, 120], [2, 'Другой', 88, 80, 20, 80]
      ]), 'Рейтинг');
      vIngest(1, plan, 'plan.xlsx');
    });
    await page.click('[data-mode="meeting"]');
    await page.evaluate(() => sku3Api.ready);
    assert.equal(await page.$eval('#meetingMode', el => el.value), 'month');
    assert.deepEqual(await page.$$eval('#meetingOutput table thead th', els => els.map(el => el.textContent)),
      ['Показатель', 'Мы', 'Сеть', 'Регион', 'Моя LFL', 'Похожие']);
    const cellSelector = (row, col) => `#meetingOutput tr[data-meeting-row="${row}"] td:nth-of-type(${col})`;
    const cell = (row, col) => page.$eval(cellSelector(row, col) + ' .meeting-number', el => el.textContent);
    const arrow = (row, col) => page.$eval(cellSelector(row, col) + ' .meeting-arrow', el => el.textContent);
    assert.equal(await cell('to', 1), '300');
    assert.equal(await cell('to', 3), '200');
    assert.equal(await cell('to', 5), '80');
    assert.equal(await arrow('to', 5), '↓');
    assert.equal(await arrow('growthChecks', 5), '→');
    assert.deepEqual(await page.$$eval('#meetingOutput tr[data-meeting-row="to"] td', cells =>
      cells.map(cell => !!cell.querySelector('.meeting-cup'))), [true, false, false, false, false]);
    assert.equal(await page.$$eval('#meetingOutput tr[data-meeting-row="growthChecks"] .meeting-cup', cups => cups.length), 5);
    assert.equal(await page.$$eval(cellSelector('progFulVP', 5) + ' .meeting-arrow', arrows => arrows.length), 0);
    assert.equal(await cell('vp', 1), '60');
    assert.equal(await cell('progFul', 2), '102,5');
    assert.equal(await cell('progFulVP', 2), '110');
    assert.equal(await cell('fulChecks', 1), '66,67');
    assert.equal(await cell('fulChecks', 2), '66,67');
    assert.notEqual(await cell('progFulChecks', 1), '66,67');

    await page.evaluate(() => {
      const state = sku3Api.getState();
      Object.assign(state.settings, {
        storeName:'Наш магазин', startDate:'2026-11-01', endDate:'2026-11-30',
        employees:[{ id:'employee', name:'Иванова Мария Петровна' }],
        skus:[{ id:'sku', name:'Подвесной ароматизатор', articles:['794-585'], planUnits:20 }]
      });
      state.imports = ['2026-11-16', '2026-11-17'].map(date => ({ date }));
      state.sales = state.imports.map(({ date }, i) => ({
        date, seller:'Иванова Мария Петровна', article:'794-585', qty:i + 2, sum:100
      }));
    });
    await page.select('#meetingMode', 'rolling');
    assert.equal(await page.$eval('#meetingDays', el => el.value), '7');
    assert.match(await page.$eval('#meetingOutput .meeting-heading', el => el.textContent), /16\.11\.2026 — 22\.11\.2026/);
    assert.equal(await cell('to', 1), '399');
    assert.equal(await cell('vp', 1), '—');
    assert.equal(await cell('avgCheck', 1), '500');
    assert.equal(await cell('fulChecks', 1), '126,67');
    assert.match(await page.$eval('#meetingOutput tbody tr:first-child td small', el => el.textContent), /\+147/);
    assert.match(await page.$eval('.meeting-programs', el => el.textContent), /Подвесной ароматизатор · 5 шт\./);
    assert.ok(await page.$$eval('#meetingCharts canvas', els => els.length >= 4));

    await page.evaluate(() => {
      const input = document.getElementById('meetingStats');
      const dt = new DataTransfer();
      dt.items.add(new File([XLSX.write(meetingStatsBook(.2), { type:'array', bookType:'xlsx' })], 'week.xlsx'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await page.waitForFunction(() => document.getElementById('meetingStatus').textContent.includes('week.xlsx'));
    assert.equal(await cell('vp', 1), '12');
    assert.equal(await cell('vp', 4), '7,6');
    assert.equal(await cell('growthVP', 1), '20');
    await page.evaluate(() => {
      const input = document.getElementById('meetingPlan');
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['№', 'Магазин', 'ВП-прогноз, тыс', 'ВП-прогноз выполнения'],
        [1, 'Наш магазин', 36, 109.09], [2, 'Другой', 12, 109.09], [3, 'Третий', 9.6, 109.09]
      ]), 'Рейтинг');
      const dt = new DataTransfer();
      dt.items.add(new File([XLSX.write(workbook, { type:'array', bookType:'xlsx' })], 'weekly-plan.xlsx'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await page.waitForFunction(() => document.getElementById('meetingStatus').textContent.includes('weekly-plan.xlsx'));
    assert.equal(await cell('progFulVP', 1), '109,09');
    assert.ok(await page.$$eval('#meetingCharts canvas', els => els.length >= 4));
    await page.evaluate(() => {
      for (const [selector, value] of [
        ['input[data-meeting-metric="avgPrice"][data-col="0"]','104.5'],
        ['input[data-block="0"][data-field="label"]','В наличии, шт.'],
        ['input[data-block="0"][data-field="value"]','97'],
        ['textarea[data-block="0"][data-field="note"]','Пополнить выкладку']
      ]) {
        const input = document.querySelector(selector);
        input.value = value;
        input.dispatchEvent(new Event('change', { bubbles:true }));
      }
    });
    assert.equal(await cell('avgPrice', 1), '104,5');
    assert.equal(await arrow('avgPrice', 5), '↑');
    assert.match(await page.$eval('.meeting-programs', el => el.textContent), /Пополнить выкладку/);
    await page.evaluate(() => { window.print = () => { window.meetingPrinted = true; }; });
    await page.click('#meetingPrint');
    assert.equal(await page.evaluate(() => window.meetingPrinted), true);

    await page.emulateMediaType('print');
    assert.equal(await page.$eval('#su-sidebar', el => getComputedStyle(el).display), 'none');
    assert.equal(await page.$eval('.meeting-controls', el => getComputedStyle(el).display), 'none');
    assert.notEqual(await page.$eval('#meetingCard', el => getComputedStyle(el).display), 'none');
    assert.equal(await page.$$eval('#meetingOutput td .meeting-arrow', arrows => arrows.every(arrow =>
      getComputedStyle(arrow).color === 'rgb(0, 0, 0)')), true);
    const pdf = await page.pdf({ preferCSSPageSize:true });
    assert.ok(pdf.length > 15000);
    await page.emulateMediaType('screen');

    await page.reload();
    await page.click('[data-mode="meeting"]');
    await page.evaluate(() => sku3Api.ready);
    await page.select('#meetingMode', 'rolling');
    assert.equal(await cell('vp', 1), '12');
    assert.equal(await cell('progFulVP', 1), '109,09');
    assert.equal(await cell('avgPrice', 1), '104,5');
    const chooseEnd = value => page.evaluate(date => {
      const input = document.getElementById('meetingEnd');
      input.value = date;
      input.dispatchEvent(new Event('change', { bubbles:true }));
    }, value);
    await chooseEnd('2026-11-15');
    await page.evaluate(() => {
      const input = document.querySelector('input[data-meeting-metric="progFulVP"][data-col="0"]');
      input.value = '102';
      input.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await page.click('#meetingSave');
    await chooseEnd('2026-11-22');
    assert.match(await page.$eval('#meetingCharts', el => el.textContent), /ВП · прогноз выполнения плана по сохранённым срезам/);
    assert.match(await page.$eval('#meetingOutput tr[data-meeting-row="progFulVP"] td small', el => el.textContent), /\+7,09 п\. п\./);
    await page.evaluate(() => {
      const input = document.getElementById('meetingDays');
      input.value = '5';
      input.dispatchEvent(new Event('change', { bubbles:true }));
    });
    assert.match(await page.$eval('#meetingOutput .meeting-heading', el => el.textContent), /18\.11\.2026 — 22\.11\.2026/);
    assert.equal(await cell('vp', 1), '—');
    await page.click('[data-mode="vision"]');
    assert.equal(await page.$eval('#meetingCard', el => el.classList.contains('hidden')), true);
    assert.deepEqual(errors, []);
    console.log('PASS: meeting monthly and rolling ranges, Vision scopes, daily deltas and charts, 3SKU, manual values, archives and print');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
