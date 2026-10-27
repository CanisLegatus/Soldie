const assert = require("node:assert/strict"),
  puppeteer = require("puppeteer-core"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url");
(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage(),
      errors = [],
      network = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) network.push(r.url());
    });
    page.on("dialog", (d) => d.accept());
    await page.setViewport({ width: 1500, height: 1000 });
    await page.evaluateOnNewDocument(() => {
      const Native = Date;
      window.Date = class extends Native {
        constructor(...a) {
          super(...(a.length ? a : ["2026-10-26T09:00:00+03:00"]));
        }
        static now() {
          return new Native("2026-10-26T09:00:00+03:00").getTime();
        }
      };
    });
    await page.goto(
      pathToFileURL(path.resolve("galamart-analyst/index.html")).href,
    );
    await page.click('[data-mode="sales"]');
    await page.evaluate(() => sku3Api.ready);
    await page.evaluate(() => {
      const s = sku3Api.getState();
      s.settings.storeName = "Тест";
      s.sales = [];
      s.imports = [];
      for (const date of SalesRules.days("2026-09-28", "2026-10-25")) {
        if (date === "2026-10-15") continue;
        s.imports.push({ date });
        const qty = date < "2026-10-12" ? 10 : 11;
        s.sales.push(
          {
            date,
            article: "931-606",
            name: "Хлеб",
            seller: "Продавец",
            qty,
            sum: qty * (date < "2026-10-12" ? 100 : 80),
          },
          {
            date,
            article: "931-544",
            name: "Торт",
            seller: "Продавец",
            qty: 2,
            sum: 80,
          },
        );
      }
      s.sales.push({
        date: "2026-10-20",
        article: "931-606",
        qty: -2,
        sum: -160,
      });
      rawData = [
        {
          код: "931-606",
          товар: "Хлеб",
          магазин: "Тест",
          "группа 1": "Еда",
          "группа 2": "Выпечка",
          "группа 3": "Хлеб",
          "себ, руб.": 60,
          "цена маг, руб.": 80,
          "склад кол": 15,
        },
        {
          код: "931-544",
          товар: "Торт",
          магазин: "Тест",
          "группа 1": "Еда",
          "группа 2": "Выпечка",
          "группа 3": "Торты",
          "себ, руб.": 50,
          "цена маг, руб.": 40,
          "склад кол": 100,
        },
      ];
      reportDate = new Date("2026-10-25T00:00:00");
      salesRefresh();
    });
    assert.match(await page.$eval("#slKpis", (e) => e.textContent), /Возвраты/);
    assert.doesNotMatch(
      await page.$eval("#saView", (e) => e.textContent),
      /NaN|undefined/,
    );
    assert.equal(
      await page.evaluate(
        () => Chart.getChart("saQtyChart").data.datasets[0].data[17],
      ),
      null,
    );
    assert.equal(
      await page.evaluate(
        () => Chart.getChart("saQtyChart").data.datasets[1].data[22],
      ),
      2,
    );
    assert.ok(
      (await page.$$eval("#saView td.sa-red", (els) => els.length)) > 0,
    );
    await page.screenshot({
      path: "/tmp/suadela-sales-overview.png",
      fullPage: true,
    });
    await page.select("#saScope", "group");
    await page.select("#saLevel", "3");
    assert.equal(await page.$$eval("#saGroup option", (els) => els.length), 3);
    await page.select("#saGroup", '["Еда","Выпечка","Хлеб"]');
    assert.match(await page.$eval("#saView h3", (e) => e.textContent), /Хлеб/);
    await page.select("#saScope", "selection");
    await page.$eval("#saCodes", (e) => (e.value = "931-606, 931-544 931-606"));
    await page.click('[data-sa="apply-codes"]');
    assert.match(
      await page.$eval("#saSelectionSummary", (e) => e.textContent),
      /Выбрано: 2/,
    );
    await page.select("#saScope", "store");
    await page.click('[data-sl-tab="skus"]');
    assert.equal(
      await page.$$eval(".sa-table tbody tr", (els) => els.length),
      2,
    );
    await page.click('[data-sa-focus="931-606"]');
    assert.match(await page.$eval("#saView h3", (e) => e.textContent), /1 SKU/);
    await page.click('[data-sl-tab="cuts"]');
    await page.click('[data-sl-action="add-cut"]');
    await page.$eval("#slCutDate", (e) => (e.value = "2026-10-12"));
    await page.$eval("#saOldPrice", (e) => (e.value = "100"));
    await page.$eval("#saNewPrice", (e) => (e.value = "80"));
    await page.click("#saCutForm button[type=submit]");
    assert.match(await page.$eval("#saView", (e) => e.textContent), /80 ₽/);
    assert.match(
      await page.$eval("#saView", (e) => e.textContent),
      /С поправкой на день недели/,
    );
    await page.click('[data-sa-focus="931-606"]');
    assert.equal(
      await page.evaluate(
        () => Chart.getChart("saQtyChart").data.datasets[0].data[0],
      ),
      10,
    );
    await page.click('[data-sl-tab="forecast"]');
    assert.match(
      await page.$eval("#saView", (e) => e.textContent),
      /Недополученный ТО/,
    );
    const forecast = await page.evaluate(
      () => Chart.getChart("saForecastChart").data,
    );
    assert.equal(forecast.datasets.length, 4);
    assert.ok(forecast.datasets[3].data.some((x) => x > 0));
    await page.$eval('[data-sa-incoming="931-606"]', (e) => {
      e.value = "200";
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.select("#slMetricSel", "gp");
    assert.doesNotMatch(
      await page.$eval("#saView", (e) => e.textContent),
      /NaN|undefined/,
    );
    await page.screenshot({
      path: "/tmp/suadela-sales-forecast.png",
      fullPage: true,
    });
    await page.evaluate(() => {
      window.__export = null;
      XLSX.writeFile = (wb) => {
        window.__export = Object.fromEntries(
          wb.SheetNames.map((n) => [
            n,
            XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }),
          ]),
        );
      };
    });
    await page.click('[data-sl-action="export"]');
    assert.ok(await page.evaluate(() => __export["Прогноз"].length > 7));
    assert.ok(
      await page.evaluate(() => __export["Продажи"].some((r) => r[7] < 0)),
    );
    await page.select("#saScope", "store");
    await page.select("#saScope", "selection");
    await page.$eval("#saCodes", (e) => (e.value = "931-606 931-544"));
    await page.click('[data-sa="apply-codes"]');
    await page.type("#saPickerSearch", "Хлеб");
    await new Promise((r) => setTimeout(r, 350));
    assert.match(
      await page.$eval("#saSelectionSummary", (e) => e.textContent),
      /Выбрано: 2/,
    );
    assert.match(await page.$eval("#saView", (e) => e.textContent), /2 SKU/);
    await page.setViewport({ width: 390, height: 844 });
    await page.click("#su-menu");
    await page.click('[data-mode="sales"]');
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({
      path: "/tmp/suadela-sales-mobile.png",
      fullPage: true,
    });
    assert.ok(
      (await page.$eval(".su-main", (e) => e.getBoundingClientRect().right)) <=
        391,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    // Same product and seller: sales and returns must remain separate after import.
    await page.evaluate(async () => {
      const rows = [
        ["Отчёт за период 26.10.2026"],
        ["Номенклатура.Код", "Количество товаров", "Сумма продаж со скидкой"],
        ["Иванова Мария Петровна", "", ""],
        ["Хлеб", 10, 1000],
        ["931-606", 10, 1000],
        ["Возврат хлеба", -2, -200],
        ["931-606", -2, -200],
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(rows),
        "Продажи",
      );
      await sku3Api.handleImportFiles([
        new File(
          [XLSX.write(wb, { type: "array", bookType: "xlsx" })],
          "returns.xlsx",
        ),
      ]);
      await sku3Api.confirmImport();
    });
    assert.deepEqual(
      await page.evaluate(() =>
        sku3Api
          .getState()
          .sales.filter((r) => r.date === "2026-10-26")
          .map((r) => r.qty),
      ),
      [10, -2],
    );
    await page.setViewport({ width: 1500, height: 1000 });
    await page.evaluate(() =>
      localStorage.setItem(
        "sales_dashboard_v1_cuts",
        JSON.stringify([{ entity: "Старая группа", date: "2026-10-01" }]),
      ),
    );
    await page.reload();
    await page.click('[data-mode="sales"]');
    await page.evaluate(() => sku3Api.ready);
    await page.click('[data-sl-tab="cuts"]');
    assert.match(await page.$eval("#saView", (e) => e.textContent), /80 ₽/);
    assert.match(
      await page.$eval("#saView", (e) => e.textContent),
      /Старые отсечки без цен: 1/,
    );
    await page.evaluate(() => {
      rawData = [
        {
          код: "931-606",
          товар: "Хлеб",
          магазин: "Другой магазин",
          "себ, руб.": 60,
          "цена маг, руб.": 80,
          "склад кол": 20,
        },
      ];
      reportDate = new Date("2026-10-26T00:00:00");
      salesRefresh();
    });
    assert.match(
      await page.$eval("#saQuality", (e) => e.textContent),
      /Связь себестоимости и запаса отключена/,
    );
    await page.click('[data-sl-tab="overview"]');
    assert.ok(
      await page.evaluate(() =>
        Chart.getChart("saGpChart").data.datasets[0].data.every(
          (v) => v === null || v === 0,
        ),
      ),
    );
    const chartBefore = await page.evaluate(
      () => Chart.getChart("saQtyChart").data.datasets[0].data,
    );
    await new Promise((r) => setTimeout(r, 1600));
    assert.deepEqual(
      await page.evaluate(
        () => Chart.getChart("saQtyChart").data.datasets[0].data,
      ),
      chartBefore,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: sales hierarchy, selections, return/profit charts, missing dates, reprice events, forecast/stock simulation, exports, mobile, split return import, offline",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
