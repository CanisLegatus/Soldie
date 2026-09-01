window.__bootStamp && window.__bootStamp('js/problems.js: выполнение');
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
function issueTree(list, log) {
  const current = list.filter(p => issuePath.every((x, i) => issuePathKey(p, i) === x));
  if (issuePath.length >= 4) {
    const sorted = current.sort(issueFilter === 'all' ? (a,b) => issuePriority(b) - issuePriority(a) : SORTS[issueFilter]);
    return sorted.slice(0, ISSUES_LIMIT).map(p => problemCard(p,log)).join('') || '<div class="issue-empty">В этом разделе проблем нет.</div>';
  }
  const depth = issuePath.length, groups = new Map();
  current.forEach(p => { const key = issuePathKey(p, depth); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); });
  return `<div class="issue-tree">${[...groups.entries()].sort((a,b) => issuePriority(b[1][0]) - issuePriority(a[1][0]) || b[1].length - a[1].length).map(([key, ps]) => { const sku=uniqueIssueSkus(ps), frozen=uniqueIssueSkus(ps.filter(p=>['over','slow','nosales'].includes(p.type))).reduce((s,p)=>s+p.frozen,0), lost=ps.filter(p=>p.type==='shortage').reduce((s,p)=>s+p.impact,0); return `<button type="button" class="issue-node" data-issue-drill="${escapeHtml(key)}"><span>›</span><span class="node-name">${escapeHtml(issuePathLabel(depth,key))}</span><span class="node-stats">${lost ? `риск ${fmt(lost)} ₽` : `запас ${fmt(frozen)} ₽`}</span><span class="node-count">${sku.length} SKU</span></button>`; }).join('')}</div>`;
}
function renderIssues() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  const log=getLogistics(cfg), all=buildProblems(log), counts=Object.fromEntries(ISSUE_TYPES.map(t=>[t.key,all.filter(p=>p.type===t.key).length]));
  const list=issueFilter==='all' ? all : all.filter(p=>p.type===issueFilter);
  const crumbs=['<button type="button" class="crumb" data-issue-root>🏢 '+escapeHtml(issueStoreName())+'</button>'].concat(issuePath.map((p,i)=>`<button type="button" class="crumb ${i===issuePath.length-1?'current':''}" data-issue-crumb="${i}">${escapeHtml(issuePathLabel(i,p))}</button>`)).join('');
  const chips=[`<button type="button" class="chip ${issueFilter==='all'?'active':''}" data-issue-filter="all">Все сигналы (${all.length})</button>`].concat(ISSUE_TYPES.map(t=>`<button type="button" class="chip ${issueFilter===t.key?'active':''}" data-issue-filter="${t.key}" title="${t.desc}">${t.icon} ${t.label} (${counts[t.key]})</button>`)).join('');
  issuesTitle.textContent=`🚨 Проблемы · ${issueStoreName()}`;
  issuesContent.innerHTML=`<div style="display:flex;gap:8px;margin-bottom:8px"><button type="button" class="btn-export" id="exportProblemsBtn">⬇️ Excel</button></div>${issueSummary(all)}<div class="logi-bar"><span>🛒 Заказ: <b>${fmtDate(log.orderDate)}</b></span><span>🚚 Поставка: <b>${fmtDate(log.arrivalDate)}</b></span><span>🛡 Покрытие: <b>${cfg.safetyDays} дн.</b></span></div><div class="chip-row">${chips}</div><div class="crumb-row">${crumbs}</div><div class="top-summary">${issuePath.length < 4 ? (issuePath.length === 0 ? 'Выберите магазин, затем отдел, чтобы углубиться до SKU.' : 'Выберите следующий уровень, чтобы углубиться до SKU.') : `SKU: ${uniqueIssueSkus(list.filter(p => issuePath.every((x,i) => issuePathKey(p,i) === x))).length} проблемных SKU в выбранном разделе.`}</div>${issueTree(list,log)}`;
  issuesCard.classList.remove('hidden');
  showStatus(`✅ Найдено ${all.length} сигналов по ${uniqueIssueSkus(all).length} SKU.`, 'success');
}
issuesCard.addEventListener('click', e => {
  if (e.target.closest('#exportProblemsBtn')) return exportProblemsToExcel();
  const f=e.target.closest('[data-issue-filter]'); if(f){ issueFilter=f.dataset.issueFilter; issuePath=[]; return renderIssues(); }
  const d=e.target.closest('[data-issue-drill]'); if(d){ issuePath.push(d.dataset.issueDrill); return renderIssues(); }
  const c=e.target.closest('[data-issue-crumb]'); if(c){ issuePath=issuePath.slice(0,+c.dataset.issueCrumb+1); return renderIssues(); }
  if(e.target.closest('[data-issue-root]')){ issuePath=[]; return renderIssues(); }
  const p=e.target.closest('[data-open-product]'); if(p) openProduct(p.dataset.code,null);
});
function exportProblemsToExcel() {
  const all=buildProblems(getLogistics(cfg)), list=(issueFilter==='all'?all:all.filter(p=>p.type===issueFilter));
  const rows=[['Тема','Артикул','Товар','Группа 1','Группа 2','Группа 3','Склад, шт','ТО, руб','Маржа, %','Запас, дн','Заморожено, руб','Риск ВП, руб','Рекомендация']];
  list.forEach(p=>rows.push([ISSUE_TYPES.find(t=>t.key===p.type).label,p.code,String(p.r['товар']||''),...([1,2,3].map(n=>String(p.r[`группа ${n}`]||''))),p.stock,p.to,p.margin===null?'':p.margin.toFixed(1),isFinite(p.days)?p.days:'∞',p.frozen,p.impact||0,issueRec(p,getLogistics(cfg)).replace(/<[^>]+>/g,'')]));
  exportToExcel(`galamart_problems_${excelDateSuffix()}.xlsx`,'Проблемы',rows);
}
