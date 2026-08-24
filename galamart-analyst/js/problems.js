/* ══════════════════════════════════════════════════════════════
   problems.js — панель «Проблемы»
   ══════════════════════════════════════════════════════════════ */

const ISSUE_TYPES = [
  { key: 'oos',       icon: '🚫', label: 'Обнуление стока',  desc: 'сток пуст при живых продажах' },
  { key: 'shortage',  icon: '📦', label: 'Дефицит · заказ',  desc: 'стока не хватит до поставки' },
  { key: 'dead',      icon: '🧊', label: 'Залежавшийся',     desc: 'нет продаж 14+ дней' },
  { key: 'over',      icon: '🏔', label: 'Затоваривание',    desc: 'запас выше порога' },
  { key: 'riskvneam', icon: '⚠️', label: 'Рискованный топ ВНЕ_АМ', desc: 'внематричный топ' }
];
const SORTS = {
  oos: (a, b) => b.toRub - a.toRub,
  shortage: (a, b) => (b.lvl - a.lvl) || a.daysLeft - b.daysLeft || b.toRub - a.toRub,
  dead: (a, b) => b.frozen - a.frozen,
  over: (a, b) => b.frozen - a.frozen,
  riskvneam: (a, b) => b.toRub - a.toRub
};

function getAnalogIndex() {
  if (analogCache) return analogCache;
  const g3 = new Map(), g2 = new Map(), g1 = new Map();
  rawData.forEach(r => {
    const ck = cubeKind(r['кубы']);
    if (ck === 'ЗО' || ck === 'ЗО сеть') return;
    if (num(r['склад кол']) <= 0) return;
    const to = num(r['то, руб']);
    if (to <= 0) return;
    const put = (map, key) => {
      if (!key) return;
      const cur = map.get(key);
      if (!cur || to > num(cur['то, руб'])) map.set(key, r);
    };
    put(g3, String(r['группа 3'] ?? '').trim());
    put(g2, String(r['группа 2'] ?? '').trim());
    put(g1, String(r['группа 1'] ?? '').trim());
  });
  analogCache = { g3, g2, g1 };
  return analogCache;
}
function findAnalog(r) {
  const idx = getAnalogIndex();
  const g3 = String(r['группа 3'] ?? '').trim(), g2 = String(r['группа 2'] ?? '').trim(), g1 = String(r['группа 1'] ?? '').trim();
  let c = (g3 && idx.g3.get(g3)) || (g2 && idx.g2.get(g2)) || (g1 && idx.g1.get(g1)) || null;
  if (c && String(c['код'] ?? '').trim() === String(r['код'] ?? '').trim()) c = null;
  return c ? { code: String(c['код'] ?? '').trim(), name: String(c['товар'] ?? ''), r: c } : null;
}

function buildProblems(log) {
  const horizon = log.arrivalIn + 7 + cfg.safetyDays;
  const topSet = new Set(
    [...rawData].sort((a, b) => num(b['то, руб']) - num(a['то, руб'])).slice(0, 100)
      .map(r => String(r['код'] ?? '').trim())
  );
  const problems = [];
  const now = Date.now();

  rawData.forEach(r => {
    const code = String(r['код'] ?? '').trim();
    const stock = num(r['склад кол']), sold = num(r['продано (шт)']);
    const toRub = num(r['то, руб']), cost = num(r['себ, руб.']);
    const rate = dailyRate(r), sdl = stockDaysLeft(r);
    const ck = cubeKind(r['кубы']);
    const frozen = num(r['склад сумма, руб.']) || stock * cost;
    const isTop = topSet.has(code);
    const transit = num(r['ост. трансф. + резерв (шт)']);
    const imp = parseDate(r['дата ввоза']);
    const ageDays = imp ? Math.floor((now - imp.getTime()) / 86400000) : null;

    if (stock <= 0 && sold > 0) {
      problems.push({ type: 'oos', lvl: 3, r, code, rate, toRub, transit, ck, isTop });
      return;
    }
    if (stock > 0 && rate > 0 && isFinite(sdl.days) && sdl.days < horizon) {
      const lvl = sdl.days < log.arrivalIn ? 3 : sdl.days < log.arrivalIn + 7 ? 2 : 1;
      const orderQty = Math.max(0, Math.ceil(rate * (log.arrivalIn + 7 + cfg.safetyDays) - stock));
      problems.push({ type: 'shortage', lvl, r, code, rate, toRub, ck, isTop, transit, daysLeft: sdl.days, orderQty });
      return;
    }
    if (isTop && ck === 'ВНЕ_АМ') {
      problems.push({ type: 'riskvneam', lvl: 2, r, code, toRub, stock, daysLeft: sdl.days, frozen, ck, isTop });
      return;
    }
    if (stock > 0 && sold === 0 && rate === 0 && (ageDays === null || ageDays >= 14)) {
      problems.push({ type: 'dead', lvl: 0, r, code, stock, frozen, ck, isTop, ageDays });
      return;
    }
    if (stock > 0 && rate > 0 && isFinite(sdl.days) && sdl.days > cfg.overDays) {
      problems.push({ type: 'over', lvl: 1, r, code, rate, toRub, ck, isTop, frozen, daysLeft: sdl.days });
      return;
    }
  });
  return problems;
}

function analogHtml(an) {
  if (!an) return ' Аналог не найден в группе.';
  return ` Аналог: <b class="link-cell" data-open-product data-code="${escapeHtml(an.code)}">${escapeHtml(an.code)} · ${escapeHtml(truncateStr(an.name, 50))}</b> (топ по ТО в этой группе, не ЗО, в наличии).`;
}

function problemRec(p, log) {
  const zoBlocked = p.ck === 'ЗО' || p.ck === 'ЗО сеть';
  const coverDays = log.arrivalIn + 7 + cfg.safetyDays;
  const whenOrder = log.dOrd === 0 ? 'сегодня' : `${WD[cfg.orderDay].toLowerCase()} ${fmtDate(log.orderDate)}`;

  if (p.type === 'oos') {
    if (zoBlocked) return { cls: 'rec-dark', html: `⛔ ЗО — отгрузки запрещены, заказать нельзя, но позиция топовая и теряет продажи.${analogHtml(findAnalog(p.r))}` };
    const qty = Math.max(1, Math.ceil(p.rate * coverDays));
    return { cls: 'rec-fire', html: `⚡ Позиция теряет продажи каждый день. Заказ ~<b>${qty} шт</b> ${whenOrder} → поставка ${fmtDate(log.arrivalDate)}.${p.transit > 0 ? ` Транзит/резерв: ${fmt(p.transit)} шт.` : ''}` };
  }
  if (p.type === 'shortage') {
    if (zoBlocked) return { cls: 'rec-dark', html: `⛔ ЗО — заказать нельзя, а сток уходит (~${fmtDays(p.daysLeft)} дн.).${analogHtml(findAnalog(p.r))}` };
    if (p.lvl === 3) {
      const gap = Math.max(1, Math.ceil(log.arrivalIn - p.daysLeft));
      return { cls: 'rec-fire', html: `🔴 Не успеет даже при срочном заказе: разрыв ~<b>${gap} дн.</b> (поставка только ${fmtDate(log.arrivalDate)}). Заказ ~<b>${p.orderQty} шт</b> + подумай над трансфером из другого магазина.` };
    }
    if (p.lvl === 2) return { cls: 'rec-warn', html: `🟠 Заказывать в ближайший заказ (${whenOrder}): ~<b>${p.orderQty} шт</b>. Поставка ${fmtDate(log.arrivalDate)}. Текущего стока хватит на ~${fmtDays(p.daysLeft)} дн.` };
    return { cls: 'rec-ok', html: `🟡 Плановый заказ: стока на ~${fmtDays(p.daysLeft)} дн. Ближайшее окно — ${whenOrder}, объём ~${p.orderQty} шт.` };
  }
  if (p.type === 'dead') return { cls: 'rec-dark', html: `🧊 Нет продаж${p.ageDays != null ? ` ${p.ageDays} дн.` : ''}, заморожено ≈ <b>${fmt(p.frozen)} ₽</b>. Проверить выкладку/цену или отправить в уценку.` };
  if (p.type === 'over') return { cls: 'rec-warn', html: `🏔 Стока на ~${fmtDays(p.daysLeft)} дн. (порог ${cfg.overDays}). Заморожено ≈ <b>${fmt(p.frozen)} ₽</b> — рассмотреть уценку или промо.` };
  return { cls: 'rec-warn', html: `⚠️ Внематричный товар в ТОП-100 (ТО ${fmt(p.toRub)} ₽). Риск перебоев/вывода. Решение: ввод в матрицу или обеспечение запаса.` };
}

function problemCard(p, log) {
  const meta = ISSUE_TYPES.find(t => t.key === p.type);
  const stat = (l, v) => `<div class="pstat"><span class="pstat-l">${l}</span><span class="pstat-v">${v}</span></div>`;
  const stats = [];
  stats.push(stat('Склад', p.type === 'oos' ? '0 шт' : fmt(num(p.r['склад кол'])) + ' шт'));
  if (p.rate > 0) stats.push(stat('Скорость', p.rate.toFixed(2) + ' шт/д'));
  if (p.daysLeft !== undefined) stats.push(stat('Хватит на', isFinite(p.daysLeft) ? fmtDays(p.daysLeft) + ' дн.' : '∞'));
  if (p.toRub) stats.push(stat('ТО', fmt(p.toRub) + ' ₽'));
  if (p.frozen) stats.push(stat('Заморожено', fmt(p.frozen) + ' ₽'));
  if (p.ageDays != null && p.type === 'dead') stats.push(stat('Без продаж', p.ageDays + ' дн.'));
  if (p.transit > 0) stats.push(stat('Транзит/резерв', fmt(p.transit) + ' шт'));
  if (p.type === 'shortage' && p.orderQty > 0) stats.push(stat('Заказ', '~' + p.orderQty + ' шт'));

  const rec = problemRec(p, log);
  const g1 = String(p.r['группа 1'] ?? '').trim();
  return `<div class="problem-card sev-${p.lvl}">
    <div class="problem-head">
      <span class="problem-type">${meta.icon} ${meta.label}</span>
      <span class="problem-name link-cell" data-open-product data-code="${escapeHtml(p.code)}"><b>${escapeHtml(p.code)}</b> — ${escapeHtml(truncateStr(p.r['товар'], 70))}</span>
      ${p.isTop ? '<span class="flag-top">🏆 ТОП-100</span>' : ''}
      ${cubeBadge(p.r['кубы'])}
      <span class="text-muted" style="margin-left:auto;font-size:.75rem">${escapeHtml(g1)}</span>
    </div>
    <div class="problem-metrics">${stats.join('')}</div>
    <div class="problem-rec ${rec.cls}">${rec.html}</div>
  </div>`;
}

function cfgPanelHtml() {
  const dayOpts = (selVal) => [1, 2, 3, 4, 5, 6, 0].map(d =>
    `<option value="${d}"${d === selVal ? ' selected' : ''}>${WD[d]}</option>`).join('');
  const log = getLogistics(cfg);
  return `<div class="cfg-panel">
    <div class="cfg-item"><label>День заказа</label><select id="cfgOrderDay">${dayOpts(cfg.orderDay)}</select></div>
    <div class="cfg-item"><label>День поставки</label><select id="cfgDeliveryDay">${dayOpts(cfg.deliveryDay)}</select></div>
    <div class="cfg-item"><label>Страховой запас, дн.</label><input type="number" id="cfgSafetyDays" min="0" max="30" value="${cfg.safetyDays}"></div>
    <div class="cfg-item"><label>Порог затоваривания, дн.</label><input type="number" id="cfgOverDays" min="30" max="365" value="${cfg.overDays}"></div>
    <div class="hint">Схема: заказ в ${WD[cfg.orderDay]} → поставка через ${log.lag} дн. (${WD[cfg.deliveryDay]}) → цикл 7 дн. Параметры сохраняются в браузере.</div>
  </div>`;
}

function renderIssues() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  const log = getLogistics(cfg);
  const all = buildProblems(log);

  const counts = { all: all.length };
  ISSUE_TYPES.forEach(t => counts[t.key] = all.filter(p => p.type === t.key).length);

  let list;
  if (issueFilter === 'all') {
    list = ISSUE_TYPES.flatMap(t => all.filter(p => p.type === t.key).sort(SORTS[t.key]));
  } else {
    list = all.filter(p => p.type === issueFilter).sort(SORTS[issueFilter]);
  }
  const shown = list.slice(0, ISSUES_LIMIT);

  const orderNote = log.dOrd === 0 ? ' — <b class="fire-text">сегодня!</b>' : ` через ${log.dOrd} дн.`;
  const timeline = `
    <div class="logi-bar">
      <span>📅 Сегодня: <b>${fmtDate(log.today)} (${WD[log.dow].toLowerCase()})</b></span>
      <span>🛒 Ближайший заказ: <b>${fmtDate(log.orderDate)} (${WD[cfg.orderDay].toLowerCase()})</b>${orderNote}</span>
      <span>🚚 Поставка при заказе сейчас: <b>${fmtDate(log.arrivalDate)}</b> (через ${log.arrivalIn} дн.)</span>
      <span>🛡 Страховой запас: <b>${cfg.safetyDays} дн.</b></span>
      <button class="btn-ghost" type="button" id="issueCfgToggle" style="margin-left:auto">⚙ Параметры логистики</button>
    </div>
    ${issueCfgOpen ? cfgPanelHtml() : ''}
  `;

  const chips = [`<button type="button" class="chip ${issueFilter === 'all' ? 'active' : ''}" data-issue-filter="all">Все (${counts.all})</button>`]
    .concat(ISSUE_TYPES.map(t =>
      `<button type="button" class="chip ${issueFilter === t.key ? 'active' : ''}" data-issue-filter="${t.key}">${t.icon} ${t.label} (${counts[t.key] || 0})</button>`))
    .join('');

  const cards = shown.length
    ? shown.map(p => problemCard(p, log)).join('')
    : '<div class="alert-item alert-ok">🎉 По этому типу проблем нет.</div>';
  const capNote = list.length > ISSUES_LIMIT ? `<div class="hint" style="margin-top:8px">Показаны первые ${ISSUES_LIMIT} из ${list.length}. Уточните фильтр типа.</div>` : '';

  issuesTitle.textContent = `🚨 Проблемы — ${counts.all} позиций требуют внимания`;
  issuesContent.innerHTML = timeline + `<div class="chip-row">${chips}</div>` + cards + capNote;
  issuesCard.classList.remove('hidden');
  showStatus(`✅ Проблем найдено: ${counts.all}.\n` + ISSUE_TYPES.map(t => `${t.icon} ${t.label}: ${counts[t.key] || 0}`).join(' · '), 'success');
}

issuesCard.addEventListener('click', e => {
  const chip = e.target.closest('[data-issue-filter]');
  if (chip) { issueFilter = chip.dataset.issueFilter; renderIssues(); return; }
  if (e.target.closest('#issueCfgToggle')) { issueCfgOpen = !issueCfgOpen; renderIssues(); return; }
  const p = e.target.closest('[data-open-product]');
  if (p) { openProduct(p.dataset.code, null); return; }
  const g = e.target.closest('[data-open-group]');
  if (g) openGroup(g.dataset.g1 || '', g.dataset.g2 || '', g.dataset.g3 || '');
});

issuesCard.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'cfgOrderDay')    { cfg.orderDay = +t.value;    saveCfg(); renderIssues(); }
  if (t.id === 'cfgDeliveryDay') { cfg.deliveryDay = +t.value; saveCfg(); renderIssues(); }
  if (t.id === 'cfgSafetyDays')  { cfg.safetyDays = Math.max(0, Math.min(30, +t.value || 0)); saveCfg(); renderIssues(); }
  if (t.id === 'cfgOverDays')    { cfg.overDays = Math.max(30, Math.min(365, +t.value || 90)); saveCfg(); renderIssues(); }
});