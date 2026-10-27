const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../galamart-analyst/js/sales-rules");
const catalog = new Map([
  [
    "A",
    {
      code: "A",
      name: "A",
      cost: 60,
      price: 100,
      stock: 10,
      group: "G",
      group2: "X",
      group3: "T",
      endDate: null,
    },
  ],
  [
    "B",
    { code: "B", name: "B", cost: null, stock: null, group: "G", group2: "Y" },
  ],
]);
const sale = (date, qty = 2, sum = qty * 100, article = "A") => ({
  date,
  article,
  qty,
  sum,
});
test("sales and returns retain gross, net and profit with current cost", () => {
  const t = R.aggregate(
    [sale("2026-10-01", 10), sale("2026-10-01", -2, -200)],
    catalog,
  );
  assert.equal(t.qty, 10);
  assert.equal(t.revenue, 1000);
  assert.equal(t.returnsQty, 2);
  assert.equal(t.net, 800);
  assert.equal(t.gp, 400);
  assert.equal(t.netGp, 320);
  assert.equal(t.markup, (400 / 600) * 100);
  assert.equal(t.coverage, 1);
});
test("missing costs do not invent profit and gaps differ from confirmed zero days", () => {
  const t = R.aggregate(
    [sale("2026-10-01"), sale("2026-10-01", 2, 200, "B")],
    catalog,
  );
  assert.equal(t.gp, 80);
  assert.equal(t.coverage, 0.5);
  const daily = R.daily(
    [],
    catalog,
    ["2026-10-01", "2026-10-02"],
    new Set(["2026-10-01"]),
  );
  assert.equal(daily[0].loaded, true);
  assert.equal(daily[0].coverage, 1);
  assert.equal(daily[1].loaded, false);
});
test("group paths keep identically named subgroups separate", () => {
  const cat = new Map([
    ...catalog,
    ["C", { ...catalog.get("A"), code: "C", group: "Other" }],
  ]);
  const g = R.groups(
    [sale("2026-10-01"), sale("2026-10-01", 1, 50, "C")],
    cat,
    2,
  );
  assert.equal(g.length, 2);
  assert.notEqual(g[0].key, g[1].key);
});
test("models use observed zero days and never count missing reports as zero", () => {
  const m = R.model(
    [sale("2026-10-01", 10)],
    new Set(["2026-10-01", "2026-10-02"]),
    "2026-10-02",
  );
  assert.equal(m.mean, 5);
  assert.equal(m.sample, 2);
  assert.equal(R.model([], new Set(), "2026-10-02").mean, null);
});
test("forecast advances snapshot, clips sales at stock, distinguishes unknown stock and respects withdrawal", () => {
  const loaded = new Set(R.days("2026-09-28", "2026-10-25"));
  const records = [...loaded].map((d) => sale(d));
  const f = R.forecast({
    records,
    catalog,
    codes: new Set(["A", "B"]),
    loaded,
    historyEnd: "2026-10-25",
    stockDate: "2026-10-25",
    start: "2026-10-26",
    horizon: 7,
  });
  assert.equal(f.items[0].demand, 14);
  assert.equal(f.items[0].fulfilled, 10);
  assert.equal(f.items[0].lost, 4);
  assert.equal(f.items[0].firstOut, "2026-10-31");
  assert.equal(f.unknown, 1);
  assert.equal(f.schedule.arrival, "2026-11-05");
  assert.equal(
    f.dates.reduce((s, d) => s + d.lostRevenue, 0),
    400,
  );
  const withdrawn = new Map([
    ["A", { ...catalog.get("A"), endDate: "2026-10-26" }],
  ]);
  const w = R.forecast({
    records,
    catalog: withdrawn,
    codes: new Set(["A"]),
    loaded,
    historyEnd: "2026-10-25",
    stockDate: "2026-10-25",
    start: "2026-10-26",
    horizon: 14,
    incoming: { A: 100 },
  });
  assert.equal(w.items[0].demand, 2);
  assert.equal(w.items[0].remaining, 8);
});
test("manual delivery supplies stock only on scheduled date, not earlier; no assumed delivery", () => {
  const loaded = new Set(R.days("2026-09-28", "2026-10-25")),
    records = [...loaded].map((d) => sale(d));
  const options = {
    records,
    catalog,
    codes: new Set(["A"]),
    loaded,
    historyEnd: "2026-10-25",
    stockDate: "2026-10-25",
    start: "2026-10-26",
    horizon: 14,
  };
  const a = R.forecast(options),
    b = R.forecast({ ...options, incoming: { A: 20 } });
  assert.equal(a.items[0].fulfilled, 10);
  assert.equal(b.items[0].fulfilled, 18);
  assert.equal(b.dates.find((d) => d.date === "2026-11-04").fulfilled, 0);
  assert.equal(b.dates.find((d) => d.date === "2026-11-05").fulfilled, 2);
});
test("stock burn since snapshot is counted once and future stock snapshots are not used", () => {
  const loaded = new Set(R.days("2026-09-28", "2026-10-27")),
    records = [...loaded].map((d) => sale(d));
  const options = {
    records,
    catalog,
    codes: new Set(["A"]),
    loaded,
    historyEnd: "2026-10-27",
    stockDate: "2026-10-25",
    start: "2026-10-28",
    horizon: 7,
  };
  assert.equal(R.forecast(options).items[0].fulfilled, 6);
  assert.equal(R.forecast({ ...options, stockDate: "2026-10-29" }).unknown, 1);
});
test("reprice compares weekday mix, includes event day after and stops at following event", () => {
  const loaded = new Set(R.days("2026-09-28", "2026-10-25"));
  const records = [...loaded].map((d) => sale(d, d < "2026-10-12" ? 10 : 11));
  const event = {
    id: "1",
    article: "A",
    date: "2026-10-12",
    oldPrice: 100,
    newPrice: 80,
  };
  const e = R.effect({ event, records, catalog, loaded, events: [event] });
  assert.equal(e.beforeDays, 14);
  assert.equal(e.afterDays, 14);
  assert.ok(Math.abs(e.adjusted - 10) < 1e-8);
  assert.ok(Math.abs(e.priceDelta + 20) < 1e-8);
  const bounded = R.effect({
    event,
    records,
    catalog,
    loaded,
    events: [event, { id: "2", article: "A", date: "2026-10-19" }],
  });
  assert.equal(bounded.afterDays, 7);
});
test("dates are strict and logistics crosses months and years", () => {
  assert.equal(R.iso("2026-02-30"), null);
  assert.equal(R.add("2026-12-31", 1), "2027-01-01");
  assert.equal(R.logistics("2026-10-30").arrival, "2026-11-05");
});
test("forecast blocks ZO delivery and uses a newer reprice for future revenue", () => {
  const loaded = new Set(R.days("2026-09-28", "2026-10-25")),
    records = [...loaded].map((d) => sale(d));
  const options = {
    records,
    catalog: new Map([["A", { ...catalog.get("A"), cube: "ЗО вр" }]]),
    codes: new Set(["A"]),
    loaded,
    historyEnd: "2026-10-25",
    stockDate: "2026-10-25",
    start: "2026-10-26",
    horizon: 14,
    incoming: { A: 100 },
    events: [{ article: "A", date: "2026-10-26", newPrice: 80 }],
  };
  const f = R.forecast(options);
  assert.equal(f.items[0].fulfilled, 10);
  assert.equal(f.items[0].price, 80);
  assert.equal(f.items[0].supplyBlocked, true);
  assert.equal(
    f.dates.reduce((s, d) => s + d.revenue, 0),
    800,
  );
});
