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
    await page.goto(pathToFileURL(path.resolve(__dirname, '../../galamart-analyst/index.html')).href);
    const input = selector => page.waitForSelector(selector, { timeout:30000 });
    await (await input('#f2')).uploadFile(path.resolve(__dirname, '../Статистика (расширенная) ГМ за 2026-11-22.xlsx'));
    await page.waitForFunction(() => document.getElementById('ch2').classList.contains('ok'), { timeout:60000 });
    await (await input('#f1')).uploadFile(path.resolve(__dirname, '../Рейтинг по выполнению плана на 2026-11-22.xlsx'));
    await page.waitForFunction(() => document.getElementById('ch1').classList.contains('ok'), { timeout:60000 });

    const store = 'МСК Ногинск Комсомольская';
    assert.deepEqual(await page.select('#storeSel', store), [store]);
    const parsed = await page.evaluate(name => {
      const plan = VisionMeeting.current().plan;
      const key = VisionMeeting.storeKey(name);
      const checks = plan.dailyChk[key];
      return {
        monthly: checks?.monthly?.['2026-11'],
        fact: checks?.fact?.m,
        toForecast: plan.dailyTO[key]?.prog?.m,
        weekly: checks?.fact?.d.slice(15, 22)
      };
    }, store);
    assert.deepEqual(parsed.monthly, { plan:15876, prog:16374 });
    assert.equal(parsed.fact, 12027);
    assert.equal(parsed.toForecast, 10582);
    assert.ok(parsed.weekly.every(Number.isFinite));

    await page.click('[data-mode="meeting"]');
    const row = id => page.$$eval(`#meetingOutput tr[data-meeting-row="${id}"] .meeting-number`, cells =>
      cells.map(cell => Number(cell.textContent.replace(/\s/g, '').replace(',', '.'))));
    assert.deepEqual(await row('progFulChecks'), [103.14, 98.42, 98.87, 98.45, 98.6]);
    assert.equal((await row('fulChecks'))[0], 75.5);

    await page.select('#meetingMode', 'rolling');
    assert.equal((await row('checks'))[0], parsed.weekly.reduce((total, count) => total + count, 0));
    assert.ok((await row('progFulChecks')).every(Number.isFinite));
    assert.deepEqual(errors, []);
    console.log('PASS: real Vision exports, merged store rows, five check forecast columns, actual and weekly check totals');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
