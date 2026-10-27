/* Sales workspace. Actuals are immutable; forecasts and cost estimates are separate. */
(() => {
  "use strict";
  const R = window.SalesRules,
    KEY = "suadela_sales_v2",
    root = () => document.getElementById("salesCard");
  let legacyCuts = [];
  try {
    legacyCuts = JSON.parse(
      localStorage.getItem("sales_dashboard_v1_cuts") || "[]",
    );
    if (!Array.isArray(legacyCuts)) legacyCuts = [];
  } catch {}
  let charts = [],
    initialized = false,
    searchTimer,
    context = null,
    page = 0,
    state = {
      scope: "store",
      level: 2,
      group: "",
      codes: [],
      search: "",
      pickerSearch: "",
      from: "",
      to: "",
      metric: "qty",
      horizon: 28,
      tab: "overview",
      incoming: {},
      events: [],
    };
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {}
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const fmt = (v, d = 1) =>
    v === null || v === undefined || !Number.isFinite(v)
      ? "—"
      : v.toLocaleString("ru-RU", { maximumFractionDigits: d });
  const money = (v) => fmt(v, 2) + " ₽",
    pct = (v) => (v === null ? "—" : `${v > 0 ? "+" : ""}${fmt(v)}%`),
    date = (d) => (d ? d.split("-").reverse().join(".") : "—");
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      notice("Не удалось сохранить настройки: " + e.message, true);
    }
  };
  function notice(text, error = false) {
    const el = document.getElementById("slNotice");
    if (el) {
      el.textContent = text;
      el.className = "sa-notice" + (error ? " sa-error" : "");
    }
  }
  function stockProducts() {
    const map = new Map();
    if (typeof rawData === "undefined") return map;
    for (const row of rawData) {
      const p = DirectorRules.product(row);
      p.code = R.code(p.code);
      map.set(p.code, p);
    }
    return map;
  }
  function data() {
    const shared = window.sku3Api?.getState?.() || {
      sales: [],
      imports: [],
      settings: {},
    };
    const records = (shared.sales || [])
      .filter(
        (r) =>
          R.iso(r.date) &&
          R.code(r.article) &&
          R.number(r.qty) !== null &&
          R.number(r.sum) !== null,
      )
      .map((r) => ({
        ...r,
        qty: R.number(r.qty),
        sum: R.number(r.sum),
        article: R.code(r.article),
      }));
    const catalog = stockProducts();
    for (const r of records)
      if (!catalog.has(r.article))
        catalog.set(r.article, {
          code: r.article,
          name: r.name || r.article,
          group: r.group || "Без группы",
          group2: r.group2 || "",
          group3: r.group3 || "",
          cost: null,
          stock: null,
          price: null,
          endDate: null,
        });
    const loaded = new Set(
      [
        ...(shared.imports || []).map((i) => i.date),
        ...records.map((r) => r.date),
      ].filter((d) => R.iso(d)),
    );
    const dates = [...loaded].sort();
    const today = R.iso(new Date());
    const from = state.from || dates[0] || today,
      to = state.to || dates.at(-1) || today;
    const period = R.days(from, to);
    let codes = new Set(catalog.keys());
    if (state.scope === "selection") codes = new Set(state.codes.map(R.code));
    if (state.scope === "group")
      codes = new Set(
        [...catalog]
          .filter(([, p]) => R.groupKey(p, state.level) === state.group)
          .map(([c]) => c),
      );
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      codes = new Set(
        [...codes].filter((c) => {
          const p = catalog.get(c);
          return [c, p?.name, p?.group, p?.group2, p?.group3]
            .join(" ")
            .toLowerCase()
            .includes(q);
        }),
      );
    }
    const selected = records.filter((r) => codes.has(r.article)),
      filtered = selected.filter((r) => r.date >= from && r.date <= to);
    const observed = new Set(period.filter((d) => loaded.has(d)));
    const stockDate =
      typeof reportDate !== "undefined" && reportDate
        ? R.iso(reportDate)
        : null;
    const shops = [
      ...new Set(
        [...stockProducts().values()].map((p) => p.store).filter(Boolean),
      ),
    ];
    const salesShop = shared.settings?.storeName || "";
    const mismatch =
      !!salesShop &&
      salesShop !== "Магазин" &&
      shops.length > 0 &&
      !shops.includes(salesShop);
    const usableCatalog = mismatch
      ? new Map(
          [...catalog].map(([c, p]) => [c, { ...p, cost: null, stock: null }]),
        )
      : catalog;
    return {
      records,
      selected,
      filtered,
      catalog: usableCatalog,
      loaded,
      dates,
      period,
      observed,
      from,
      to,
      codes,
      today,
      stockDate,
      shops,
      salesShop,
      mismatch,
      invalid: (shared.sales || []).length - records.length,
    };
  }
  function option(value, label, current) {
    return `<option value="${esc(value)}" ${String(value) === String(current) ? "selected" : ""}>${esc(label)}</option>`;
  }
  function kpi(label, value, sub = "", cls = "") {
    return `<div class="sa-kpi ${cls}"><span>${esc(label)}</span><strong>${value}</strong><small>${sub}</small></div>`;
  }
  function quality(t) {
    return t.coverage === 1
      ? "По всем продажам"
      : `${fmt((t.coverage || 0) * 100)}% штук с себестоимостью`;
  }
  function profitValue(t, key = "gp") {
    return t.coverage === null || t.coverage === 0 ? "—" : money(t[key]);
  }
  function rowCells(t, baseline) {
    const cls =
      t.gp < 0
        ? "sa-red"
        : t.markup !== null && baseline !== null && t.markup < baseline
          ? "sa-orange"
          : "";
    return `<td>${fmt(t.qty)}</td><td>${money(t.revenue)}</td><td>${fmt(t.returnsQty)} / ${money(t.returns)}</td><td>${money(t.net)}</td><td class="${cls}">${profitValue(t)}${t.coverage !== 1 ? "<small>частичная оценка</small>" : ""}</td><td class="${cls}">${pct(t.markup)}</td>`;
  }
  function table(headers, body) {
    return `<div class="sa-scroll"><table class="sa-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body || '<tr><td colspan="20">Нет данных по выбранным условиям</td></tr>'}</tbody></table></div>`;
  }
  const saleHeaders = [
    "Штуки",
    "ТО до возвратов",
    "Возвраты, шт / ₽",
    "ТО после возвратов",
    "ВП до возвратов ≈",
    "Наценка ≈",
  ];
  window.salesRenderMarkup = () => {
    if (root().dataset.ready) return;
    root().dataset.ready = "1";
    root().innerHTML = `
<div class="sa-heading"><div><span class="sa-eyebrow">Аналитика продаж</span><h2>От магазина до каждого товара</h2><p id="slSubtitle"></p></div><div class="sa-actions"><button data-sa="stock">Загрузить остатки</button><button data-sl-action="upload">Загрузить продажи</button><button data-sl-action="export">Excel</button></div></div>
<div id="slNotice" aria-live="polite"></div><div id="saQuality"></div>
<div class="sa-controls">
<label>Объект<select id="saScope"><option value="store">Весь магазин</option><option value="group">Группа / подгруппа</option><option value="selection">Артикул / свободная подборка</option></select></label>
<label id="saLevelWrap">Уровень группы<select id="saLevel"><option value="1">Группа 1</option><option value="2">Группа 2</option><option value="3">Группа 3</option></select></label>
<label id="saGroupWrap">Группа<select id="saGroup"></select></label>
<label>С даты<input id="slDateFrom" type="date"></label><label>По дату<input id="slDateTo" type="date"></label>
<label class="sa-search">Поиск<input id="slSearchInput" type="search" placeholder="Название, артикул, группа"></label>
</div>
<div id="saSelection" class="sa-selection"><label>Артикулы — через пробел, запятую или с новой строки<textarea id="saCodes" rows="2" placeholder="931-606, 931-544"></textarea></label><button data-sa="apply-codes">Применить подборку</button><button data-sa="clear-codes">Сбросить</button><div id="saSelectionSummary"></div><label>Найти товар для добавления<input id="saPickerSearch" type="search" placeholder="Название или артикул"></label><div id="saPicker"></div></div>
<div class="sa-presets"><button data-sa="all-dates">Весь период</button><button data-sa="last7">Последние 7 дней</button><button data-sa="last28">Последние 28 дней</button><button data-sa="clear-search">Сбросить поиск</button></div>
<div class="sa-tabs" role="tablist"><button data-sl-tab="overview">Обзор</button><button data-sl-tab="groups">Группы</button><button data-sl-tab="skus">Артикулы</button><button data-sl-tab="forecast">Прогноз и запас</button><button data-sl-tab="cuts">Переоценки</button></div>
<div id="saView"></div><input id="slFileInput" type="file" accept=".xlsx,.xls,.csv" multiple hidden><div id="slDropZone" class="sa-drop">Можно перетащить сюда файлы продаж из 1С. История общая с разделом 3SKU.</div>
<dialog id="slCutModal"><form id="saCutForm"><h3>Переоценка товара</h3><label>Артикул<select id="saCutArticle" required></select></label><label>Дата переоценки<input id="slCutDate" type="date" max="${R.iso(new Date())}" required></label><label>Старая цена, ₽<input id="saOldPrice" type="number" min="0.01" step="0.01" required></label><label>Новая цена, ₽<input id="saNewPrice" type="number" min="0.01" step="0.01" required></label><div class="sa-actions"><button type="button" data-sa="cancel-cut">Отмена</button><button type="submit">Сохранить</button></div></form></dialog>`;
  };
  function refreshControls(c) {
    const set = (id, value) => {
      const e = document.getElementById(id);
      if (document.activeElement !== e) e.value = value;
    };
    set("saScope", state.scope);
    set("saLevel", state.level);
    set("slDateFrom", c.from);
    set("slDateTo", c.to);
    set("slSearchInput", state.search);
    set("saCodes", state.codes.join("\n"));
    set("saPickerSearch", state.pickerSearch || "");
    document.getElementById("saLevelWrap").hidden = state.scope !== "group";
    document.getElementById("saGroupWrap").hidden = state.scope !== "group";
    document.getElementById("saSelection").hidden = state.scope !== "selection";
    const options = [
      ...new Set(
        [...c.catalog.values()].map((p) => R.groupKey(p, state.level)),
      ),
    ].sort();
    document.getElementById("saGroup").innerHTML =
      option("", "Выберите группу", state.group) +
      options
        .map((k) => option(k, JSON.parse(k).join(" / "), state.group))
        .join("");
    document.getElementById("saSelectionSummary").textContent =
      `Выбрано: ${state.codes.length}. Не найдены: ${state.codes.filter((k) => !c.catalog.has(k)).join(", ") || "нет"}`;
    const query = (state.pickerSearch || "").toLowerCase();
    const picks = [...c.catalog.values()].filter(
      (p) =>
        !query ||
        [p.code, p.name, p.group, p.group2, p.group3]
          .join(" ")
          .toLowerCase()
          .includes(query),
    );
    document.getElementById("saPicker").innerHTML =
      picks
        .slice(0, 80)
        .map(
          (p) =>
            `<label><input type="checkbox" data-sa-pick="${esc(p.code)}" ${state.codes.includes(p.code) ? "checked" : ""}> <b>${esc(p.code)}</b> ${esc(p.name)}</label>`,
        )
        .join("") +
      `<small>Показано ${Math.min(80, picks.length)} из ${picks.length}. Уточните поиск или вставьте список артикулов.</small>`;
    root()
      .querySelectorAll("[data-sl-tab]")
      .forEach((b) => {
        b.classList.toggle("active", b.dataset.slTab === state.tab);
        b.setAttribute("aria-selected", String(b.dataset.slTab === state.tab));
      });
    document.getElementById("slSubtitle").textContent =
      `${c.salesShop || "Магазин"} · ${date(c.from)} — ${date(c.to)} · ${c.observed.size} из ${c.period.length} календарных дней загружено`;
    const notes = [];
    if (!c.dates.length)
      notes.push("Загрузите ежедневные отчёты о продажах из 1С.");
    if (!c.stockDate)
      notes.push(
        "Загрузите «Остатки по датам ввоза» для групп, себестоимости и прогноза запаса.",
      );
    else
      notes.push(
        `Себестоимость и запас: ${c.shops.join(", ") || "магазин отчёта"}, на конец ${date(c.stockDate)}. Историческая ВП — оценка по этой себестоимости.`,
      );
    if (c.mismatch)
      notes.push(
        "Названия магазинов в продажах и остатках различаются. Связь себестоимости и запаса отключена; проверьте магазин в настройках 3SKU и отчёт остатков.",
      );
    if (c.period.length > c.observed.size)
      notes.push(
        `Нет отчётов за ${c.period.length - c.observed.size} дн. Пробелы на графике не считаются нулевыми продажами.`,
      );
    if (c.from > c.to)
      notes.push("Начальная дата позже конечной. Исправьте период.");
    if (c.period.length === 3660)
      notes.push("Показаны первые 3660 календарных дней. Сократите период.");
    if (c.invalid) notes.push(`Некорректных строк исключено: ${c.invalid}.`);
    document.getElementById("saQuality").innerHTML =
      notes.map((n) => `<div class="sa-notice">${esc(n)}</div>`).join("") +
      '<details class="sa-method"><summary>Как учитываются возвраты и себестоимость</summary><p>Возвраты отражаются отдельно, если выделены отдельными строками в исходном отчёте. Свёрнутые 1С возвраты восстановить нельзя. ВП оценивается по текущей себестоимости из остатков, а не по исторической закупочной цене. Если себестоимость неизвестна, позиция не включается в прибыль. Для старых импортов переимпортируйте исходные файлы, чтобы отделить продажи от возвратов одного SKU.</p></details>';
  }
  function selectionTitle(c) {
    return state.scope === "store"
      ? "Магазин"
      : state.scope === "group"
        ? state.group
          ? JSON.parse(state.group).join(" / ")
          : "Выберите группу"
        : `Подборка · ${c.codes.size} SKU`;
  }
  function summary(c) {
    const t = R.aggregate(c.filtered, c.catalog);
    const avg = c.observed.size ? t.revenue / c.observed.size : null;
    const calendar = c.period.length;
    const previousEnd = R.add(c.from, -1),
      previousStart = R.add(c.from, -calendar);
    const priorDates = R.days(previousStart, previousEnd).filter((d) =>
      c.loaded.has(d),
    );
    const prior = R.aggregate(
      c.selected.filter(
        (r) => r.date >= previousStart && r.date <= previousEnd,
      ),
      c.catalog,
    );
    const delta = (now, before) =>
      before > 0 ? (now / before - 1) * 100 : null;
    const trendNote = `К предыдущим ${calendar} календарным дням; отчётов ${priorDates.length}. Среднее за загруженный день.`;
    return `<div class="sa-kpis" id="slKpis">${kpi("ТО до возвратов", money(t.revenue), `${fmt(t.qty)} шт`)}${kpi("Возвраты", money(t.returns), `${fmt(t.returnsQty)} шт`)}${kpi("ТО после возвратов", money(t.net))}${kpi("ВП до возвратов ≈", profitValue(t), quality(t), t.gp < 0 ? "sa-red" : "")}${kpi("ВП после возвратов ≈", profitValue(t, "netGp"), "Возврат уменьшает ВП на оценку прибыли возвращённого товара")}${kpi("Наценка ≈", pct(t.markup), "ВП / себестоимость проданного × 100%")}${kpi("ТО / загруженный день", money(avg), `${c.observed.size} дн. с отчётом из ${calendar}`)}${kpi("Динамика ТО / день", pct(priorDates.length && c.observed.size ? delta(avg, prior.revenue / priorDates.length) : null), trendNote)}${kpi("Динамика штук / день", pct(priorDates.length && c.observed.size ? delta(t.qty / c.observed.size, prior.qty / priorDates.length) : null), trendNote)}</div>`;
  }
  function chartBox(id, title, sub = "") {
    return `<section class="sa-panel"><div class="sa-panel-head"><h3>${title}</h3><small>${sub}</small></div><div class="sa-chart"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></section>`;
  }
  function chart(
    id,
    labels,
    datasets,
    { events = [], percent = false, stacked = false } = {},
  ) {
    const canvas = document.getElementById(id);
    if (!canvas || typeof Chart === "undefined") return;
    const colors = ["#0f766e", "#6366f1", "#e15c44", "#e6a42f"];
    const ds = datasets.map((s, i) => ({
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length] + "20",
      pointRadius: labels.length > 90 ? 0 : 2,
      borderWidth: 2,
      tension: 0.15,
      spanGaps: false,
      ...s,
    }));
    const markers = {
      id: "salesEvents",
      afterDraw(ch) {
        const {
          ctx,
          chartArea: a,
          scales: { x },
        } = ch;
        if (!a) return;
        ctx.save();
        for (const event of events) {
          const idx = labels.indexOf(event.date);
          if (idx < 0) continue;
          const px = x.getPixelForValue(idx);
          ctx.strokeStyle =
            event.type === "price"
              ? "#9333ea"
              : event.type === "order"
                ? "#64748b"
                : "#0f766e";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(px, a.top);
          ctx.lineTo(px, a.bottom);
          ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.font = "10px system-ui";
          const full =
              event.label || (event.type === "order" ? "Заказ" : "Поставка"),
            text =
              a.width < 400
                ? event.type === "order"
                  ? "З"
                  : event.type === "delivery"
                    ? "П"
                    : "Цена"
                : full;
          const width = ctx.measureText(text).width;
          ctx.fillText(
            text,
            Math.max(a.left, Math.min(px + 4, a.right - width)),
            a.top + 12 + (event.type === "delivery" ? 14 : 0),
          );
        }
        ctx.restore();
      },
    };
    const instance = new Chart(canvas, {
      type: "line",
      data: { labels, datasets: ds },
      plugins: [markers],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              title: (items) => date(items[0]?.label),
              label: (item) =>
                `${item.dataset.label}: ${fmt(item.parsed.y, 2)}${percent ? "%" : ""}`,
            },
          },
        },
        scales: {
          x: {
            stacked,
            ticks: {
              maxTicksLimit: 12,
              callback: function (v) {
                return date(this.getLabelForValue(v)).slice(0, 5);
              },
            },
            grid: { display: false },
          },
          y: {
            stacked,
            beginAtZero: true,
            ticks: { callback: (v) => fmt(v, 0) + (percent ? "%" : "") },
          },
        },
      },
    });
    charts.push(instance);
    return instance;
  }
  function priceEvents(c) {
    return state.events
      .filter(
        (e) =>
          c.codes.has(R.code(e.article)) && e.date >= c.from && e.date <= c.to,
      )
      .map((e) => ({
        date: e.date,
        type: "price",
        label: `${e.article}: ${fmt(e.oldPrice)} → ${fmt(e.newPrice)} ₽`,
      }));
  }
  function overview(c) {
    const t = R.aggregate(c.filtered, c.catalog),
      baseline = R.aggregate(
        c.records.filter((r) => r.date >= c.from && r.date <= c.to),
        c.catalog,
      ).markup;
    const history = R.daily(c.filtered, c.catalog, c.period, c.loaded);
    document.getElementById("saView").innerHTML =
      `<h3>${esc(selectionTitle(c))}</h3>${summary(c)}<div class="sa-two">${chartBox("saQtyChart", "Штуки: продажи и возвраты")}${chartBox("saToChart", "Товарооборот", "Рубли до и после возвратов")}</div><div class="sa-two">${chartBox("saGpChart", "Валовая прибыль ≈", "По себестоимости из отчёта остатков")}${chartBox("saMarkupChart", "Наценка ≈", "Оранжевый — ниже средней наценки магазина за выбранный период; красный — ВП < 0")}</div><details class="sa-panel"><summary>Данные по каждому дню</summary>${table(["Дата", "Данные", ...saleHeaders], history.map((d) => `<tr><td>${date(d.date)}</td><td>${d.loaded ? "Загружены" : "Нет отчёта"}</td>${d.loaded ? rowCells(d, baseline) : '<td colspan="6">—</td>'}</tr>`).join(""))}</details><div class="sa-panel"><h3>Вклад товаров в результат</h3><p>Наценка сравнивается со средневзвешенной наценкой магазина. ВП и наценка — оценки; позиции без себестоимости исключены из расчёта прибыли.</p>${table(
        ["Товар", ...saleHeaders],
        R.products(c.filtered, c.catalog)
          .slice(0, 100)
          .map(
            (p) =>
              `<tr><td><button class="sa-link" data-sa-focus="${esc(p.code)}">${esc(p.code)} · ${esc(p.name)}</button></td>${rowCells(p, baseline)}</tr>`,
          )
          .join(""),
      )}<small>Первые 100 по ТО. Полный список — во вкладке «Артикулы» и Excel.</small></div>`;
    const metric = (key, known = false) =>
      history.map((d) =>
        !d.loaded || (known && d.coverage !== 1) ? null : d[key],
      );
    const lineColor = (ctx) => {
      const d = history[ctx.p1DataIndex];
      return d?.gp < 0
        ? "#dc2626"
        : d?.markup !== null && baseline !== null && d?.markup < baseline
          ? "#e6a42f"
          : "#0f766e";
    };
    const dotColors = history.map((d) =>
      d.gp < 0
        ? "#dc2626"
        : d.markup !== null && baseline !== null && d.markup < baseline
          ? "#e6a42f"
          : "#0f766e",
    );
    const events = priceEvents(c);
    chart(
      "saQtyChart",
      c.period,
      [
        { label: "Продажи, шт", data: metric("qty") },
        {
          label: "Возвраты, шт",
          data: metric("returnsQty"),
          borderColor: "#e15c44",
        },
      ],
      { events },
    );
    chart(
      "saToChart",
      c.period,
      [
        {
          label: "ТО до возвратов, ₽",
          data: metric("revenue"),
          pointBackgroundColor: dotColors,
          segment: { borderColor: lineColor },
        },
        {
          label: "Возвраты, ₽",
          data: metric("returns"),
          borderColor: "#e15c44",
        },
        {
          label: "ТО после возвратов, ₽",
          data: metric("net"),
          borderColor: "#6366f1",
        },
      ],
      { events },
    );
    chart(
      "saGpChart",
      c.period,
      [
        {
          label: "ВП до возвратов ≈, ₽",
          data: metric("gp", true),
          pointBackgroundColor: dotColors,
          segment: { borderColor: lineColor },
          fill: { target: "origin", above: "#0f766e12", below: "#dc262630" },
        },
        {
          label: "ВП после возвратов ≈, ₽",
          data: metric("netGp", true),
          borderColor: "#6366f1",
        },
      ],
      { events },
    );
    chart(
      "saMarkupChart",
      c.period,
      [
        {
          label: "Наценка выбранного объекта, %",
          data: metric("markup", true),
          pointBackgroundColor: history.map((d) =>
            d.gp < 0
              ? "#dc2626"
              : baseline !== null && d.markup < baseline
                ? "#e6a42f"
                : "#0f766e",
          ),
          segment: {
            borderColor: (ctx) =>
              ctx.p1.parsed.y < 0
                ? "#dc2626"
                : baseline !== null && ctx.p1.parsed.y < baseline
                  ? "#e6a42f"
                  : "#0f766e",
          },
        },
        {
          label: "Средняя магазина, %",
          data: c.period.map(() => baseline),
          borderDash: [4, 4],
          pointRadius: 0,
          borderColor: "#94a3b8",
        },
      ],
      { events, percent: true },
    );
  }
  function list(c, kind) {
    const baseline = R.aggregate(
      c.records.filter((r) => r.date >= c.from && r.date <= c.to),
      c.catalog,
    ).markup;
    let list =
      kind === "groups"
        ? R.groups(c.filtered, c.catalog, state.level)
        : R.products(c.filtered, c.catalog);
    const max = Math.max(0, Math.ceil(list.length / 150) - 1);
    page = Math.min(page, max);
    const shown = list.slice(page * 150, page * 150 + 150);
    document.getElementById("saView").innerHTML =
      `${summary(c)}<div class="sa-panel"><h3>${kind === "groups" ? "Группы уровня " + state.level : "Артикулы"} · ${list.length}</h3>${kind === "groups" ? `<label>Уровень группировки <select id="saTableLevel">${[1, 2, 3].map((v) => option(v, "Группа " + v, state.level)).join("")}</select></label>` : ""}${table([kind === "groups" ? "Группа" : "Товар", ...saleHeaders, "Действие"], shown.map((p) => `<tr><td>${esc(p.name)}${p.code ? "<small>" + esc(p.code) + "</small>" : ""}</td>${rowCells(p, baseline)}<td>${kind === "groups" ? `<button data-sa-group="${esc(p.key)}">Открыть графики</button>` : `<button data-sa-focus="${esc(p.code)}">Графики</button><button data-sa-add="${esc(p.code)}">${state.codes.includes(p.code) ? "Убрать" : "В подборку"}</button>`}</td></tr>`).join(""))}<div class="sa-actions"><button data-sa="prev" ${page === 0 ? "disabled" : ""}>←</button><span>${page + 1} / ${max + 1}</span><button data-sa="next" ${page === max ? "disabled" : ""}>→</button><button data-sa="selection-overview">Графики подборки (${state.codes.length})</button></div></div>`;
  }
  function forecast(c) {
    const end = c.dates.filter((d) => d <= c.to).at(-1);
    const start = [
      c.today,
      c.stockDate ? R.add(c.stockDate, 1) : c.today,
      end ? R.add(end, 1) : c.today,
    ]
      .sort()
      .at(-1);
    const model = R.forecast({
      records: c.selected.filter((r) => r.date <= c.to),
      catalog: c.catalog,
      codes: c.codes,
      loaded: c.loaded,
      historyEnd: end || c.to,
      stockDate: c.stockDate,
      start,
      horizon: state.horizon,
      orderDay: cfg.orderDay,
      deliveryDay: cfg.deliveryDay,
      incoming: state.incoming,
      events: state.events,
    });
    const total = model.dates.reduce(
      (a, d) => {
        for (const key of [
          "demand",
          "fulfilled",
          "lost",
          "lostRevenue",
          "lostGp",
        ])
          a[key] += d[key];
        return a;
      },
      { demand: 0, fulfilled: 0, lost: 0, lostRevenue: 0, lostGp: 0 },
    );
    const short = model.items.filter((p) => p.shortBefore > 0);
    const noModel = model.items.filter((p) => p.sample === 0).length;
    page = Math.min(page, Math.max(0, Math.ceil(model.items.length / 150) - 1));
    const canFulfill = model.items.some((p) => p.stockKnown && p.rate !== null),
      canMoney = model.items.some(
        (p) => p.stockKnown && p.rate !== null && p.price !== null,
      ),
      canProfit = model.items.some(
        (p) =>
          p.stockKnown &&
          p.rate !== null &&
          p.price !== null &&
          p.cost !== null,
      ),
      hasModel = model.items.some((p) => p.rate !== null);
    const trainingDays = R.days(R.add(end || c.to, -27), end || c.to).filter(
      (d) => c.loaded.has(d),
    ).length;
    document.getElementById("saView").innerHTML =
      `<div class="sa-panel-head"><h3>Прогноз · ${esc(selectionTitle(c))}</h3><label>Горизонт<select id="saHorizon">${[7, 14, 28, 56].map((n) => option(n, n + " дней", state.horizon)).join("")}</select></label><label>Метрика<select id="slMetricSel">${[
        ["qty", "Штуки"],
        ["revenue", "ТО, ₽"],
        ["gp", "ВП ≈, ₽"],
      ]
        .map(([v, l]) => option(v, l, state.metric))
        .join(
          "",
        )}</select></label></div><details class="sa-method"><summary>Модель прогноза · ${date(start)} — ${date(R.add(start, state.horizon - 1))} · ${trainingDays}/28 дней для модели</summary><p>Прогноз с ${date(start)}. Обучение: ${trainingDays} загруженных дней из последних 28 до ${date(end)}; учитывается день недели при наличии двух наблюдений, уровень спроса уточняется по последним 7 дням при наличии хотя бы трёх отчётов. Это сценарий по наблюдаемым продажам, скрытый спрос при прежнем дефиците неизвестен. Остаток старого снимка уменьшается на известные продажи и оценку за пропущенные дни.</p></details><div class="sa-notice">Ближайший заказ: ${date(model.schedule.events.find((e) => e.type === "order")?.date)} · поставка: ${date(model.schedule.arrival)}. <span class="sa-info" tabindex="0" title="Без введённого количества поставка не увеличивает запас. Возвраты не считаются гарантированным пополнением. ЗО и товары с окончанием продаж не пополняются; прогноз спроса заканчивается в дату окончания продаж.">?</span></div>${model.unknown || model.unknownPrice || model.unknownCost || noModel ? `<div class="sa-notice sa-error">Нет запаса: ${model.unknown} SKU; нет цены: ${model.unknownPrice}; нет себестоимости: ${model.unknownCost}; нет дней для модели: ${noModel}. Денежные оценки и продажи с учётом запаса включают только обеспеченные данными позиции.</div>` : ""}<div class="sa-kpis">${kpi("Потенциальный спрос", fmt(hasModel ? total.demand : null) + " шт", "Оценка при наличии товара")}${kpi("Продажи при текущем запасе", fmt(canFulfill ? total.fulfilled : null) + " шт", model.unknown ? "Частичная оценка" : "С учётом введённой поставки")}${kpi("Риск до поставки", short.length + " SKU", "Ожидаемый дефицит до ближайшей поставки", short.length ? "sa-red" : "")}${kpi("Недополученный ТО ≈", money(canMoney ? total.lostRevenue : null), "За горизонт прогноза; потенциальные продажи")}${kpi("Недополученная ВП ≈", money(canProfit ? total.lostGp : null), "Только положительная прибыль, по известной себестоимости")}</div>${chartBox("saForecastChart", "История → прогноз → риск дефицита", "Пунктир — модель; красная область — неудовлетворённый спрос")}<details class="sa-panel"><summary>Прогноз по дням в цифрах</summary>${table(["Дата", "Спрос, шт", "Продадим, шт", "Дефицит, шт", "ТО ≈", "ВП ≈", "Недополученный ТО ≈", "Недополученная ВП ≈"], model.dates.map((d) => `<tr><td>${date(d.date)}</td><td>${fmt(hasModel ? d.demand : null)}</td><td>${fmt(canFulfill ? d.fulfilled : null)}</td><td class="${d.lost ? "sa-red" : ""}">${fmt(canFulfill ? d.lost : null)}</td><td>${money(canMoney ? d.revenue : null)}</td><td>${money(canProfit ? d.gp : null)}</td><td>${money(canMoney ? d.lostRevenue : null)}</td><td>${money(canProfit ? d.lostGp : null)}</td></tr>`).join(""))}</details><div class="sa-panel"><h3>Запас и планируемая поставка</h3><p>Количество вручную — сценарий для ближайшей поставки. Оно сохраняется только для текущего отчёта остатков.</p>${table(
        [
          "Товар",
          "Остаток в отчёте",
          "Темп, шт/день",
          "Дней модели",
          "Спрос",
          "Не хватит до поставки",
          "Первый дефицит",
          "Поставка, шт",
        ],
        model.items
          .slice(page * 150, page * 150 + 150)
          .map(
            (p) =>
              `<tr><td><button class="sa-link" data-sa-focus="${esc(p.code)}">${esc(p.code)} · ${esc(p.name)}</button>${p.discontinued ? "<small>Выводится · без дозаказа</small>" : p.supplyBlocked ? "<small>ЗО · поставка запрещена</small>" : p.warning ? "<small>ВнеАМ · только в крайнем случае</small>" : ""}</td><td>${fmt(p.stock)}</td><td>${fmt(p.rate)}</td><td>${p.sample}/28</td><td>${fmt(p.demand)}</td><td class="${p.shortBefore ? "sa-red" : ""}">${p.stockKnown ? fmt(p.shortBefore) : "Нет остатка"}</td><td>${date(p.firstOut)}</td><td><input type="number" min="0" step="1" aria-label="Поставка ${esc(p.code)}" data-sa-incoming="${esc(p.code)}" value="${esc(state.incoming[p.code] || 0)}" ${p.discontinued || p.supplyBlocked || !p.stockKnown ? "disabled" : ""}></td></tr>`,
          )
          .join(""),
      )}<div class="sa-actions"><button data-sa="prev" ${page === 0 ? "disabled" : ""}>←</button><span>${page + 1} / ${Math.max(1, Math.ceil(model.items.length / 150))}</span><button data-sa="next" ${(page + 1) * 150 >= model.items.length ? "disabled" : ""}>→</button></div></div>`;
    const historicDates = R.days(R.add(start, -28), R.add(start, -1)),
      history = R.daily(
        c.selected.filter((r) => r.date <= c.to),
        c.catalog,
        historicDates,
        c.loaded,
      ),
      labels = [...historicDates, ...model.dates.map((d) => d.date)];
    const historicKey =
        state.metric === "qty"
          ? "qty"
          : state.metric === "gp"
            ? "gp"
            : "revenue",
      futureKey =
        state.metric === "qty"
          ? "fulfilled"
          : state.metric === "gp"
            ? "gp"
            : "revenue",
      demandKey =
        state.metric === "qty"
          ? "demand"
          : state.metric === "gp"
            ? "demandGp"
            : "demandRevenue",
      lostKey =
        state.metric === "qty"
          ? "lost"
          : state.metric === "gp"
            ? "lostGp"
            : "lostRevenue";
    const pad = historicDates.map(() => null);
    chart(
      "saForecastChart",
      labels,
      [
        {
          label: "Факт" + (state.metric === "gp" ? " ≈" : ""),
          data: [
            ...history.map((d) =>
              d.loaded && (state.metric !== "gp" || d.coverage === 1)
                ? d[historicKey]
                : null,
            ),
            ...model.dates.map(() => null),
          ],
        },
        {
          label: "Потенциальный спрос",
          data: [
            ...pad,
            ...model.dates.map((d) =>
              !hasModel ||
              (state.metric === "gp" &&
                model.items.every((p) => p.cost === null))
                ? null
                : d[demandKey],
            ),
          ],
          borderDash: [6, 4],
          borderColor: "#6366f1",
          backgroundColor: "#6366f115",
        },
        {
          label: "Продажи с учётом запаса",
          data: [
            ...pad,
            ...model.dates.map((d) =>
              !canFulfill ||
              (state.metric === "gp" && !canProfit) ||
              (state.metric === "revenue" && !canMoney)
                ? null
                : d[futureKey],
            ),
          ],
          borderDash: [3, 3],
          borderColor: "#0f766e",
        },
        {
          label: "Потери из-за дефицита ≈",
          data: [
            ...pad,
            ...model.dates.map((d) =>
              !canFulfill ||
              (state.metric === "gp" && !canProfit) ||
              (state.metric === "revenue" && !canMoney)
                ? null
                : d[lostKey],
            ),
          ],
          borderColor: "#dc2626",
          backgroundColor: "#dc262625",
          fill: "origin",
        },
      ],
      {
        events: [
          ...model.schedule.events,
          ...state.events
            .filter((e) => c.codes.has(R.code(e.article)))
            .map((e) => ({
              date: e.date,
              type: "price",
              label: `${e.article}: ${fmt(e.oldPrice)} → ${fmt(e.newPrice)} ₽`,
            })),
        ],
      },
    );
    context.forecast = model;
  }
  function cuts(c) {
    document.getElementById("saView").innerHTML =
      `<div class="sa-panel-head"><h3>События переоценки</h3><button data-sl-action="add-cut">Добавить переоценку SKU</button></div><details class="sa-method"><summary>Метод сравнения до и после переоценки</summary><p>Сравниваются до 28 календарных дней с каждой стороны, только дни с отчётами. День изменения цены — «после». Соседние переоценки ограничивают окно. Сравнение одинаковых дней недели снижает влияние расписания. Наличие товара в прошлом неизвестно: изменение скорости не доказывает причинный эффект цены.</p></details>${legacyCuts.length ? `<details class="sa-panel"><summary>Старые отсечки без цен: ${legacyCuts.length}</summary>${legacyCuts.map((x) => `<p>${esc(x.entityLabel || x.entity)} · ${esc(x.date)}. Сохранены как заметки; создайте переоценку с артикулом и ценами для новой аналитики.</p>`).join("")}</details>` : ""}${
        state.events
          .filter((e) => c.codes.has(R.code(e.article)))
          .map((e) => {
            const effect = R.effect({
              event: e,
              records: c.records,
              catalog: c.catalog,
              loaded: c.loaded,
              events: state.events,
            });
            return `<section class="sa-panel"><div class="sa-panel-head"><h3>${esc(e.article)} · ${esc(c.catalog.get(R.code(e.article))?.name || "")} · ${date(e.date)}</h3><button data-sa-delete="${esc(e.id)}">Удалить</button></div><p><b>${money(e.oldPrice)} → ${money(e.newPrice)}</b> · ${pct(effect?.priceDelta ?? null)}</p>${!effect ? "<p>Нет данных для сравнения</p>" : `<div class="sa-kpis">${kpi("До: штуки в день", fmt(effect.before.qty), effect.beforeDays + " загруженных дней")}${kpi("После: штуки в день", fmt(effect.after.qty), effect.afterDays + " загруженных дней")}${kpi("Изменение скорости", pct(effect.delta), "Простое сравнение средних")}${kpi("С поправкой на день недели", pct(effect.adjusted), `${effect.weekdays}/7 дней недели сопоставлены`)}${kpi("ТО / день до → после", money(effect.before.revenue) + " → " + money(effect.after.revenue))}${kpi("ВП / день до → после ≈", money(effect.before.gp) + " → " + money(effect.after.gp))}</div>${effect.limited ? '<p class="sa-orange">Мало наблюдений или неполное покрытие дней недели — предварительная оценка.</p>' : ""}`}<button data-sa-focus="${esc(e.article)}">Показать на графиках</button></section>`;
          })
          .join("") ||
        '<div class="sa-panel">Событий для текущего отбора пока нет.</div>'
      }`;
  }
  function render() {
    if (!initialized) return;
    try {
      for (const ch of charts) ch.destroy();
      charts = [];
      context = data();
      refreshControls(context);
      if (state.tab === "overview") overview(context);
      else if (state.tab === "groups" || state.tab === "skus")
        list(context, state.tab);
      else if (state.tab === "forecast") forecast(context);
      else cuts(context);
    } catch (e) {
      console.error(e);
      notice("Не удалось построить аналитику: " + e.message, true);
    }
  }
  function openCut(article = null, day = null) {
    const c = context || data(),
      keys = [...c.codes].filter((k) => c.catalog.has(k));
    if (!keys.length) {
      notice("Сначала загрузите продажи или остатки и выберите товар", true);
      return;
    }
    const select = document.getElementById("saCutArticle");
    select.innerHTML = keys
      .map((k) =>
        option(k, k + " · " + c.catalog.get(k).name, article || keys[0]),
      )
      .join("");
    document.getElementById("slCutDate").value = day || c.to;
    const p = c.catalog.get(select.value);
    document.getElementById("saOldPrice").value = p?.price || "";
    document.getElementById("saNewPrice").value = "";
    document.getElementById("slCutModal").showModal();
  }
  function exportExcel() {
    const c = data(),
      book = XLSX.utils.book_new();
    const append = (name, rows) =>
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
    append("Источник", [
      ["Магазин продаж", c.salesShop],
      ["Магазин остатков", c.shops.join(", ")],
      ["Остатки на конец", c.stockDate || "Нет отчёта"],
      ["Себестоимость", "Текущая из отчёта остатков; историческая ВП — оценка"],
      ["Период", c.from, c.to],
      ["Загружено дней", c.observed.size, c.period.length],
    ]);
    append("Продажи", [
      [
        "Дата",
        "Артикул",
        "Товар",
        "Группа 1",
        "Группа 2",
        "Группа 3",
        "Продавец",
        "Штуки со знаком",
        "Сумма со знаком",
        "Себестоимость за шт",
        "ВП ≈",
      ],
      ...c.filtered.map((r) => {
        const p = c.catalog.get(r.article),
          known = p?.cost !== null && p?.cost !== undefined;
        return [
          r.date,
          r.article,
          p?.name || r.name,
          p?.group,
          p?.group2,
          p?.group3,
          r.seller,
          r.qty,
          r.sum,
          p?.cost,
          known
            ? (r.qty < 0 ? -Math.abs(r.sum) : r.sum) - r.qty * p.cost
            : null,
        ];
      }),
    ]);
    const headers = [
      "Объект",
      "Продано шт",
      "ТО",
      "Возвраты шт",
      "Возвраты ₽",
      "ТО после возвратов",
      "ВП ≈",
      "ВП после возвратов ≈",
      "Наценка % ≈",
      "Покрытие себестоимостью %",
    ];
    const values = (p) => [
      p.name || p.date,
      p.qty,
      p.revenue,
      p.returnsQty,
      p.returns,
      p.net,
      p.coverage === null || p.coverage === 0 ? null : p.gp,
      p.coverage === null || p.coverage === 0 ? null : p.netGp,
      p.markup,
      p.coverage === null ? null : p.coverage * 100,
    ];
    append("По дням", [
      ["Данные", ...headers],
      ...R.daily(c.filtered, c.catalog, c.period, c.loaded).map((p) => [
        p.loaded ? "Загружены" : "Нет отчёта",
        ...values(p.loaded ? p : { date: p.date }),
      ]),
    ]);
    append("Группы", [
      headers,
      ...R.groups(c.filtered, c.catalog, state.level).map(values),
    ]);
    append("Артикулы", [
      ["Артикул", ...headers],
      ...R.products(c.filtered, c.catalog).map((p) => [p.code, ...values(p)]),
    ]);
    append("Переоценки", [
      [
        "Артикул",
        "Дата",
        "Цена до",
        "Цена после",
        "Дней до",
        "Дней после",
        "Шт/день до",
        "Шт/день после",
        "Изменение скорости %",
        "С поправкой на день недели %",
        "ВП/день до ≈",
        "ВП/день после ≈",
      ],
      ...state.events
        .filter((e) => c.codes.has(R.code(e.article)))
        .map((e) => {
          const t = R.effect({
            event: e,
            records: c.records,
            catalog: c.catalog,
            loaded: c.loaded,
            events: state.events,
          });
          return [
            e.article,
            e.date,
            e.oldPrice,
            e.newPrice,
            t?.beforeDays,
            t?.afterDays,
            t?.before.qty,
            t?.after.qty,
            t?.delta,
            t?.adjusted,
            t?.before.gp,
            t?.after.gp,
          ];
        }),
    ]);
    if (state.tab === "forecast" && context?.forecast) {
      const f = context.forecast;
      append("Запас и поставка", [
        [
          "Артикул",
          "Остаток в отчёте",
          "Количество поставки",
          "Дата поставки",
          "Дней модели",
          "Спрос шт",
          "Продадим шт",
          "Дефицит до поставки шт",
        ],
        ...f.items.map((p) => [
          p.code,
          p.stock,
          state.incoming[p.code] || 0,
          f.schedule.arrival,
          p.sample,
          p.demand,
          p.fulfilled,
          p.shortBefore,
        ]),
      ]);
      append("Прогноз", [
        [
          "Дата",
          "Потенциальный спрос шт",
          "Продажи при запасе шт",
          "Дефицит шт",
          "ТО ≈",
          "ВП ≈",
          "Недополученный ТО ≈",
          "Недополученная ВП ≈",
        ],
        ...f.dates.map((d) => [
          d.date,
          d.demand,
          d.fulfilled,
          d.lost,
          d.revenue,
          d.gp,
          d.lostRevenue,
          d.lostGp,
        ]),
      ]);
    }
    XLSX.writeFile(book, `Suadela_продажи_${c.from}_${c.to}.xlsx`);
  }
  async function upload(files) {
    try {
      await window.sku3Api.handleImportFiles([...files]);
      render();
    } catch (e) {
      notice(e.message, true);
    }
  }
  function focus(code) {
    state.scope = "selection";
    state.codes = [R.code(code)];
    state.search = "";
    state.tab = "overview";
    page = 0;
    save();
    render();
  }
  function bind() {
    root().addEventListener("click", (e) => {
      const target = e.target.closest("button");
      if (!target) return;
      const action = target.dataset.sa || target.dataset.slAction;
      if (action === "upload") document.getElementById("slFileInput").click();
      if (action === "stock") document.getElementById("fileInput").click();
      if (action === "export") exportExcel();
      if (action === "add-cut") openCut();
      if (action === "cancel-cut")
        document.getElementById("slCutModal").close();
      if (action === "apply-codes") {
        state.codes = [
          ...new Set(
            document
              .getElementById("saCodes")
              .value.split(/[\s,;]+/)
              .map(R.code)
              .filter(Boolean),
          ),
        ];
        state.search = "";
        page = 0;
        save();
        render();
      }
      if (action === "clear-codes") {
        state.codes = [];
        save();
        render();
      }
      if (action === "selection-overview") {
        state.scope = "selection";
        state.search = "";
        state.tab = "overview";
        save();
        render();
      }
      if (action === "clear-search") {
        state.search = "";
        page = 0;
        save();
        render();
      }
      if (["all-dates", "last7", "last28"].includes(action)) {
        const dates = data().dates;
        state.to = dates.at(-1) || "";
        state.from =
          action === "all-dates"
            ? dates[0] || ""
            : R.add(
                state.to || R.iso(new Date()),
                action === "last7" ? -6 : -27,
              );
        page = 0;
        save();
        render();
      }
      if (action === "prev" || action === "next") {
        page = Math.max(0, page + (action === "next" ? 1 : -1));
        render();
      }
      if (target.dataset.slTab) {
        state.tab =
          target.dataset.slTab === "dyn" ? "overview" : target.dataset.slTab;
        page = 0;
        save();
        render();
      }
      if (target.dataset.saFocus) focus(target.dataset.saFocus);
      if (target.dataset.saAdd) {
        toggle(target.dataset.saAdd);
        save();
        render();
      }
      if (target.dataset.saGroup) {
        state.scope = "group";
        state.group = target.dataset.saGroup;
        state.search = "";
        state.tab = "overview";
        page = 0;
        save();
        render();
      }
      if (
        target.dataset.saDelete &&
        confirm("Удалить это событие переоценки?")
      ) {
        state.events = state.events.filter(
          (x) => x.id !== target.dataset.saDelete,
        );
        save();
        render();
      }
    });
    root().addEventListener("change", (e) => {
      const el = e.target,
        key = {
          saScope: "scope",
          saLevel: "level",
          saTableLevel: "level",
          saGroup: "group",
          slDateFrom: "from",
          slDateTo: "to",
          slMetricSel: "metric",
          saHorizon: "horizon",
        }[el.id];
      if (key) {
        state[key] = ["level", "horizon"].includes(key)
          ? Number(el.value)
          : el.value;
        if (key === "level") state.group = "";
        page = 0;
        save();
        render();
      }
      if (el.dataset.saPick) {
        toggle(el.dataset.saPick);
        save();
        render();
      }
      if (el.dataset.saIncoming) {
        state.incoming[el.dataset.saIncoming] = Math.max(
          0,
          Math.floor(Number(el.value) || 0),
        );
        save();
        render();
      }
      if (el.id === "slFileInput") {
        upload(el.files);
        el.value = "";
      }
      if (el.id === "saCutArticle")
        document.getElementById("saOldPrice").value =
          context?.catalog.get(el.value)?.price || "";
    });
    root().addEventListener("input", (e) => {
      if (["slSearchInput", "saPickerSearch"].includes(e.target.id)) {
        clearTimeout(searchTimer);
        const key =
            e.target.id === "saPickerSearch" ? "pickerSearch" : "search",
          value = e.target.value;
        searchTimer = setTimeout(() => {
          state[key] = value;
          page = 0;
          save();
          render();
        }, 250);
      }
    });
    document.getElementById("saCutForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const article = document.getElementById("saCutArticle").value,
        date = document.getElementById("slCutDate").value,
        oldPrice = Number(document.getElementById("saOldPrice").value),
        newPrice = Number(document.getElementById("saNewPrice").value);
      if (
        !R.iso(date) ||
        date > R.iso(new Date()) ||
        !(oldPrice > 0 && newPrice > 0)
      ) {
        notice("Укажите корректную дату и положительные цены", true);
        return;
      }
      if (
        state.events.some(
          (x) => R.code(x.article) === article && x.date === date,
        )
      ) {
        notice("Для этого артикула уже есть переоценка в эту дату", true);
        return;
      }
      state.events.push({
        id: crypto.randomUUID?.() || String(Date.now()),
        article,
        date,
        oldPrice,
        newPrice,
      });
      save();
      document.getElementById("slCutModal").close();
      state.tab = "cuts";
      render();
    });
    const drop = document.getElementById("slDropZone");
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      upload(e.dataTransfer.files);
    });
  }
  function toggle(key) {
    state.codes = state.codes.includes(key)
      ? state.codes.filter((c) => c !== key)
      : [...state.codes, key];
  }
  function stockChanged() {
    state.incoming = {};
    save();
    render();
  }
  window.salesInit = () => {
    if (initialized) {
      render();
      return;
    }
    initialized = true;
    bind();
    render();
  };
  window.salesRefresh = render;
  window.salesHide = () => {
    root()?.classList.add("hidden");
  };
  window.addEventListener("sku3-data-changed", render);
  window.addEventListener("soldie-report-loaded", stockChanged);
})();
