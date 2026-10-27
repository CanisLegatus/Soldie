/* Sales analytics, independent of DOM. Monetary profit uses the current stock cost. */
(function (root) {
  "use strict";
  const dayMs = 86400000;
  function iso(value) {
    if (value instanceof Date)
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
      Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  function add(day, n) {
    return new Date(Date.parse(day + "T00:00:00Z") + n * dayMs)
      .toISOString()
      .slice(0, 10);
  }
  function days(a, b) {
    const out = [];
    if (!iso(a) || !iso(b)) return out;
    for (let d = a; d <= b && out.length < 3660; d = add(d, 1)) out.push(d);
    return out;
  }
  function weekday(day) {
    return new Date(day + "T00:00:00Z").getUTCDay();
  }
  function code(value) {
    return String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }
  function number(value) {
    if (value === null || value === undefined || String(value).trim() === "")
      return null;
    const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  function empty() {
    return {
      qty: 0,
      revenue: 0,
      returnsQty: 0,
      returns: 0,
      net: 0,
      cost: 0,
      returnCost: 0,
      gp: 0,
      returnGp: 0,
      netGp: 0,
      knownRevenue: 0,
      knownReturns: 0,
      missingQty: 0,
      rows: 0,
      markup: null,
      coverage: null,
    };
  }
  function finish(t) {
    t.net = t.revenue - t.returns;
    t.gp = t.knownRevenue - t.cost;
    t.returnGp = t.knownReturns - t.returnCost;
    t.netGp = t.gp - t.returnGp;
    t.markup = t.cost > 0 ? (t.gp / t.cost) * 100 : null;
    const units = t.qty + t.returnsQty;
    t.coverage = units > 0 ? (units - t.missingQty) / units : 1;
    return t;
  }
  function aggregate(records, catalog) {
    const t = empty();
    for (const r of records) {
      const qty = number(r.qty),
        sum = number(r.sum);
      if (qty === null || sum === null || qty === 0) continue;
      const p = catalog.get(code(r.article)),
        cost = p?.cost;
      const known = cost !== null && cost !== undefined && cost >= 0;
      t.rows++;
      if (qty > 0) {
        t.qty += qty;
        t.revenue += sum;
        if (known) {
          t.cost += qty * cost;
          t.knownRevenue += sum;
        }
      } else {
        t.returnsQty += -qty;
        t.returns += Math.abs(sum);
        if (known) {
          t.returnCost += -qty * cost;
          t.knownReturns += Math.abs(sum);
        }
      }
      if (!known) t.missingQty += Math.abs(qty);
    }
    return finish(t);
  }
  function daily(records, catalog, dates, loaded) {
    const map = new Map();
    for (const r of records) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date).push(r);
    }
    return dates.map((date) => ({
      date,
      loaded: loaded.has(date),
      ...aggregate(map.get(date) || [], catalog),
    }));
  }
  function groupKey(p, level) {
    return JSON.stringify([
      p?.group || "Без группы",
      ...(level >= 2 ? [p?.group2 || "Без подгруппы"] : []),
      ...(level >= 3 ? [p?.group3 || "Без подгруппы"] : []),
    ]);
  }
  function groups(records, catalog, level = 1) {
    const map = new Map();
    for (const r of records) {
      const key = groupKey(catalog.get(code(r.article)), level);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map]
      .map(([key, rows]) => ({
        key,
        name: JSON.parse(key).join(" / "),
        codes: [...new Set(rows.map((r) => code(r.article)))],
        ...aggregate(rows, catalog),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }
  function products(records, catalog) {
    const map = new Map();
    for (const r of records) {
      const key = code(r.article);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map]
      .map(([key, rows]) => ({
        code: key,
        name: catalog.get(key)?.name || rows.find((r) => r.name)?.name || key,
        ...aggregate(rows, catalog),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }
  function model(records, loaded, end, window = 28) {
    const sample = days(add(end, -window + 1), end).filter((d) =>
        loaded.has(d),
      ),
      byDay = new Map(sample.map((d) => [d, 0]));
    let sum = 0,
      qty = 0;
    for (const r of records)
      if (byDay.has(r.date) && r.qty > 0) {
        byDay.set(r.date, byDay.get(r.date) + Number(r.qty));
        sum += Number(r.sum) || 0;
        qty += Number(r.qty);
      }
    const mean = sample.length
      ? [...byDay.values()].reduce((a, b) => a + b, 0) / sample.length
      : null;
    const week = Array.from({ length: 7 }, (_, w) => {
      const list = sample.filter((d) => weekday(d) === w);
      return list.length >= 2
        ? list.reduce((s, d) => s + byDay.get(d), 0) / list.length
        : mean;
    });
    const recent = sample.filter((d) => d >= add(end, -6)),
      recentMean =
        recent.length >= 3
          ? recent.reduce((s, d) => s + byDay.get(d), 0) / recent.length
          : mean;
    const factor = mean > 0 ? recentMean / mean : 1;
    return {
      sample: sample.length,
      calendar: window,
      mean: recentMean,
      price: qty > 0 ? sum / qty : null,
      week,
      rate: (date) =>
        week[weekday(date)] === null ? null : week[weekday(date)] * factor,
    };
  }
  function logistics(start, orderDay = 5, deliveryDay = 4, horizon = 28) {
    const events = [];
    const lag = (deliveryDay - orderDay + 7) % 7 || 7;
    const first = add(start, (orderDay - weekday(start) + 7) % 7);
    for (let date = first; date <= add(start, horizon); date = add(date, 7)) {
      events.push({ date, type: "order" });
      events.push({ date: add(date, lag), type: "delivery" });
    }
    return {
      events: events
        .filter((e) => e.date <= add(start, horizon))
        .sort((a, b) => a.date.localeCompare(b.date)),
      arrival: add(first, lag),
    };
  }
  function forecast({
    records,
    catalog,
    codes,
    loaded,
    historyEnd,
    stockDate,
    start,
    horizon = 28,
    orderDay = 5,
    deliveryDay = 4,
    incoming = {},
    events = [],
  }) {
    const schedule = logistics(start, orderDay, deliveryDay, horizon),
      dates = days(start, add(start, horizon - 1)),
      result = dates.map((date) => ({
        date,
        demand: 0,
        fulfilled: 0,
        lost: 0,
        revenue: 0,
        gp: 0,
        lostRevenue: 0,
        lostGp: 0,
        demandRevenue: 0,
        demandGp: 0,
        low: 0,
        high: 0,
        stock: null,
      })),
      items = [];
    const recordsByCode = new Map();
    for (const r of records) {
      const key = code(r.article);
      if (!recordsByCode.has(key)) recordsByCode.set(key, []);
      recordsByCode.get(key).push(r);
    }
    const validStockDate = iso(stockDate) && stockDate < start;
    for (const key of codes) {
      const p = catalog.get(key),
        rows = recordsByCode.get(key) || [],
        m = model(rows, loaded, historyEnd);
      const stockKnown =
        !!validStockDate &&
        p?.stock !== null &&
        p?.stock !== undefined &&
        p.stock >= 0;
      let remaining = stockKnown ? p.stock : null;
      const cost = p?.cost;
      const knownCost = cost !== null && cost !== undefined && cost >= 0;
      const lastPrice = events
        .filter((e) => code(e.article) === key && e.date <= start)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const price =
        lastPrice && (!stockDate || lastPrice.date > stockDate)
          ? lastPrice.newPrice
          : p?.price > 0
            ? p.price
            : m.price;
      const supplyBlocked = String(p?.cube || "")
        .toLowerCase()
        .includes("зо");
      let firstOut = null,
        shortBefore = 0,
        demand = 0,
        fulfilled = 0,
        lost = 0;
      if (stockKnown) {
        const actual = new Map();
        for (const r of rows)
          if (r.qty > 0)
            actual.set(r.date, (actual.get(r.date) || 0) + Number(r.qty));
        for (const date of days(add(stockDate, 1), add(start, -1))) {
          if (p.endDate && date > p.endDate) continue;
          remaining = Math.max(
            0,
            remaining -
              (loaded.has(date) ? actual.get(date) || 0 : m.rate(date) || 0),
          );
        }
      }
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i],
          out = result[i];
        if (
          date === schedule.arrival &&
          remaining !== null &&
          !p?.endDate &&
          !supplyBlocked
        )
          remaining += Math.max(0, number(incoming[key]) || 0);
        if (m.mean === null) continue;
        const q = p?.endDate && date > p.endDate ? 0 : m.rate(date) || 0;
        const available = remaining === null ? null : Math.min(q, remaining);
        const missed = available === null ? 0 : q - available;
        demand += q;
        out.demand += q;
        if (available !== null) {
          fulfilled += available;
          lost += missed;
          remaining = Math.max(0, remaining - available);
          out.fulfilled += available;
          out.lost += missed;
          out.stock = (out.stock || 0) + remaining;
          if (missed > 0 && !firstOut) firstOut = date;
          if (date < schedule.arrival) shortBefore += missed;
        }
        if (price !== null) {
          out.demandRevenue += q * price;
          if (available !== null) {
            out.revenue += available * price;
            out.lostRevenue += missed * price;
          }
          if (knownCost) {
            out.demandGp += q * (price - cost);
            if (available !== null) {
              out.gp += available * (price - cost);
              out.lostGp += missed * Math.max(0, price - cost);
            }
          }
        }
        const uncertainty = Math.sqrt(Math.max(0, m.mean)) * 1.96;
        out.low += Math.max(0, q - uncertainty);
        out.high += q + uncertainty;
      }
      items.push({
        code: key,
        name: p?.name || rows.find((r) => r.name)?.name || key,
        stockKnown,
        stock: stockKnown ? p.stock : null,
        remaining,
        firstOut,
        shortBefore,
        demand,
        fulfilled: stockKnown ? fulfilled : null,
        lost: stockKnown ? lost : null,
        sample: m.sample,
        rate: m.mean,
        price,
        cost: knownCost ? cost : null,
        discontinued: !!p?.endDate,
        supplyBlocked,
        warning: String(p?.cube || "")
          .toLowerCase()
          .includes("вне"),
      });
    }
    const unknown = items.filter((p) => !p.stockKnown).length,
      unknownPrice = items.filter((p) => p.price === null).length,
      unknownCost = items.filter((p) => p.cost === null).length;
    return {
      dates: result,
      items,
      schedule,
      unknown,
      unknownPrice,
      unknownCost,
      stockDate,
      start,
    };
  }
  function effect({
    event,
    records,
    catalog,
    loaded,
    window = 28,
    events = [],
  }) {
    const key = code(event.article),
      rows = records.filter((r) => code(r.article) === key),
      dates = [...loaded].sort();
    if (!dates.length) return null;
    let from = add(event.date, -window),
      to = add(event.date, window - 1);
    const siblings = events
      .filter((e) => code(e.article) === key && e.id !== event.id)
      .map((e) => e.date)
      .sort();
    for (const d of siblings) {
      if (d < event.date && d >= from) from = d;
      if (d > event.date && d <= to) to = add(d, -1);
    }
    to = to > dates.at(-1) ? dates.at(-1) : to;
    const before = days(from, add(event.date, -1)).filter((d) => loaded.has(d)),
      after = days(event.date, to).filter((d) => loaded.has(d));
    const old = aggregate(
        rows.filter((r) => before.includes(r.date)),
        catalog,
      ),
      now = aggregate(
        rows.filter((r) => after.includes(r.date)),
        catalog,
      );
    const per = (t, n) => ({
      qty: n ? t.qty / n : null,
      revenue: n ? t.revenue / n : null,
      gp: n && t.coverage === 1 ? t.gp / n : null,
    });
    const b = per(old, before.length),
      a = per(now, after.length);
    let weightedBefore = 0,
      weightedAfter = 0,
      pairs = 0,
      matchedDays = 0;
    for (let w = 0; w < 7; w++) {
      const bs = before.filter((d) => weekday(d) === w),
        as = after.filter((d) => weekday(d) === w);
      if (!bs.length || !as.length) continue;
      const bq =
        rows
          .filter((r) => r.qty > 0 && bs.includes(r.date))
          .reduce((s, r) => s + Number(r.qty), 0) / bs.length;
      const aq =
        rows
          .filter((r) => r.qty > 0 && as.includes(r.date))
          .reduce((s, r) => s + Number(r.qty), 0) / as.length;
      weightedBefore += bq * as.length;
      weightedAfter += aq * as.length;
      matchedDays += as.length;
      pairs++;
    }
    return {
      beforeDays: before.length,
      afterDays: after.length,
      before: b,
      after: a,
      delta: b.qty > 0 ? (a.qty / b.qty - 1) * 100 : null,
      adjusted:
        weightedBefore > 0 ? (weightedAfter / weightedBefore - 1) * 100 : null,
      weekdays: pairs,
      matchedDays,
      priceDelta:
        event.oldPrice > 0 ? (event.newPrice / event.oldPrice - 1) * 100 : null,
      limited: before.length < 7 || after.length < 7 || pairs < 7,
      from,
      to,
    };
  }
  const api = {
    iso,
    add,
    days,
    weekday,
    code,
    number,
    aggregate,
    daily,
    groupKey,
    groups,
    products,
    model,
    logistics,
    forecast,
    effect,
  };
  root.SalesRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
