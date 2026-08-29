/* Панель «Проблемы»: исключения по SKU с навигацией магазин → отделы → товары. */
const ISSUE_TYPES = [
  { key:'shortage', icon:'🔴', label:'Недосток', desc:'риск потерять продажи до следующей поставки' },
  { key:'over', icon:'🟣', label:'Пересток', desc:'запас существенно выше целевого' },
  { key:'slow', icon:'🐢', label:'Низкая оборачиваемость', desc:'деньги медленно возвращаются из запаса' },
  { key:'margin', icon:'📉', label:'Низкая валовая прибыль', desc:'маржа ниже 15% или отрицательная' },
  { key:'nosales', icon:'🧊', label:'Непродажи 28+', desc:'есть остаток, но нет продаж минимум 28 дней' },
  { key:'assortment', icon:'⚠️', label:'Ассортиментный риск', desc:'ТОП-товар вне ассортиментной матрицы' }
];
const SORTS = {
  shortage:(a,b) => b.impact-a.impact || a.days-b.days,
  over:(a,b) => b.frozen-a.frozen,
  slow:(a,b) => b.frozen-a.frozen,
  margin:(a,b) => a.margin-b.margin || b.to-a.to,
  nosales:(a,b) => b.frozen-a.frozen,
  assortment:(a,b) => b.to-a.to
};
const ISSUE_MARGIN_LIMIT = 15;
const ISSUE_SLOW_DAYS = 45;

function issueStoreName() {
  const stores = [...new Set(rawData.map(r => String(r['магазин'] || '').trim()).filter(Boolean))];
  return stores.length > 1 ? `Сеть: ${stores.length} магаз.` : 'Магазины';
}
function issuePathKey(p, depth) { return depth === 0 ? String(p.r['магазин'] || '').trim() : String(p.r[`группа ${depth}`] || '').trim(); }
function issuePathLabel(depth, key) { return key || (depth === 0 ? 'Магазин' : 'Без группы'); }
function issueSkuKey(p) { return `${String(p.r['магазин'] || '').trim()}|${p.code}`; }
function uniqueIssueSkus(list) {
  const result = new Map();
  list.forEach(p => { if (!result.has(issueSkuKey(p))) result.set(issueSkuKey(p), p); });
  return [...result.values()];
}
function issuePriority(p) {
  const weights = { shortage: 6000000000, nosales: 4000000000, over: 3000000000, slow: 2000000000, margin: 1000000000, assortment: 0 };
  return (weights[p.type] || 0) + (p.impact || 0) + (p.frozen || 0) + p.to;
}
function issueProfitPerUnit(r) {
  const sold = num(r['продано (шт)']);
  if (sold > 0) return Math.max(0, rowGp(r) / sold);
  return Math.max(0, num(r['цена маг, руб.']) - num(r['себ, руб.']));
}
function buildProblems(log) {
  const horizon = log.arrivalIn + 7 + cfg.safetyDays;
  const top = new Set([...rawData].sort((a,b) => num(b['то, руб']) - num(a['то, руб'])).slice(0,100).map(r => String(r['код'] || '').trim()));
  const out = [];
  rawData.forEach(r => {
    const stock = num(r['склад кол']), sold = num(r['продано (шт)']), rate = dailyRate(r);
    const days = stockDaysLeft(r).days, to = num(r['то, руб']), frozen = itemFrozen(r), gp = rowGp(r);
    const margin = to > 0 ? gp / to * 100 : null, age = itemAgeDays(r), code = String(r['код'] || '').trim();
    const base = { r, code, stock, sold, rate, days, to, frozen, gp, margin, age, transit:num(r['ост. трансф. + резерв (шт)']) };
    // Несколько проблем у SKU допустимы: это показывает все точки приложения усилий, а не скрывает их первой найденной причиной.
    if ((stock <= 0 && rate > 0) || (stock > 0 && rate > 0 && isFinite(days) && days < horizon)) {
      const gap = Math.max(0, horizon - (isFinite(days) ? days : 0));
      out.push({...base, type:'shortage', impact: rate * gap * issueProfitPerUnit(r), orderQty:Math.max(0, Math.ceil(rate * horizon - stock))});
    }
    if (stock > 0 && rate > 0 && isFinite(days) && days > cfg.overDays)
      out.push({...base, type:'over', excess:Math.max(0, stock - rate * cfg.overDays)});
    if (stock > 0 && rate > 0 && isFinite(days) && days >= ISSUE_SLOW_DAYS && days <= cfg.overDays)
      out.push({...base, type:'slow'});
    if (sold > 0 && to > 0 && margin !== null && margin < ISSUE_MARGIN_LIMIT)
      out.push({...base, type:'margin'});
    if (stock > 0 && sold === 0 && age !== null && age >= NO_SALES_DAYS)
      out.push({...base, type:'nosales'});
    if (top.has(code) && cubeKind(r['кубы']) === 'ВНЕ_АМ') out.push({...base, type:'assortment'});
  });
  return out;
}
function issueRec(p, log) {
  if (p.type === 'shortage') return `Заказать ~<b>${fmt(p.orderQty)} шт.</b>${p.stock <= 0 ? ' Сток уже нулевой.' : ` Запаса на ${fmtDays(p.days)} дн.`} Возможная недополученная валовая прибыль до покрытия: <b>${fmt(p.impact)} ₽</b>.`;
  if (p.type === 'over') return `Излишек ~<b>${fmt(p.excess)} шт.</b>, в запасе заморожено <b>${fmt(p.frozen)} ₽</b>. Проверить трансфер, промо или уценку.`;
  if (p.type === 'slow') return `Запаса на <b>${fmtDays(p.days)} дн.</b> — замедлить пополнение и проверить выкладку/цену.`;
  if (p.type === 'margin') return `Валовая маржа <b>${p.margin.toFixed(1)}%</b> (порог ${ISSUE_MARGIN_LIMIT}%). Проверить цену, закупочную себестоимость и скидки.`;
  if (p.type === 'nosales') return `Нет продаж <b>${p.age} дн.</b>; заморожено <b>${fmt(p.frozen)} ₽</b>. Проверить наличие на полке, цену и уценку.`;
  return 'ТОП-товар вне матрицы: подтвердить ввод в матрицу или обеспечить план вывода/замены.';
}
function issueStats(p) {
  const s = [ ['Склад',`${fmt(p.stock)} шт`], ['ТО',`${fmt(p.to)} ₽`] ];
  if (p.rate) s.push(['Скорость',`${p.rate.toFixed(2)} шт/д`]);
  if (isFinite(p.days)) s.push(['Запас',`${fmtDays(p.days)} дн.`]);
  if (p.type === 'margin') s.push(['Маржа',`${p.margin.toFixed(1)}%`]);
  if (p.type === 'nosales') s.push(['Без продаж',`${p.age} дн.`]);
  if (['over','slow','nosales'].includes(p.type)) s.push(['Заморожено',`${fmt(p.frozen)} ₽`]);
  return s.map(x => `<div class="pstat"><span class="pstat-l">${x[0]}</span><span class="pstat-v">${x[1]}</span></div>`).join('');
}
function problemCard(p, log) {
  const t = ISSUE_TYPES.find(x => x.key === p.type), gs = [1,2,3].map(n => String(p.r[`группа ${n}`] || '').trim()).filter(Boolean).join(' → ');
  return `<div class="problem-card sev-${p.type === 'shortage' ? 3 : p.type === 'margin' ? 2 : 1}"><div class="problem-head"><span class="problem-type">${t.icon} ${t.label}</span><span class="problem-name link-cell" data-open-product data-code="${escapeHtml(p.code)}"><b>${escapeHtml(p.code)}</b> — ${escapeHtml(truncateStr(p.r['товар'],70))}</span>${cubeBadge(p.r['кубы'])}<span class="text-muted" style="margin-left:auto;font-size:.72rem">${escapeHtml(gs)}</span></div><div class="problem-metrics">${issueStats(p)}</div><div class="problem-rec ${p.type === 'shortage' ? 'rec-fire' : p.type === 'margin' ? 'rec-warn' : 'rec-dark'}">${issueRec(p,log)}</div></div>`;
}
function issueSummary(all) {
  const sku = uniqueIssueSkus(all);
  const frozen = uniqueIssueSkus(all.filter(p => ['over','slow','nosales'].includes(p.type))).reduce((s,p) => s + p.frozen, 0);
  const lost = all.filter(p => p.type === 'shortage').reduce((s,p) => s + p.impact, 0);
  const oos = uniqueIssueSkus(all.filter(p => p.type === 'shortage' && p.stock <= 0)).length;
  const nosales = uniqueIssueSkus(all.filter(p => p.type === 'nosales')).length;
  return `<div class="issues-hero"><div class="issues-score"><div class="muted">${escapeHtml(issueStoreName())} · центр управления исключениями</div><div class="big">${fmt(sku.length)} SKU требуют решения</div><div class="muted">${fmt(all.length)} сигналов. Один товар может иметь несколько реальных проблем — они не скрываются.</div></div><div class="issue-kpis"><div class="issue-kpi"><span>Риск валовой прибыли</span><b>${fmt(lost)} ₽</b></div><div class="issue-kpi"><span>Капитал в проблемном запасе</span><b>${fmt(frozen)} ₽</b></div><div class="issue-kpi"><span>Критичный недосток</span><b>${fmt(oos)} SKU</b></div><div class="issue-kpi"><span>Непродажи 28+</span><b>${fmt(nosales)} SKU</b></div></div></div>`;
}
function issueCrumbsHtml() {
  const crumbs = [`<span class="crumb ${issuePath.length === 0 ? 'current' : ''}" data-issue-root>⌂ Магазины</span>`];
  issuePath.forEach((p, i) => { crumbs.push('<span class="text-muted">›</span>', `<span class="crumb ${i === issuePath.length - 1 ? 'current' : ''}" data-issue-crumb="${i}">${escapeHtml(issuePathLabel(i,p))}</span>`); });
  return `<div class="crumb-row">${crumbs.join('')}</div>`;
}
function issueTabsHtml(depth, events) {
  return `<div class="tabs">${depth < 4 ? `<button type="button" class="tab-btn ${issueTab === 'groups' ? 'active' : ''}" data-issue-tab="groups">📁 Подгруппы</button>` : ''}<button type="button" class="tab-btn ${issueTab === 'items' ? 'active' : ''}" data-issue-tab="items">📦 Товары (${uniqueIssueSkus(events).length})</button></div>`;
}
function issueGroupsTable(events, depth) {
  const groups = new Map();
  events.forEach(p => { const key=issuePathKey(p, depth); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); });
  const rows = [...groups.entries()].map(([key, ps]) => {
    const sku=uniqueIssueSkus(ps), A=aggRows(sku.map(p=>p.r)), lost=ps.filter(p=>p.type==='shortage').reduce((n,p)=>n+p.impact,0), types=[...new Set(ps.map(p=>ISSUE_TYPES.find(t=>t.key===p.type).icon))].join(' ');
    return { key, A, sku:sku.length, lost, types };
  }).sort((a,b)=>b.lost-a.lost || b.A.stockSum-a.A.stockSum).map(e => `<tr><td><span class="link-cell" data-issue-drill="${escapeHtml(e.key)}"><b>${escapeHtml(issuePathLabel(depth,e.key))}</b></span></td><td>${e.types}</td><td>${fmt(e.sku)}</td><td>${fmt(e.A.to)} ₽</td><td>${fmt(e.A.gp)} ₽</td><td>${e.A.margin.toFixed(1)}%</td><td>${fmt(e.A.stockSum)} ₽</td><td>${coverBadge(e.A.turnover)}</td><td>${fmt(e.lost)} ₽</td></tr>`).join('');
  return `<div class="zone-scroll" style="max-height:56vh"><table class="mini-table sortable"><thead><tr><th>${depth === 0 ? 'Магазин' : `Группа ${depth}`}</th><th>Сигналы</th><th>SKU</th><th>ТО</th><th>ВП</th><th>Маржа</th><th>Склад</th><th>Оборач.</th><th>Риск ВП</th></tr></thead><tbody>${rows || '<tr><td colspan="9">Проблем нет</td></tr>'}</tbody></table></div>`;
}
function issueItemsTable(events) {
  const rows=[...events].sort((a,b)=>issuePriority(b)-issuePriority(a)).slice(0,500).map(p => { const t=ISSUE_TYPES.find(x=>x.key===p.type); return `<tr><td>${t.icon} ${t.label}</td><td><span class="link-cell" data-open-product data-code="${escapeHtml(p.code)}">${escapeHtml(p.code)}</span></td><td style="white-space:normal">${escapeHtml(truncateStr(p.r['товар'],52))}</td><td>${cubeBadge(p.r['кубы'])}</td><td>${fmt(p.stock)}</td><td>${fmt(p.to)} ₽</td><td>${p.margin === null ? '—' : p.margin.toFixed(1)+'%'}</td><td>${isFinite(p.days)?fmtDays(p.days)+' дн.':'∞'}</td><td>${fmt(p.frozen)} ₽</td><td>${fmt(p.impact || 0)} ₽</td></tr>`; }).join('');
  return `<div class="zone-scroll" style="max-height:56vh"><table class="mini-table sortable"><thead><tr><th>Проблема</th><th>Код</th><th>Товар</th><th>КУБ</th><th>Склад</th><th>ТО</th><th>Маржа</th><th>Запас</th><th>Заморожено</th><th>Риск ВП</th></tr></thead><tbody>${rows || '<tr><td colspan="10">Проблем нет</td></tr>'}</tbody></table></div>`;
}
function renderIssues() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  const log=getLogistics(cfg), all=buildProblems(log), counts=Object.fromEntries(ISSUE_TYPES.map(t=>[t.key,all.filter(p=>p.type===t.key).length]));
  const list=issueFilter==='all' ? all : all.filter(p=>p.type===issueFilter);
  const current=list.filter(p=>issuePath.every((x,i)=>issuePathKey(p,i)===x));
  if (issuePath.length >= 4) issueTab='items';
  const chips=[`<button type="button" class="chip ${issueFilter==='all'?'active':''}" data-issue-filter="all">Все сигналы (${all.length})</button>`].concat(ISSUE_TYPES.map(t=>`<button type="button" class="chip ${issueFilter===t.key?'active':''}" data-issue-filter="${t.key}">${t.icon} ${t.label} (${counts[t.key]})</button>`)).join('');
  const A=aggRows(uniqueIssueSkus(current).map(p=>p.r));
  const tiles=tileHtml('Проблемных SKU',fmt(uniqueIssueSkus(current).length),'kpi-danger',`${current.length} сигналов`) + tileHtml('ТО',fmt(A.to)+' ₽','kpi-accent') + tileHtml('Валовая прибыль',fmt(A.gp)+' ₽','',`маржа ${A.margin.toFixed(1)}%`) + tileHtml('Склад',fmt(A.stockSum)+' ₽','',`${fmt(A.stock)} шт`) + tileHtml('Оборачиваемость',fmtDays(A.turnover)+' дн.','',`${A.rate.toFixed(1)} шт/дн`);
  issuesTitle.textContent=`🚨 Проблемы · ${issueFilter === 'all' ? 'все сигналы' : ISSUE_TYPES.find(t=>t.key===issueFilter).label}`;
  issuesContent.innerHTML=`<div style="display:flex;gap:8px;margin-bottom:8px"><button type="button" class="btn-export" id="exportProblemsBtn">⬇️ Excel</button></div>${issueSummary(all)}<div class="logi-bar"><span>🛒 Заказ: <b>${fmtDate(log.orderDate)}</b></span><span>🚚 Поставка: <b>${fmtDate(log.arrivalDate)}</b></span><span>🛡 Покрытие: <b>${cfg.safetyDays} дн.</b></span></div><div class="chip-row">${chips}</div>${issueCrumbsHtml()}${issueTabsHtml(issuePath.length,current)}<div class="kpi-grid">${tiles}</div>${issueTab==='groups' && issuePath.length<4 ? issueGroupsTable(current,issuePath.length) : issueItemsTable(current)}<div class="hint" style="margin-top:6px">Клик по группе — углубиться; «Товары» доступен на любом уровне. Клик по КУБУ открывает его карточку.</div>`;
  issuesCard.classList.remove('hidden'); showStatus(`✅ Найдено ${all.length} сигналов по ${uniqueIssueSkus(all).length} SKU.`, 'success');
}
issuesCard.addEventListener('click', e => {
  if (e.target.closest('#exportProblemsBtn')) return exportProblemsToExcel();
  const f=e.target.closest('[data-issue-filter]'); if(f){ issueFilter=f.dataset.issueFilter; issuePath=[]; issueTab='groups'; return renderIssues(); }
  const d=e.target.closest('[data-issue-drill]'); if(d){ issuePath.push(d.dataset.issueDrill); issueTab=issuePath.length >= 4 ? 'items' : 'groups'; return renderIssues(); }
  const c=e.target.closest('[data-issue-crumb]'); if(c){ issuePath=issuePath.slice(0,+c.dataset.issueCrumb+1); issueTab=issuePath.length >= 4 ? 'items' : 'groups'; return renderIssues(); }
  if(e.target.closest('[data-issue-root]')){ issuePath=[]; issueTab='groups'; return renderIssues(); }
  const tab=e.target.closest('[data-issue-tab]'); if(tab){ issueTab=tab.dataset.issueTab; return renderIssues(); }
  const cube=e.target.closest('[data-open-cube]'); if(cube) return openCube(cube.dataset.openCube);
  const p=e.target.closest('[data-open-product]'); if(p) openProduct(p.dataset.code,null);
});
function exportProblemsToExcel() {
  const all=buildProblems(getLogistics(cfg)), list=(issueFilter==='all'?all:all.filter(p=>p.type===issueFilter));
  const rows=[['Тема','Артикул','Товар','Группа 1','Группа 2','Группа 3','Склад, шт','ТО, руб','Маржа, %','Запас, дн','Заморожено, руб','Риск ВП, руб','Рекомендация']];
  list.forEach(p=>rows.push([ISSUE_TYPES.find(t=>t.key===p.type).label,p.code,String(p.r['товар']||''),...([1,2,3].map(n=>String(p.r[`группа ${n}`]||''))),p.stock,p.to,p.margin===null?'':p.margin.toFixed(1),isFinite(p.days)?p.days:'∞',p.frozen,p.impact||0,issueRec(p,getLogistics(cfg)).replace(/<[^>]+>/g,'')]));
  exportToExcel(`galamart_problems_${excelDateSuffix()}.xlsx`,'Проблемы',rows);
}
