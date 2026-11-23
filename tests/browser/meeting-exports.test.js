const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const XLSX = require('xlsx');
const statsPath = path.resolve(__dirname, '../Статистика (расширенная) ГМ за 2026-11-22.xlsx');
const ratingPath = path.resolve(__dirname, '../Рейтинг по выполнению плана на 2026-11-22.xlsx');

// Reconcile the rendered report independently, using Excel's numeric cells and ranking tables.
function reference(store) {
  const stats = XLSX.readFile(statsPath);
  const rating = XLSX.readFile(ratingPath);
  const rows = (book, sheet) => XLSX.utils.sheet_to_json(book.Sheets[sheet], { header:1 });
  const details = rows(stats, 'Статистика расширенная').filter(r => Number.isInteger(r[2]) && r[3]);
  const ranking = sheet => new Map(rows(rating, sheet).filter(r => r[2] === 1).map(r => [r[1], r]));
  const turnover = ranking('СетьГМ'), profit = ranking('ВП СетьГМ');
  const shop = details.find(r => r[3] === store);
  const lfl = details.filter(r => r[1] === shop[1]);
  const peers = lfl.filter(r => r !== shop && Math.abs(r[8] - shop[8]) <= 0.3 * shop[8]);
  const scopes = [[shop], details, details.filter(r => r[4] === shop[4]), lfl, peers];
  assert.deepEqual(scopes.map(group => group.length), [1, 305, 24, 267, 228]);
  const totals = rows(stats, 'Статистика расширенная').find(row => row[0] === 'Итого');
  const weekly = sheet => {
    const block = rows(rating, sheet);
    const header = block.find(row => row[0] === 'Магазин');
    const columns = Array.from({length:7}, (_, day) => header.indexOf((16 + day) + '.11.2026'));
    assert.ok(columns.every(index => index >= 0));
    const result = new Map();
    let name;
    for (const row of block) {
      if (row[0]) name = row[0];
      const kind = String(row[3]).split(' ')[0];
      if (['Факт', 'План'].includes(kind)) {
        if (!result.has(name)) result.set(name, {});
        const values = columns.map(index => row[index]);
        result.get(name)[kind] = values.every(Number.isFinite) ? values.reduce((a,b) => a+b) : null;
      }
    }
    return result;
  };
  const toWeek = weekly('ТО План-Факт'), checkWeek = weekly('Чеки План-Факт');
  const rolling = scopes.map(group => {
    const total = (sheet, kind) => {
      const values = group.map(row => sheet.get(row[3])?.[kind]);
      return values.every(Number.isFinite) ? values.reduce((a,b) => a+b) : null;
    };
    const to = total(toWeek,'Факт'), checks = total(checkWeek,'Факт');
    const divide = (a,b,scale) => a!=null && b>0 ? a/b*scale : null;
    return {to:divide(to,group.length,1), checks:divide(checks,group.length,1),
      avgCheck:divide(to,checks,1000), fulChecks:divide(checks,total(checkWeek,'План'),100)};
  });
  const monthly = scopes.map(group => {
    const sum = fn => group.reduce((total, row) => total + fn(row), 0);
    const col = i => sum(row => row[i]);
    const growth = (a, b) => (a / b - 1) * 100;
    const from = (map, i) => sum(row => map.get(row[3])[i]);
    return {
      to: col(14) / group.length, vp: col(22) / group.length, checks: col(38) / group.length,
      growthTO: growth(col(14), col(15)), growthVP: growth(col(22), col(23)),
      growthChecks: growth(col(38), col(39)), markup: 100 * col(22) / col(29),
      avgCheck: 1000 * col(14) / col(38), avgPrice: 1000 * col(14) / col(33),
      growthAvgCheck: growth(col(14) / col(38), col(15) / col(39)),
      fulChecks: 100 * col(38) / col(36),
      progFul: 100 * from(turnover, 15) / from(turnover, 3),
      progFulVP: 100 * from(profit, 7) / from(profit, 3),
      progFulChecks: 100 * sum(row => turnover.get(row[3])[9] * turnover.get(row[3])[24]) / from(turnover, 24)
    };
  });
  return { monthly, rolling, network:{
    toPerM2:totals[17], toPerM225:totals[18], vpPerM2:totals[26], vpPerM225:totals[27],
    skuPerM2:totals[57], fillTotal:totals[58], fillTrade:totals[59]
  } };
}
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
    await (await input('#f2')).uploadFile(statsPath);
    await page.waitForFunction(() => document.getElementById('ch2').classList.contains('ok'), { timeout:60000 });
    await (await input('#f1')).uploadFile(ratingPath);
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
    assert.deepEqual(parsed.monthly, { plan:15876, prog:16374.294828916902 });
    assert.equal(parsed.fact, 12027);
    assert.equal(parsed.toForecast, 10582.039604417754);
    assert.ok(parsed.weekly.every(Number.isFinite));

    await page.click('[data-mode="meeting"]');
    const row = id => page.$$eval(`#meetingOutput tr[data-meeting-row="${id}"] .meeting-number`, cells =>
      cells.map(cell => cell.textContent === '—' ? null : Number(cell.textContent.replace(/\s/g, '').replace(',', '.'))));
    assert.match(await page.$eval('#meetingOutput', el => el.textContent.replace(/\s/g,'')), /11979шт.*12027шт/);
    const {monthly:expected, rolling, network} = reference(store);
    const aggregate = await page.evaluate(() => VisionMeeting.aggregate(VisionMeeting.current().stores));
    for (const [key,value] of Object.entries(network)) assert.ok(Math.abs(aggregate[key]-value)<1e-7,key);
    for (const id of Object.keys(expected[0])) {
      const actual = await row(id);
      assert.deepEqual(actual, expected.map(group => Number(group[id].toFixed(2))), id);
    }
    assert.equal(await page.evaluate(() => VisionMeeting.current().stores.length), 305);

    await page.select('#meetingMode', 'rolling');
    for (const id of Object.keys(rolling[0])) {
      assert.deepEqual(await row(id), rolling.map(group => group[id] == null ? null : Number(group[id].toFixed(2))), id);
    }
    assert.equal((await row('checks'))[0], parsed.weekly.reduce((total, count) => total + count, 0));
    assert.ok((await row('progFulChecks')).every(Number.isFinite));
    assert.equal(await page.evaluate(() => {
      const book = XLSX.utils.book_new();
      const header = ['LFL', 'LFL 1,2', '№', 'Магазин', 'Регион', 'ФО', 'Дата технического открытия'];
      header[13] = 'План ТО, тыс.руб';
      XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([header]),'Статистика расширенная');
      try { VisionMeeting.readStats(book); } catch (error) { return error.message; }
      return '';
    }), 'Изменился порядок колонок статистики: План ТО, тыс.руб');
    const reloaded = await page.evaluate(() => {
      const workbook = XLSX.utils.book_new();
      const rows = [['№','Магазин','ТО-прогноз, тыс','ТО-прогноз выполнения'],
        [1,'ЕКБ Магнитогорск Семейный парк',0,'0,0%']];
      XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Рейтинг');
      vIngest(1,workbook,'replacement.xlsx');
      const {stores,plan} = VisionMeeting.current();
      return [Object.keys(plan.dailyChk).length, Object.keys(plan.tn).length,
        stores.find(s => s.name === 'МСК Ногинск Комсомольская').progTO,
        stores.find(s => s.name === 'ЕКБ Магнитогорск Семейный парк').progFul];
    });
    assert.deepEqual(reloaded, [0,0,null,0]);
    assert.deepEqual(errors, []);
    console.log('PASS: real Vision exports, merged store rows, five check forecast columns, actual and weekly check totals');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
