/* Offline browser regression suite. CHROME_BIN may point to a local Chromium. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');
async function run() {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/chromium', args:['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.emulateTimezone('Europe/Moscow');
    await page.evaluateOnNewDocument(() => {
      const OriginalDate = Date;
      window.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : ['2026-10-26T09:00:00+03:00'])); }
        static now() { return new OriginalDate('2026-10-26T09:00:00+03:00').getTime(); }
      };
    });
    const url = pathToFileURL(path.resolve(__dirname,'galamart-analyst/index.html')).href;
    await page.goto(url);await page.click('[data-mode="dash"]');
    await page.evaluate(() => {
      const values = { 'код':'A-001','товар':'Медленный товар','группа 1':'Группа','группа 2':'Подгруппа','группа 3':'Тип','себ, руб.':10,'цена тн, руб':29.9,'цена маг, руб.':29.9,'наценка %':199,'склад кол':80,'склад сумма, руб.':800,'продано (шт)':20,'то сс, руб':200,'то, руб':598,'остатки, дней':112,'дата ввоза':'01.08.2026','дата окончания продаж':'30.10.2026','кубы':'ЗО вр' };
      const rows = [['Справка - Остатки по датам ввоза. Дата остатков: 25.10.2026, период продаж: с 28.09.2026 по 25.10.2026'],[],CANON_HEADERS, CANON_HEADERS.map(key=>values[key]??'')];
      const dead={...values,'код':'A-002','товар':'Мёртвый товар','продано (шт)':0,'то, руб':0,'то сс, руб':0,'остатки, дней':9999,'дата окончания продаж':'25.10.2026','кубы':'!ВНЕ_АМ-1'};
      rows.push(CANON_HEADERS.map(key=>dead[key]??''));
      const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Отчёт');
      const file=new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'stock.xlsx');
      const dt=new DataTransfer();dt.items.add(file);fileInput.files=dt.files;fileInput.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(()=>rawData.length===2);
    assert.equal(await page.evaluate(()=>aggRows(rawData).slowCount),2);
    assert.equal(await page.evaluate(()=>aggRows(rawData).deadCount),1);
    assert.equal(await page.evaluate(()=>fmtDate(reportDate)),'25.10.2026');
    assert.match(await page.$eval('#dashContent',el=>el.textContent),/Медленный сток/);
    await page.click('[data-dash-open="slow"]');
    assert.match(await page.$eval('#modalBox',el=>el.textContent),/Медленный товар/);
    await page.evaluate(()=>closeModal());
    await page.click('[data-mode="analysis"]'); await page.click('[data-an-page="slow"]');
    assert.match(await page.$eval('#anContent',el=>el.textContent),/26,7%/);
    await page.evaluate(()=>{ anTab='items'; renderAnalysis(); });
    assert.match(await page.$eval('#anContent',el=>el.textContent),/20[.,]0%/);
    await page.evaluate(()=>{
      openProduct('A-001');closeModal();openGroup('Группа');closeModal();openCube('ЗО вр');closeModal();
      for (const item of AN_PAGES) {anPage=item.key;anTab='groups';renderAnalysis();anTab='items';renderAnalysis();}
      for (const key of ['to','gp','markup','sales','stock','dead','slow','turnover']) {openDashDrill(key);closeModal();}
    });
    await page.click('[data-mode="verify"]');
    await page.type('#verifyCodeInput','A-001');await page.click('#verifyCodeBtn');
    assert.match(await page.$eval('#verifyContent',el=>el.textContent),/Медленный товар/);
    await page.click('[data-mode="gifts"]');
    await page.select('#giftStockFilter','dead');
    assert.equal(await page.$$eval('.gift-check',els=>els.length),1);
    await page.evaluate(()=>{document.querySelector('#giftCubeFilter input[value="ЗО"]').checked=true;document.getElementById('giftCubeFilter').dispatchEvent(new Event('change'));});
    assert.equal(await page.$$eval('.gift-check',els=>els.length),0);
    assert.deepEqual(await page.evaluate(()=>{
      const r=rawData[0], log=getLogistics(cfg);return {gp:zoneStats(['A-001','A-001']).agg.gp,blocked:zoneItemStatus(r,10,log).st};
    }),{gp:398,blocked:'discontinued'});
    await page.click('[data-mode="sellto"]');

    await page.evaluate(()=>{filterDateInput.value='2026-10-30';filterDateInput.dispatchEvent(new Event('change'));});
    await page.click('#processBtn'); await page.waitForSelector('#tableBody tr');
    assert.equal(await page.evaluate(()=>rowMarkdown(rawData[1]).expired),true);
    assert.equal(await page.evaluate(()=>rowMarkdown(rawData[1]).price),1);
    await page.evaluate(()=>{const input=tableBody.querySelector('.price-input');input.value='2.9';input.dispatchEvent(new Event('input'));document.getElementById('mdChangedOnly').checked=true;});
    assert.equal(await page.evaluate(()=>markdownExportRows().length),2);
    assert.equal(await page.evaluate(()=>{tableBody.querySelector('.price-input').value='';try{markdownExportRows();return false}catch{return true}}),true);
    await page.click('[data-mode="sales"]');
    assert.equal(await page.evaluate(()=>sku3Api.ready),true);
    const metrics=await page.evaluate(async()=>{
      const st=sku3Api.getState(); st.settings.startDate='2026-10-01';st.settings.endDate='2026-10-31';st.settings.minPayout=500;st.settings.fundMode='cashiersByUnits';
      st.settings.employees=[{id:'e',name:'Иванова Мария Петровна'}];
      st.settings.skus=[{id:'a',name:'A',articles:['931-606'],planUnits:100,cashierRate:5,fundRate:2,threshold:80,enabled:true},{id:'b',name:'B',articles:['931-544'],planUnits:100,cashierRate:5,fundRate:2,threshold:80,enabled:true}];
      st.sales=[{date:'2026-10-05',seller:'Иванова Мария Петровна',article:'931-606',name:'Товар A',qty:70,sum:700},{date:'2026-10-05',seller:'Иванова Мария Петровна',article:'931-544',name:'Товар B',qty:100,sum:1000},{date:'2026-10-05',seller:'',article:'931-606',qty:1000,sum:10000},{date:'2026-10-05',seller:'Иванова Мария Петровна',article:'931-606',qty:-2,sum:-20}];
      st.imports=[{date:'2026-10-05'},{date:'2026-10-06'}];
      st.checks=[{date:'2026-10-05',seller:'__STORE__',checks:100},{date:'2026-10-06',seller:'Иванова Мария Петровна',checks:50}];
      const m=sku3Api.computeMetrics();
      window.salesRefresh?.();
      return {units:m.totals.units,payable:m.totals.payableTotal,base:m.totals.currentBase,fund:m.totals.currentFund,checks:m.storeChecks,pace:m.totals.paceUnitsPerDay,needed:m.totals.perDayToPlan};
    });
    assert.equal(metrics.checks,150);assert.equal(metrics.units,170); assert.equal(metrics.payable,700);assert.equal(metrics.base,850);assert.equal(metrics.fund,200);
    assert.ok(Math.abs(metrics.pace-170/25)<1e-8); assert.equal(metrics.needed,5);
    const thresholdCases=await page.evaluate(()=>{
      const st=sku3Api.getState(), skus=st.settings.skus, sales=st.sales, min=st.settings.minPayout;
      st.settings.minPayout=0;st.settings.skus=[skus[0]];
      const results=[70,80,100].map(qty=>{st.sales=[{...sales[0],qty}];return sku3Api.computeMetrics().totals.payableTotal;});
      st.settings.skus=skus;st.sales=sales;st.settings.minPayout=min;return results;
    });
    assert.deepEqual(thresholdCases,[350,560,700]);
    // Parser/import roundtrip: last file replaces the entire day, returns survive separately.
    await page.evaluate(async()=>{
      const files=[2,3].map(qty=>{
        const rows=[['Отчёт за период 07.10.2026'],['Номенклатура.Код','Количество товаров','Сумма продаж со скидкой'],['Иванова Мария Петровна','',''],['Товар A',qty,qty*10],['931-606',qty,qty*10],['Возврат',-1,-10],['931-544',-1,-10]];
        const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Продажи');
        return new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'sales'+qty+'.xlsx');
      });
      await sku3Api.handleImportFiles(files);await sku3Api.confirmImport();
    });
    assert.equal(await page.evaluate(()=>sku3Api.getState().sales.find(r=>r.date==='2026-10-07'&&r.article==='931-606').qty),3);
    assert.equal(await page.evaluate(()=>sku3Api.getState().sales.find(r=>r.date==='2026-10-07'&&r.article==='931-544').qty),-1);
    await page.evaluate(async()=>{
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Отчёт за период 08.10.2026'],['Номенклатура.Код','Количество товаров','Сумма продаж со скидкой'],['Итого',0,0]]),'Продажи');
      const file=new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'zero.xlsx');
      await sku3Api.handleImportFiles([file]);await sku3Api.confirmImport();
    });
    assert.equal(await page.evaluate(()=>sku3Api.getState().imports.some(row=>row.date==='2026-10-08')),true);
    await page.reload(); await page.click('[data-mode="sales"]');assert.equal(await page.evaluate(()=>sku3Api.ready),true);
    assert.equal(await page.evaluate(()=>sku3Api.getState().sales.find(r=>r.date==='2026-10-07'&&r.article==='931-606').qty),3);
    assert.match(await page.$eval('#slKpis',el=>el.textContent),/Возвраты/);
    await page.click('[data-mode="vision"]');
    await page.evaluate(()=>{
      const rows=[['LFL 1,2','LFL 2','№','Магазин','Регион','ФО','Площадь'],['A','A',1,'Магазин А','Регион','ФО',200,100,28,1000,357,300,30,107,700,42.86,5000,1000,1000,200,300,5,500,1000,10,2.5],['A','A',2,'Магазин Б','Регион','ФО',400,200,28,2000,357,500,25,89,1500,33.33,10000,2000,1000,200,250,5,1000,2000,10,2.5]];
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'статистика расширенная');vIngest(2,wb,'stats.xlsx');
    });
    assert.equal(await page.$eval('#visionContainer #app',el=>el.classList.contains('hidden')),false);
    const visionTabs=await page.$$eval('#visionContainer #tabs button',els=>els.map(el=>el.dataset.t));
    for (const tab of visionTabs) await page.click('#visionContainer #tabs [data-t="'+tab+'"]');
    assert.doesNotMatch(await page.$eval('#visionContainer #view',el=>el.textContent),/NaN/);

    await page.click('[data-mode="dash"]');
    assert.equal(await page.$eval('#dashCard',el=>getComputedStyle(el).fontSize),'16px');
    const fs = require('node:fs');
    const sample = fs.readdirSync(path.join(__dirname,'galamart-analyst')).find(name=>name.endsWith('.xlsx') && name.startsWith('╨Ю'));
    if (sample) {
      await (await page.$('#fileInput')).uploadFile(path.join(__dirname,'galamart-analyst',sample));
      await page.waitForFunction(()=>rawData.length>7000);
      assert.equal(await page.evaluate(()=>codeIndex.size),7400);
      for (const mode of ['analysis','top100','gifts','zones','browse','dash']) await page.click('[data-mode="'+mode+'"]');
      await page.evaluate(()=>DirectorApp.whenIdle());
      await page.click('[data-mode="director"]');
      for (const tab of ['today','prices','shortage','problem','shelf','clearance','efficiency','quality']) await page.click('[data-su-director="'+tab+'"]');
      assert.doesNotMatch(await page.$eval('#directorCard',el=>el.textContent),/NaN/);
      console.log('PASS: реальный отчёт — 7400 артикулов, включая аналитику директора');
    }
    await page.goto(pathToFileURL(path.resolve(__dirname,'suadela/suadela.html')).href);
    await page.waitForFunction(()=>location.hash==='#sku3'&&!!window.sku3Api);
    await page.evaluate(()=>sku3Api.ready);
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    console.log('PASS: file://, stock/slow/dead, gifts, zones, markdown/export, 3SKU payouts, parser/replacement, IndexedDB reload, offline entry links');
  } finally { await browser.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
