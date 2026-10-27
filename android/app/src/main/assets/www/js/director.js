/* Isolated management workspace: all external report integration uses one event. */
(function(){
  'use strict';
  const R=window.DirectorRules,card=document.getElementById('directorCard');
  if(!card)return;
  const tabs={today:'Сегодня',prices:'Контроль цен',shortage:'До поставки',problem:'Проблемный сток',shelf:'Проверка полки',clearance:'Приоритет распродажи',compare:'Сравнить снимки',history:'История цен',zones:'План зоны',efficiency:'Эффективность групп',quality:'Качество данных',tasks:'Задания'};
  const state={tab:'today',query:'',group:'',cubes:[],onlyStock:false,priceKind:'below',minRub:1,minPct:1,threshold:'any',arrival:getLogistics(cfg).arrivalIn,horizon:14,store:'',before:'',after:'',zone:'',zoneLevel:'group2',zoneQuery:'',zoneMin:'',zoneMax:'',exportKind:'full',taskStatus:'',assigneeFilter:'',page:0,selected:new Set(),taskSelected:new Set(),metas:[],tasks:[],snapshot:null,comparison:[],history:[],quality:null,notice:'',error:false,loaded:false,revision:0};
  const store=new DirectorStore();
  let live=null,viewRows=[],viewHeaders=[],historyStore='',historyLoad=0,loadRevision=0,operation=Promise.resolve();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const amount=(value,digits=2)=>value===null||value===undefined||!Number.isFinite(value)?'—':value.toLocaleString('ru-RU',{maximumFractionDigits:digits});
  const money=value=>value===null||value===undefined?'—':amount(value)+' ₽';
  const signed=value=>value===null||value===undefined?'—':(value>0?'+':'')+amount(value);
  const date=value=>value?new Date(value+'T00:00:00').toLocaleDateString('ru-RU'):'—';
  const today=()=>R.iso(new Date());
  function message(text,error=false){state.notice=text;state.error=error;render();}
  function fail(error){message('Не удалось выполнить действие: '+(error.message||error)+'. Сохраните резервную копию JSON, если хранилище недоступно.',true);}
  function current(){return live&&live.store===state.store?live:state.snapshot;}
  function available(){const s=current();return s?s.products:[];}
  function contextDay(){return current()?.date||today();}
  function uid(){return 'task_'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));}
  function resetSelection(){state.page=0;state.selected.clear();state.taskSelected.clear();}
  function rowsFiltered(products){return products.filter(p=>(!state.query||[p.code,p.name,p.group,p.group2,p.group3].join(' ').toLowerCase().includes(state.query.toLowerCase()))&&(!state.group||p.group===state.group)&&(!state.cubes.length||state.cubes.includes(R.cube(p)))&&(!state.onlyStock||p.stock>0));}
  function options(values,value,empty){return `<option value="">${esc(empty)}</option>`+values.map(x=>`<option value="${esc(x)}"${x===value?' selected':''}>${esc(x)}</option>`).join('');}
  const option=(value,label,currentValue)=>`<option value="${esc(value)}"${value===currentValue?' selected':''}>${esc(label)}</option>`;
  function field(label,html){return `<label class="dr-field">${esc(label)}${html}</label>`;}
  function input(key,value,type='text',extra=''){return `<input data-dr-field="${key}" type="${type}" value="${esc(value)}" ${extra}>`;}
  function select(key,html){return `<select data-dr-field="${key}">${html}</select>`;}
  function note(text,cls=''){return `<div class="dr-note ${cls}">${esc(text)}</div>`;}
  function kpis(items){return `<div class="dr-kpis">${items.map(([label,value])=>`<div class="dr-kpi">${esc(label)}<strong>${esc(value)}</strong></div>`).join('')}</div>`;}
  function productCell(p){const clickable=live&&p.store===live.store&&typeof codeIndex!=='undefined'&&codeIndex.has(p.code);return `<td class="dr-product">${clickable?`<button class="dr-link" data-dr-product="${esc(p.code)}">${esc(p.code)}</button>`:esc(p.code)}<br>${esc(p.name)}${typeof productZones==='function'&&productZones(p.code).length>1?`<span class="su-zone-flag" title="${esc(productZones(p.code).map(z=>z.name).join(', '))}">${productZones(p.code).length} зоны</span>`:''}<span class="dr-small">${esc([p.group,p.cube].filter(Boolean).join(' · '))}</span></td>`;}
  function cell(value,numeric=false){return `<td${numeric?' class="dr-num"':''}>${esc(value)}</td>`;}
  function dataTable(headers,rows,renderRow){
    viewRows=rows;viewHeaders=headers;
    const pages=Math.max(1,Math.ceil(rows.length/150));state.page=Math.min(state.page,pages-1);
    const shown=rows.slice(state.page*150,state.page*150+150);
    return `<div class="dr-actions"><span>Найдено: <b>${rows.length}</b> · выбрано: <b>${state.selected.size}</b></span><button data-dr-action="select-all">Выбрать все найденные</button><button data-dr-action="clear-selection">Снять выбор</button><label class="su-export-label">${select('exportKind',[['prices','Артикул + новая цена'],['changed','Артикул + изменённая пользователем цена'],['full','Полная таблица найденных'],['codes','Только артикулы']].map(([v,l])=>option(v,l,state.exportKind)).join(''))}</label><button data-dr-action="export">Экспорт всех найденных</button><button data-dr-action="create-tasks">Создать задания из выбранных</button></div><div class="dr-scroll"><table><thead><tr><th>✓</th>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${shown.map(row=>`<tr><td><input type="checkbox" data-dr-code="${esc(row.p.code)}" ${state.selected.has(row.p.code)?'checked':''} aria-label="Выбрать ${esc(row.p.code)}"></td>${renderRow(row)}</tr>`).join('')||`<tr><td colspan="${headers.length+1}">Нет позиций по выбранным условиям</td></tr>`}</tbody></table></div><div class="dr-actions"><button data-dr-action="prev" ${state.page===0?'disabled':''}>←</button><span>${state.page+1} / ${pages}</span><button data-dr-action="next" ${state.page+1>=pages?'disabled':''}>→</button></div>`;
  }
  function summaryTable(headers,rows){viewRows=[];return `<div class="dr-scroll"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>cell(v)).join('')}</tr>`).join('')||'<tr><td>Нет данных</td></tr>'}</tbody></table></div>`;}
  function toolbars(){
    if(state.tab==='quality')return note(state.qualityName?'Проверяется отдельный файл: '+state.qualityName:'Проверяется весь текущий снимок без товарных фильтров.');
    const snapshot=current(),products=available(),groups=[...new Set(products.map(p=>p.group).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const shops=[...new Set([...(live?[live.store]:[]),...state.metas.map(m=>m.store)])].sort();
    let result=`<div class="dr-toolbar">${field('Магазин',select('store',shops.map(shop=>option(shop,shop,state.store)).join('')))}${field('Поиск артикула / товара',input('query',state.query,'search'))}${field('Группа',select('group',options(groups,state.group,'Все группы')))}<fieldset class="su-checks"><legend>КУБы</legend>${['ЗО','ЗО сеть','ВНЕ_АМ'].map(c=>`<label><input type="checkbox" data-dr-cube="${c}" ${state.cubes.includes(c)?'checked':''}> ${c}</label>`).join('')}</fieldset><label><input data-dr-field="onlyStock" type="checkbox" ${state.onlyStock?'checked':''}> Со стоком</label></div>`;
    if(state.tab==='tasks')result=`<div class="dr-toolbar">${field('Магазин',select('store',shops.map(shop=>option(shop,shop,state.store)).join('')))}${field('Поиск артикула / товара',input('query',state.query,'search'))}</div>`;
    if(snapshot)result+=note(`Снимок ${date(snapshot.date)} · ${snapshot.products.length} артикулов. Сроки оцениваются на сегодня, возраст и проблемный сток — на дату снимка.`);
    if(state.tab==='prices')result+=`<div class="dr-toolbar">${field('Отклонение',select('priceKind',[['below','Ниже ТН'],['above','Выше ТН'],['equal','Совпадает с ТН'],['missing','Нет корректной цены'],['all','Все цены']].map(([v,l])=>option(v,l,state.priceKind)).join('')))}${field('Минимум, ₽',input('minRub',state.minRub,'number','min="0" step="0.01"'))}${field('Минимум, %',input('minPct',state.minPct,'number','min="0" step="0.1"'))}${field('Порог',select('threshold',option('any','Достаточно одного порога',state.threshold)+option('both','Оба порога одновременно',state.threshold)))}</div>`;
    if(['today','shortage','zones'].includes(state.tab))result+=`<div class="dr-toolbar">${field('До ближайшей поставки, дней',input('arrival',state.arrival,'number','min="0" max="60"'))}</div>`;
    if(state.tab==='clearance')result+=`<div class="dr-toolbar">${field('Окончание продаж в ближайшие, дней',input('horizon',state.horizon,'number','min="0" max="365"'))}</div>`;
    return result;
  }
  function recommendations(products){
    const list=R.priorities(products,today(),state.arrival,contextDay());
    const byCode=new Map(list.map(row=>[row.p.code,row])),catalog=new Map(products.map(p=>[p.code,p]));
    if(typeof zones!=='undefined')for(const zone of zones)for(const code of new Set(zone.codes||[])){
      const p=catalog.get(code),norm=R.number((zone.refill||{})[code]);if(!p||p.endDate||!(norm>0)||R.cube(p).startsWith('ЗО'))continue;
      const rate=R.rate(p),order=Math.max(0,Math.ceil(combinedZoneNorm(code,norm)+rate*7-Math.max(0,(p.stock||0)-rate*state.arrival)));if(!order)continue;
      if(!byCode.has(code)){const row={p,reasons:[],score:75,kind:'supply',days:p.endDate?SoldieRules.daysBetween(today(),p.endDate):null};list.push(row);byCode.set(code,row);}
      const row=byCode.get(code);row.reasons.push('Зона «'+zone.name+'»: дозаказ '+order+' шт');if(row.score<75){row.score=75;row.kind='supply';}
    }
    list.sort((a,b)=>b.score-a.score||(b.p.stockValue||0)-(a.p.stockValue||0));
    return kpis([['Требуют внимания',list.length],['Просроченных SKU',list.filter(x=>x.days!==null&&x.days<0&&x.p.stock>0).length],['Действующих заданий',state.tasks.filter(t=>t.store===state.store&&t.status!=='done').length]])+dataTable(['Товар','Приоритет','Что сделать','Остаток','Склад ₽'],list,row=>productCell(row.p)+cell(row.score)+cell(row.reasons.join('; '))+cell(amount(row.p.stock),true)+cell(money(row.p.stockValue),true));
  }
  function prices(products){
    const rows=products.filter(p=>R.priceMatches(p,state.priceKind,state.minRub,state.minPct,state.threshold)).map(p=>({p,gap:R.price(p)})).sort((a,b)=>Math.abs(b.gap.value||0)-Math.abs(a.gap.value||0));
    return note('Разница стоимости остатка = (цена магазина − ТН) × остаток. Это сценарная оценка, а не фактическая потеря прибыли. Товары со сроком распродажи помечены отдельно.')+kpis([['Артикулов',rows.length],['Разница стоимости остатка',money(rows.reduce((s,r)=>s+(r.gap.value||0),0))]])+dataTable(['Товар','Цена магазина','Цена ТН','Цена пользователя','Δ ₽','Δ %','Разница остатка ₽','Продано за 28 дней','Наценка','Переоценка / срок'],rows,({p,gap})=>productCell(p)+cell(money(p.price),true)+cell(money(p.tn),true)+`<td><input type="number" min="1" step="0.1" data-dr-price="${esc(p.code)}" aria-label="Цена пользователя ${esc(p.code)}" value="${esc(current()===live&&SuadelaExport.prices.has(p.code)?SuadelaExport.prices.get(p.code):p.price)}" ${current()===live?'':'disabled'}></td>`+cell(signed(gap.delta),true)+cell(gap.percent===null?'—':signed(gap.percent)+'%',true)+cell(money(gap.value),true)+cell(amount(p.sold),true)+cell(p.cost>0&&p.price!==null?amount((p.price-p.cost)/p.cost*100)+'%':'—',true)+cell(date(p.repriceDate)+(p.endDate?' · распродажа до '+date(p.endDate):'')));
  }
  function shortages(products){
    const rows=products.map(p=>({p,risk:R.shortage(p,state.arrival)})).filter(x=>x.risk.units>0).sort((a,b)=>(b.risk.gpRisk||0)-(a.risk.gpRisk||0));
    return note('Оценка риска до поставки по текущему темпу. Потенциальные ТО и ВП под риском не являются фактическими потерями. Остаток 9999 дней означает бесконечный запас.')+kpis([['Позиций под риском',rows.length],['ВП под риском · оценка',money(rows.reduce((s,x)=>s+(x.risk.gpRisk||0),0))]])+dataTable(['Товар','Остаток','Шт/день','Ожидаемый дефицит','ТО под риском','ВП под риском','Действие'],rows,({p,risk})=>productCell(p)+cell(amount(p.stock),true)+cell(amount(risk.daily),true)+cell(amount(risk.units),true)+cell(money(risk.revenueRisk),true)+cell(money(risk.gpRisk),true)+cell(p.endDate?'Выводится из ассортимента — без дозаказа':risk.blocked?'ЗО — поставка запрещена; проверить альтернативу':risk.warning?'ВнеАМ — заказ в крайнем случае':'Проверить заказ и наличие на полке'));
  }
  function problems(products){
    const groups=R.groups(products,contextDay()).sort((a,b)=>b.problem-a.problem),rows=products.filter(p=>R.dead(p,contextDay())||R.slow(p,contextDay())).map(p=>({p})).sort((a,b)=>(b.p.stockValue||0)-(a.p.stockValue||0));
    return note('Мёртвый сток входит в медленный. Общая сумма проблемного стока учитывает каждый артикул один раз. Медленный сток — приблизительная оценка по 28 дням.')+kpis([['Проблемный запас без дублей',money(groups.reduce((s,g)=>s+g.problem,0))],['Мёртвый сток',money(groups.reduce((s,g)=>s+g.dead,0))],['Медленный сток',money(groups.reduce((s,g)=>s+g.slow,0))]])+summaryTable(['Группа','Мёртвый ₽','Медленный ₽','Без дублей ₽'],groups.map(g=>[g.group,money(g.dead),money(g.slow),money(g.problem)]))+dataTable(['Товар','Причина','Остаток','Склад ₽','Продано за 28 дней'],rows,({p})=>productCell(p)+cell(R.dead(p,contextDay())?'Мёртвый и медленный':'Медленный')+cell(amount(p.stock),true)+cell(money(p.stockValue),true)+cell(amount(p.sold),true));
  }
  function shelf(products){
    const rows=products.filter(p=>p.stock>0&&(p.sold===0||R.slow(p,contextDay()))).map(p=>({p,kind:'shelf'})).sort((a,b)=>(b.p.stockValue||0)-(a.p.stockValue||0));
    return note('Это задания на физическую проверку: товар может быть на складе, без ценника, плохо виден или просто иметь слабый спрос. Отчёт не доказывает отсутствие на полке.')+dataTable(['Товар','Проверить','Остаток','Продано за 28 дней','Возраст'],rows,({p})=>productCell(p)+cell('Наличие на полке, доступность, выкладку и ценник')+cell(amount(p.stock),true)+cell(amount(p.sold),true)+cell(p.importDate?amount(SoldieRules.daysBetween(p.importDate,contextDay()))+' дн.':'—'));
  }
  function clearance(products){
    const rows=products.filter(p=>p.stock>0&&p.endDate&&SoldieRules.daysBetween(today(),p.endDate)<=state.horizon).map(p=>({p,days:SoldieRules.daysBetween(today(),p.endDate),kind:'expiry'})).sort((a,b)=>a.days-b.days||(b.p.stockValue||0)-(a.p.stockValue||0));
    return note('Сначала просроченные и ближайшие сроки, затем наибольший запас в рублях. Расчёт и применение цены выполняются в существующих разделах уценки.')+dataTable(['Товар','До окончания','Запас, дней','Остаток','Склад ₽','Продано за 28 дней','Рекомендация'],rows,({p,days})=>productCell(p)+cell(days<0?'ПРОСРОЧЕН':days+' дн.')+cell(p.cover>=9999?'∞':amount(p.cover),true)+cell(amount(p.stock),true)+cell(money(p.stockValue),true)+cell(amount(p.sold),true)+cell(days<0?'Проверить и убрать просроченный остаток':p.cover>days?'Приоритетная работа с распродажей':'Проверить выкладку и срок'));
  }
  function snapshotSelectors(){
    const metas=state.metas.filter(m=>m.store===state.store),opts=value=>metas.map(m=>option(m.id,date(m.date)+' · '+m.count+' SKU',value)).join('');
    return `<div class="dr-toolbar">${field('Ранний снимок',select('before',opts(state.before)))}${field('Поздний снимок',select('after',opts(state.after)))}<button data-dr-action="compare">Сравнить</button><button data-dr-action="capture">Сохранить текущий отчёт</button></div>`;
  }
  function comparison(){
    const rows=state.comparison.filter(x=>rowsFiltered([x.p]).length).filter(x=>x.kind!=='existing'||x.stockDelta||x.priceDelta||x.tnDelta||x.stockValueDelta||x.soldDelta||x.deadBefore!==x.deadAfter||x.slowBefore!==x.slowAfter);
    return snapshotSelectors()+note('Δ остатков включает поступления, списания и другие движения: это не количество проданного между датами. Δ продаж относится к двум скользящим 28-дневным периодам. «Исчез» означает отсутствие артикула в снимке, а не гарантированную продажу.')+dataTable(['Товар','Изменение','Δ остатка','Δ цены','Δ ТН','Δ стоимости запаса','Δ продаж за 28 дней','Мёртвый: было → стало','Медленный: было → стало'],rows,x=>productCell(x.p)+cell({added:'Появился',removed:'Исчез',existing:'Изменился'}[x.kind])+cell(signed(x.stockDelta),true)+cell(signed(x.priceDelta),true)+cell(signed(x.tnDelta),true)+cell(money(x.stockValueDelta),true)+cell(signed(x.soldDelta),true)+cell(`${x.deadBefore?'да':'нет'} → ${x.deadAfter?'да':'нет'}`)+cell(`${x.slowBefore?'да':'нет'} → ${x.slowAfter?'да':'нет'}`));
  }
  function history(){
    const rows=state.history.filter(x=>rowsFiltered([x.p]).length);
    return note('История начинается с сохранённых снимков. Дата события — дата обнаружения новой цены в отчёте. Продажи «до/после» — показатели за 28 дней из двух снимков; сами по себе они не доказывают эффект переоценки.')+`<div class="dr-toolbar">${field('Снимки с',input('historyFrom',state.historyFrom||'','date'))}${field('По',input('historyTo',state.historyTo||'','date'))}<button data-dr-action="refresh-history">Обновить историю цен</button></div>`+dataTable(['Товар','Обнаружено','Переоценка по 1С','Предыдущий снимок','Цена до','Цена после','Продажи 28 дней: до → после','Δ продаж 28 дней'],rows,x=>productCell(x.p)+cell(date(x.date))+cell(date(x.after.repriceDate))+cell(date(x.previousDate))+cell(money(x.before.price),true)+cell(money(x.after.price),true)+cell(amount(x.before.sold)+' → '+amount(x.after.sold))+cell(signed(x.soldDelta),true));
  }
  function zoneView(products){
    const list=typeof zones!=='undefined'?zones:[];
    if(!list.length)return note('Создайте коммерческую зону в разделе «Зоны», затем вернитесь сюда.');
    if(!list.some(z=>z.id===state.zone))state.zone=list[0].id;
    const zone=list.find(z=>z.id===state.zone),allProducts=available(),plan=R.planZone(allProducts,zone,contextDay(),state.arrival,{zones:list,level:state.zoneLevel,query:state.zoneQuery,min:state.zoneMin,max:state.zoneMax});
    const rows=plan.filter(x=>x.p&&products.some(p=>p.code===x.code));
    const missing=plan.filter(x=>x.missing);
    return `<div class="dr-toolbar">${field('Зона',select('zone',list.map(z=>option(z.id,z.name,state.zone)).join('')))}${field('Подбор замены',select('zoneLevel',[['group2','Группа 2'],['group3','Группа 3'],['group','Группа 1'],['all','Весь ассортимент']].map(([v,l])=>option(v,l,state.zoneLevel)).join('')))}${field('Поиск замены',input('zoneQuery',state.zoneQuery))}${field('Цена от',input('zoneMin',state.zoneMin,'number','min="0"'))}${field('Цена до',input('zoneMax',state.zoneMax,'number','min="0"'))}</div>`+note('Предложения не меняют состав зоны автоматически. Замены — кандидаты той же группы с продажами и наличием. Проверьте совместимость с темой и ценовым форматом зоны. Дозаказ сохраняет норму выкладки и покрывает неделю после поставки.')+kpis([['Уникальных артикулов зоны',new Set(zone.codes).size],['Не найдены в отчёте',missing.length],['Предлагаемый дозаказ',amount(rows.reduce((s,x)=>s+x.order,0))+' шт']])+dataTable(['Товар','Действие','Норма','Дозаказ, шт','Ограничения','Кандидаты на замену'],rows,x=>productCell(x.p)+cell(x.action)+cell((x.norm===null?'Не задана':amount(x.norm))+(x.members.length>1?' · всего '+amount(x.totalNorm)+' в '+x.members.length+' зонах':''),true)+cell(amount(x.order),true)+cell(x.blocked?'ЗО — поставка запрещена':x.warning?'ВнеАМ — только в крайнем случае':'—')+cell(x.alternatives.map(p=>p.code+' · '+p.name).join('; ')||'—'))+(missing.length?note('Нет в отчёте: '+missing.map(x=>x.code).join(', '),'dr-error'):'');
  }
  function efficiency(products){
    const groups=R.groups(products,contextDay()).sort((a,b)=>(b.efficiency??-Infinity)-(a.efficiency??-Infinity));
    return note('Эффективность = ВП за 28 дней / стоимость текущего остатка. Это ориентир для сравнения групп, не доходность инвестиций и не классическая оборачиваемость: средний запас за период неизвестен. Нулевая стоимость остатка не даёт бесконечную эффективность.')+`<button data-dr-action="export-groups">Excel групп</button>`+summaryTable(['Группа','SKU','Текущий запас ₽','ВП за 28 дней','ВП / запас','Покрытие по себестоимости','Проблемный запас ₽'],groups.map(g=>[g.group,g.count,money(g.stock),g.gpKnown?money(g.gp):'Нет данных',g.efficiency===null?'—':amount(g.efficiency)+'%',g.cover===null?'∞':amount(g.cover)+' дн.',money(g.problem)]));
  }
  function qualityView(products){
    const issues=state.quality||R.quality(products,contextDay());
    return note('Можно проверить исходный Excel отдельно, даже если основной импорт отклонил его. Проверка файла не меняет рабочий отчёт. Будущая дата окончания продаж сама по себе не считается ошибкой.')+`<div class="dr-toolbar"><button data-dr-action="quality-file">Проверить Excel</button><button data-dr-action="quality-current">Текущий отчёт</button><button data-dr-action="export-quality">Excel замечаний</button></div>`+kpis([['Замечаний',issues.length],['Ошибок',issues.filter(x=>x.severity==='error').length],['Предупреждений',issues.filter(x=>x.severity==='warning').length]])+summaryTable(['Артикул','Товар','Уровень','Замечание'],issues.slice(0,1000).map(x=>[x.code,x.p.name,x.severity==='error'?'Ошибка':'Предупреждение',x.message]))+(issues.length>1000?note('Показаны первые 1000 замечаний; экспорт содержит все.'):'');
  }
  function tasksView(){
    const tasks=state.tasks.filter(t=>(!state.store||t.store===state.store)&&(!state.taskStatus||t.status===state.taskStatus)&&(!state.assigneeFilter||t.assignee.toLowerCase().includes(state.assigneeFilter.toLowerCase()))&&(!state.query||[t.code,t.name,t.note,t.zone].join(' ').toLowerCase().includes(state.query.toLowerCase()))).sort((a,b)=>a.status.localeCompare(b.status)||(a.due||'9999').localeCompare(b.due||'9999'));
    const snapshot=current();
    return `<div class="dr-toolbar">${field('Статус',select('taskStatus',options(['open','doing','done'],state.taskStatus,'Все статусы').replace('>open<','>Открыто<').replace('>doing<','>В работе<').replace('>done<','>Выполнено<')))}${field('Исполнитель',input('assigneeFilter',state.assigneeFilter))}<button data-dr-action="print-tasks">Печать выбранных / всех найденных</button><button data-dr-action="export-tasks">Excel заданий</button></div>`+note('Отметка «Выполнено» — подтверждение сотрудника. Результат проверяется отдельно по более позднему снимку. Изменение продаж за 28 дней не доказывает эффект задания.')+kpis([['Открыто',tasks.filter(t=>t.status==='open').length],['В работе',tasks.filter(t=>t.status==='doing').length],['Выполнено',tasks.filter(t=>t.status==='done').length],['Просрочено',tasks.filter(t=>t.status!=='done'&&t.due&&t.due<today()).length]])+`<div class="dr-scroll"><table><thead><tr><th>✓</th><th>Товар / задание</th><th>Исполнитель и срок</th><th>Статус</th><th>Результат по отчёту</th></tr></thead><tbody>${tasks.slice(0,500).map(t=>{
      const result=R.taskResult(t,snapshot),late=t.status!=='done'&&t.due&&t.due<today();
      return `<tr><td><input type="checkbox" data-dr-task-select="${esc(t.id)}" ${state.taskSelected.has(t.id)?'checked':''}></td><td class="dr-product"><b>${esc(t.code)} · ${esc(t.name)}</b><span class="dr-small">${esc(t.reason)} · создано ${date(t.snapshotDate)}</span><div class="dr-taskfields"><textarea data-dr-task="${esc(t.id)}" data-dr-task-field="note" aria-label="Комментарий">${esc(t.note)}</textarea><input data-dr-task="${esc(t.id)}" data-dr-task-field="zone" value="${esc(t.zone)}" placeholder="Зона"></div></td><td class="dr-taskfields"><input data-dr-task="${esc(t.id)}" data-dr-task-field="assignee" value="${esc(t.assignee)}" placeholder="Сотрудник"><input type="date" data-dr-task="${esc(t.id)}" data-dr-task-field="due" value="${esc(t.due)}">${late?'<b>Просрочено</b>':''}</td><td><select data-dr-task="${esc(t.id)}" data-dr-task-field="status">${[['open','Открыто'],['doing','В работе'],['done','Выполнено']].map(([v,l])=>option(v,l,t.status)).join('')}</select>${t.completedAt?`<span class="dr-small">${date(t.completedAt.slice(0,10))}</span>`:''}</td><td>${esc(result.label)}${result.stockDelta!==undefined?`<span class="dr-small">Δ остатка ${signed(result.stockDelta)}; Δ цены ${signed(result.priceDelta)}; Δ продаж за 28 дней ${signed(result.soldDelta)}</span>`:''}</td></tr>`;
    }).join('')||'<tr><td colspan="5">Заданий пока нет. Выберите товары в любом аналитическом списке.</td></tr>'}</tbody></table></div>${tasks.length>500?note('Показаны первые 500; печать и Excel включают все найденные задания.'):''}`;
  }
  function render(){
    if(currentMode!=='director')return;
    card.classList.remove('hidden');
    const products=state.tab==='quality'?available():rowsFiltered(available());viewRows=[];
    const body=state.tab==='tasks'?tasksView():state.tab==='compare'?comparison():state.tab==='history'?history():state.tab==='quality'?qualityView(products):!current()?note('Загрузите основной отчёт «Остатки по датам ввоза» или выберите магазин с сохранёнными снимками.'):({today:recommendations,prices,shortage:shortages,problem:problems,shelf,clearance,zones:zoneView,efficiency})[state.tab](products);
    card.innerHTML=`<div class="dr-head"><h2>🧭 Рабочее место директора</h2><div class="dr-actions"><details class="su-data-menu"><summary>Данные и история</summary><button data-dr-action="capture">Сохранить снимок</button><button data-dr-action="backup">Резервная копия JSON</button><button data-dr-action="restore">Восстановить JSON</button></details></div></div>${state.notice?note(state.notice,state.error?'dr-error':'dr-good'):''}${!state.loaded?note('Загрузка локальной истории…'):''}<div class="dr-tabs">${Object.entries(tabs).map(([key,label])=>`<button data-dr-tab="${key}" class="${state.tab===key?'active':''}">${label}</button>`).join('')}</div>${toolbars()}${body}<details><summary>Сохранённые снимки: ${state.metas.filter(m=>m.store===state.store).length}</summary><div class="dr-actions">${state.metas.filter(m=>m.store===state.store).map(m=>`<span>${date(m.date)} · ${m.count} SKU <button data-dr-delete="${esc(m.id)}" title="Удалить только этот снимок">Удалить</button></span>`).join('')||'Нет сохранённых снимков'}</div></details>`;
    window.dispatchEvent(new Event('suadela-view-change'));
  }
  async function reload(){
    const revision=++loadRevision;
    const [metas,tasks]=await Promise.all([store.list(),store.tasks()]);
    if(revision!==loadRevision)return;
    state.metas=metas;state.tasks=tasks||[];state.loaded=true;
    if(!state.store)state.store=live?.store||metas[0]?.store||'';
    const shop=state.store;
    if(!live||live.store!==shop){const meta=metas.find(m=>m.store===shop);const snapshot=meta?await store.get(meta.id):null;if(revision!==loadRevision||state.store!==shop)return;state.snapshot=snapshot;}
    const same=metas.filter(m=>m.store===shop);
    if(!same.some(m=>m.id===state.after))state.after=same[0]?.id||'';
    if(!same.some(m=>m.id===state.before))state.before=same[1]?.id||same[0]?.id||'';
  }

  const ready=store.init().then(reload).then(()=>{if(store.warning){state.notice=store.warning;state.error=true;}}).catch(error=>{state.loaded=true;state.notice='История недоступна: '+error.message;state.error=true;});
  async function captureReport(rows,reportDay,file=''){
    const stores=[...new Set(rows.map(r=>R.text(r['магазин'])||'Магазин не указан'))];
    if(stores.length!==1)throw Error('Для снимка нужен один магазин');
    const snapshot={store:stores[0],date:R.iso(reportDay),file,savedAt:new Date().toISOString(),products:rows.map(R.product)};
    R.validateSnapshot(snapshot);live=snapshot;state.store=snapshot.store;state.quality=null;state.qualityName='';if(state.group&&!snapshot.products.some(p=>p.group===state.group))state.group='';resetSelection();
    await ready;
    await store.saveSnapshot(snapshot);state.revision++;state.comparison=[];state.history=[];historyStore='';await reload();const same=state.metas.filter(m=>m.store===state.store);state.after=same[0]?.id||'';state.before=same[1]?.id||same[0]?.id||'';state.notice='Снимок '+date(snapshot.date)+' сохранён автоматически';state.error=false;render();return snapshot;
  }
  async function prepareComparison(){await ready;const [before,after]=await Promise.all([store.get(state.before),store.get(state.after)]);if(!before||!after)throw Error('Сохраните хотя бы два снимка разных дат');state.comparison=R.compare(before,after);resetSelection();render();}
  async function loadHistory(){
    await ready;
    if(state.historyFrom&&state.historyTo&&state.historyFrom>state.historyTo)throw Error('Начало периода позже окончания');
    const token=++historyLoad,revision=state.revision,shop=state.store;
    const metas=state.metas.filter(m=>m.store===shop&&(!state.historyFrom||m.date>=state.historyFrom)&&(!state.historyTo||m.date<=state.historyTo)).sort((a,b)=>a.date.localeCompare(b.date));
    const events=[];let previous=null;
    state.notice='Читаю историю цен…';render();
    for(const meta of metas){
      const snapshot=await store.get(meta.id);
      if(token!==historyLoad||revision!==state.revision||shop!==state.store)return;
      if(!snapshot)throw Error('Отсутствует снимок '+date(meta.date));
      if(previous)events.push(...R.priceHistory([previous,snapshot]));previous=snapshot;
    }
    state.history=events.sort((a,b)=>b.date.localeCompare(a.date)||a.code.localeCompare(b.code));historyStore=shop;
    resetSelection();state.notice='Изменений цен: '+events.length;state.error=false;render();
  }

  function exportRows(){
    if(state.exportKind!=='full'){if(['prices','changed'].includes(state.exportKind)&&current()!==live)throw Error('Для экспорта новых цен загрузите рабочий отчёт магазина');const rows=SuadelaExport.rows([...new Map(viewRows.map(x=>[x.p.code,x.p])).values()],state.exportKind);if(rows.length<2)throw Error('Нет товаров для экспорта');exportToExcel('suadela_'+state.exportKind+'_'+today()+'.xlsx','Директор',rows);return;}
    const rows=[['Код','Товар','Группа','КУБ','Остаток','Склад ₽','Цена магазина','Цена ТН','Δ цены ₽','Δ цены %','Продано 28 дней','ТО 28 дней','ВП 28 дней','Дней до окончания','Рекомендация','Δ остатка снимков','Δ продаж 28 дней снимков','Цена до','Цена после','Цена пользователя','Изменено пользователем']];
    viewRows.forEach(x=>{const p=x.p,gap=R.price(p);rows.push([p.code,p.name,p.group,p.cube,p.stock,p.stockValue,p.price,p.tn,gap.delta,gap.percent,p.sold,p.revenue,R.profit(p),p.endDate?SoldieRules.daysBetween(today(),p.endDate):null,x.reasons?.join('; ')||x.action||'',x.stockDelta??null,x.soldDelta??null,x.before?.price??null,x.after?.price??null,current()===live&&SuadelaExport.prices.has(p.code)?SuadelaExport.resolve(p):p.price,current()===live&&SuadelaExport.changed(p)?'Да':'Нет']);});
    if(rows.length===1)throw Error('Нет найденных строк');exportToExcel('director_'+state.tab+'_'+today()+'.xlsx','Директор',rows);
  }
  function selectedTaskList(){const list=state.tasks.filter(t=>(!state.store||t.store===state.store)&&(!state.taskStatus||t.status===state.taskStatus)&&(!state.assigneeFilter||t.assignee.toLowerCase().includes(state.assigneeFilter.toLowerCase()))&&(!state.query||[t.code,t.name,t.note,t.zone].join(' ').toLowerCase().includes(state.query.toLowerCase())));return state.taskSelected.size?list.filter(t=>state.taskSelected.has(t.id)):list;}
  function taskExport(){const list=selectedTaskList();if(!list.length)throw Error('Нет заданий');exportToExcel('director_tasks_'+today()+'.xlsx','Задания',[['Магазин','Артикул','Товар','Задание','Исполнитель','Срок','Зона','Статус','Комментарий','Результат'],...list.map(t=>[t.store,t.code,t.name,t.reason,t.assignee,t.due,t.zone,{open:'Открыто',doing:'В работе',done:'Выполнено'}[t.status],t.note,R.taskResult(t,current()).label])]);}
  function printTasks(){
    const list=selectedTaskList();if(!list.length)throw Error('Нет заданий для печати');
    const portal=document.getElementById('directorPrintPortal')||Object.assign(document.createElement('div'),{id:'directorPrintPortal'});
    portal.style.display='none';portal.innerHTML=`<h1>Лист заданий сотрудникам</h1><div class="dr-print-meta">${esc(state.store)} · ${date(today())} · заданий ${list.length}</div><table><thead><tr><th>✓</th><th>Артикул / товар</th><th>Задание</th><th>Исполнитель / срок / зона</th><th>Комментарий / результат</th></tr></thead><tbody>${list.map(t=>`<tr><td>□</td><td>${esc(t.code)}<br>${esc(t.name)}</td><td>${esc(t.reason)}</td><td>${esc(t.assignee||'Не назначен')}<br>${date(t.due)}<br>${esc(t.zone)}</td><td>${esc(t.note)}<br>Выполнено: __________<br>Проверил: __________</td></tr>`).join('')}</tbody></table>`;document.body.appendChild(portal);document.body.classList.add('soldie-director-print');try{window.print();}finally{setTimeout(()=>{document.body.classList.remove('soldie-director-print');portal.remove();},200);}
  }
  function createTasks(){
    const selected=[...new Map(viewRows.filter(x=>state.selected.has(x.p.code)).map(x=>[x.p.code,x])).values()];if(!selected.length)throw Error('Сначала выберите товары');
    const panel=document.createElement('div');panel.className='dr-note';panel.id='drTaskDraft';panel.innerHTML=`<b>Новых заданий: ${selected.length}</b><div class="dr-toolbar">${field('Исполнитель','<input id="drDraftAssignee" placeholder="ФИО сотрудника">')}${field('Срок',`<input id="drDraftDue" type="date" value="${today()}">`)}${field('Зона','<input id="drDraftZone">')}${field('Дополнительное поручение','<input id="drDraftNote" placeholder="Что проверить / сделать">')}<button data-dr-action="confirm-tasks">Сохранить задания</button><button data-dr-action="cancel-tasks">Отмена</button></div>`;document.getElementById('drTaskDraft')?.remove();card.querySelector('.dr-tabs').after(panel);panel.scrollIntoView({block:'nearest'});
  }
  async function saveNewTasks(){
    const assignee=document.getElementById('drDraftAssignee').value.trim(),due=document.getElementById('drDraftDue').value,zone=document.getElementById('drDraftZone').value.trim(),noteText=document.getElementById('drDraftNote').value.trim();if(due&&!R.iso(due))throw Error('Некорректный срок');
    const chosen=[...new Map(viewRows.filter(x=>state.selected.has(x.p.code)).map(x=>[x.p.code,x])).values()],added=[];let skipped=0;
    for(const row of chosen){const p=row.p,kind=['price','supply','expiry','shelf'].includes(row.kind)?row.kind:({prices:'price',history:'price',shortage:'supply',clearance:'expiry'}[state.tab]||(state.tab==='zones'&&row.order>0?'supply':'shelf'));if(state.tasks.some(t=>t.store===state.store&&t.code===p.code&&t.kind===kind&&t.status!=='done')){skipped++;continue;}
      added.push({id:uid(),store:state.store,code:p.code,name:p.name,kind,reason:row.reasons?.join('; ')||row.action||(kind==='supply'&&R.cube(p).startsWith('ЗО')?'ЗО — поставка запрещена: проверить наличие на полке и альтернативу':kind==='supply'&&R.cube(p)==='ВНЕ_АМ'?'ВнеАМ — заказ в крайнем случае: проверить запас и альтернативы':'')||({price:'Проверить цену относительно ТН',supply:'Проверить запас до поставки и заказ',expiry:'Проверить окончание продаж',shelf:'Проверить наличие, выкладку и ценник'}[kind]),assignee,due,zone:zone||((state.tab==='zones'&&typeof zones!=='undefined')?zones.find(z=>z.id===state.zone)?.name||'':''),note:noteText,status:'open',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),snapshotDate:contextDay(),arrival:state.arrival,baseline:{stock:p.stock,price:p.price,sold:p.sold}});
    }
    await store.saveTasks(added);await reload();resetSelection();message(`Создано заданий: ${added.length}. Уже были открыты: ${skipped}.`);
  }
  async function backup(){await ready;const payload=await store.backup();if(live){const key=JSON.stringify([live.store,live.date]),idx=payload.snapshots.findIndex(s=>JSON.stringify([s.store,s.date])===key);if(idx<0)payload.snapshots.push(live);else if(live.savedAt>payload.snapshots[idx].savedAt)payload.snapshots[idx]=live;}const body=JSON.stringify(payload,null,2),name='soldie_director_'+today()+'.json';if(window.AndroidBridge?.saveText){AndroidBridge.saveText(name,body);return;}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function validateBackup(data){
    if(!data||data.app!=='soldie-director'||data.version!==1||!Array.isArray(data.snapshots)||!Array.isArray(data.tasks))throw Error('Это не резервная копия директора');
    data.snapshots.forEach(R.validateSnapshot);const snapshots=new Set();data.snapshots.forEach(s=>{const key=JSON.stringify([s.store,s.date]);if(snapshots.has(key))throw Error('Повторный снимок магазина и даты');snapshots.add(key);});const ids=new Set();data.tasks.forEach(t=>{if(!t||typeof t.id!=='string'||!t.id||ids.has(t.id)||!['open','doing','done'].includes(t.status)||!['price','supply','expiry','shelf'].includes(t.kind)||!t.baseline)throw Error('Некорректное задание');ids.add(t.id);for(const k of ['store','code','name','reason','assignee','due','zone','note','snapshotDate'])if(typeof t[k]!=='string')throw Error('Некорректные поля задания');if(R.iso(t.snapshotDate)!==t.snapshotDate||(t.due&&R.iso(t.due)!==t.due))throw Error('Некорректная дата задания');for(const key of ['stock','price','sold'])if(t.baseline[key]!==null&&(!Number.isFinite(t.baseline[key])||typeof t.baseline[key]!=='number'))throw Error('Некорректная база задания');});return data;
  }
  const restoreInput=Object.assign(document.createElement('input'),{id:'drRestoreInput',type:'file',accept:'.json',hidden:true});document.body.appendChild(restoreInput);
  restoreInput.addEventListener('change',async()=>{try{const file=restoreInput.files[0];if(!file)return;const data=validateBackup(JSON.parse(await file.text()));if(!confirm(`Восстановить ${data.snapshots.length} снимков и ${data.tasks.length} заданий? Совпадающие магазин/дата и идентификаторы заданий будут заменены. Продажи 3SKU и зоны не изменяются.`))return;await ready;await store.restore(data.snapshots,data.tasks);state.revision++;historyLoad++;await reload();state.comparison=[];state.history=[];historyStore='';message('Резервная копия восстановлена.');}catch(e){fail(e);}finally{restoreInput.value='';}});
  const qualityInput=Object.assign(document.createElement('input'),{id:'drQualityInput',type:'file',accept:'.xlsx,.xls,.csv',hidden:true});document.body.appendChild(qualityInput);
  qualityInput.addEventListener('change',async()=>{try{const file=qualityInput.files[0];if(!file)return;const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}),idx=rows.findIndex(r=>r.some(v=>headerSig(v)==='код')&&r.some(v=>headerSig(v)==='товар'));if(idx<0)throw Error('Не найдена шапка');const canon=new Map(CANON_HEADERS.map(c=>[headerSig(c),c])),columns=rows[idx].map(v=>canon.get(headerSig(v))),codeCol=columns.indexOf('код'),nameCol=columns.indexOf('товар');const products=rows.slice(idx+1).filter(r=>String(r[codeCol]||r[nameCol]||'').trim()).map(row=>R.product(Object.fromEntries(columns.flatMap((c,i)=>c?[[c,row[i]??'']]:[]))));const heading=rows.slice(0,idx).flat().join(' '),match=heading.match(/дата остатков:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);state.quality=R.quality(products,match?R.iso(match[1]):contextDay());state.qualityName=file.name;message(`Проверен файл ${file.name}: ${products.length} строк. Рабочий отчёт не изменён.`);}catch(e){fail(e);}finally{qualityInput.value='';}});
  card.addEventListener('click',event=>{
    const tab=event.target.closest('[data-dr-tab]');if(tab){state.tab=tab.dataset.drTab;resetSelection();state.notice='';render();if(state.tab==='history'&&historyStore!==state.store)loadHistory().catch(fail);return;}
    const p=event.target.closest('[data-dr-product]');if(p){openProduct(p.dataset.drProduct);return;}
    const del=event.target.closest('[data-dr-delete]');if(del){if(confirm('Удалить только выбранный снимок? Задания сохранятся.'))operation=operation.then(async()=>{await ready;await store.remove(del.dataset.drDelete);state.revision++;historyLoad++;await reload();state.comparison=[];state.history=[];historyStore='';render();}).catch(fail);return;}
    const action=event.target.closest('[data-dr-action]')?.dataset.drAction;if(!action)return;
    operation=operation.then(async()=>{
      if(action==='select-all'){viewRows.forEach(x=>state.selected.add(x.p.code));render();}
      if(action==='clear-selection'){resetSelection();render();}
      if(action==='prev'||action==='next'){state.page+=action==='next'?1:-1;render();}
      if(action==='export')exportRows();if(action==='export-tasks')taskExport();if(action==='print-tasks')printTasks();
      if(action==='create-tasks')createTasks();if(action==='confirm-tasks')await saveNewTasks();if(action==='cancel-tasks')document.getElementById('drTaskDraft')?.remove();
      if(action==='capture'){if(!rawData.length||!reportDate)throw Error('Сначала загрузите основной отчёт');await captureReport(rawData,reportDate,fileInput.files[0]?.name||'');}
      if(action==='compare')await prepareComparison();if(action==='refresh-history')await loadHistory();
      if(action==='backup')await backup();if(action==='restore')restoreInput.click();
      if(action==='quality-file')qualityInput.click();if(action==='quality-current'){state.quality=null;state.qualityName='';render();}
      if(action==='export-quality'){const issues=state.quality||R.quality(available(),contextDay());exportToExcel('quality_'+today()+'.xlsx','Качество',[['Код','Товар','Уровень','Замечание'],...issues.map(x=>[x.code,x.p.name,x.severity,x.message])]);}
      if(action==='export-groups'){const groups=R.groups(rowsFiltered(available()),contextDay());exportToExcel('groups_'+today()+'.xlsx','Группы',[['Группа','SKU','Склад ₽','ВП 28 дней','ВП / запас %','Покрытие, дней','Проблемный сток ₽'],...groups.map(g=>[g.group,g.count,g.stock,g.gpKnown?g.gp:null,g.efficiency,g.cover,g.problem])]);}
    }).catch(fail);
  });
  card.addEventListener('change', event => { if(event.target.matches('[data-dr-cube]')) { const c=event.target.dataset.drCube; state.cubes=event.target.checked?[...new Set([...state.cubes,c])]:state.cubes.filter(x=>x!==c); resetSelection(); render(); } });
  card.addEventListener('change',event=>{
    if(event.target.dataset.drPrice){const code=event.target.dataset.drPrice,p=available().find(p=>p.code===code);if(p)SuadelaExport.edit(code,event.target.value,p.price);return;}
    const field=event.target.dataset.drField;
    if(field){const oldStore=state.store;state[field]=event.target.type==='checkbox'?event.target.checked:event.target.type==='number'?Math.max(0,Math.min(100000,Number(event.target.value)||0)):event.target.value;resetSelection();if(field==='before'||field==='after')state.comparison=[];if(field==='historyFrom'||field==='historyTo'){state.history=[];historyStore='';historyLoad++;}if(field==='store'&&oldStore!==state.store){state.comparison=[];state.history=[];historyStore='';reload().then(render).catch(fail);}else render();return;}
    const code=event.target.dataset.drCode;if(code){event.target.checked?state.selected.add(code):state.selected.delete(code);const count=card.querySelector('.dr-actions span');if(count)count.innerHTML=`Найдено: <b>${viewRows.length}</b> · выбрано: <b>${state.selected.size}</b>`;return;}
    const taskId=event.target.dataset.drTaskSelect;if(taskId){event.target.checked?state.taskSelected.add(taskId):state.taskSelected.delete(taskId);return;}
    if(event.target.dataset.drTask){const id=event.target.dataset.drTask,key=event.target.dataset.drTaskField,value=event.target.value;operation=operation.then(async()=>{const task=state.tasks.find(t=>t.id===id);if(!task)return;const next={...task,[key]:value,updatedAt:new Date().toISOString()};if(key==='due'&&value&&!R.iso(value))throw Error('Некорректный срок');if(key==='status')next.completedAt=value==='done'?new Date().toISOString():null;await store.saveTasks([next]);await reload();render();}).catch(fail);}
  });
  window.addEventListener('soldie-report-loaded',event=>{const detail=event.detail;operation=operation.then(()=>captureReport(detail.rows,detail.date,detail.file)).catch(error=>{fail(error);showStatus('Отчёт загружен, но история директора не сохранена: '+error.message,'error');});});
  function open(tab){if(!Object.hasOwn(tabs,tab))return;state.tab=tab;resetSelection();state.notice='';render();if(tab==='history'&&historyStore!==state.store)loadHistory().catch(fail);}
  window.DirectorApp={open,getTab:()=>state.tab,getContext:()=>({store:current()?.store,date:current()?.date,archived:current()!==live}),ready,render:()=>{render();ready.then(render);},captureReport,whenIdle:()=>operation,validateBackup};
})();
