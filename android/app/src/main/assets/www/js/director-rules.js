/* Director analytics: pure functions, independent of the UI and persistence. */
(function(root){
  'use strict';
  const B = root.SoldieRules || (typeof require === 'function' ? require('./business.js') : null);
  const text=v=>String(v??'').trim();
  function number(v){if(v==null||text(v)==='')return null;const n=Number(text(v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:null;}
  function iso(v){const d=B.date(v);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:null;}
  const numericFields={cost:'себ, руб.',price:'цена маг, руб.',tn:'цена тн, руб',stock:'склад кол',stockValue:'склад сумма, руб.',sold:'продано (шт)',revenue:'то, руб',soldCost:'то сс, руб',cover:'остатки, дней'};
  function product(r){
    const p={code:text(r['код']),name:text(r['товар']),group:text(r['группа 1']),group2:text(r['группа 2']),group3:text(r['группа 3']),store:text(r['магазин']),cube:text(r['кубы']),invalid:[]};
    Object.entries(numericFields).forEach(([key,column])=>{p[key]=number(r[column]);if(p[key]===null&&text(r[column]))p.invalid.push('Нечисловое значение: '+column);});
    [['importDate','дата ввоза'],['repriceDate','дата переоценки'],['endDate','дата окончания продаж']].forEach(([key,column])=>{p[key]=iso(r[column]);if(text(r[column])&&!p[key])p.invalid.push('Неверная дата: '+column);});
    if(p.stockValue===null&&p.stock!==null&&p.cost!==null)p.stockValue=p.stock*p.cost;
    return p;
  }
  function cube(p){const v=p.cube.toLowerCase();return v.includes('зо')?(/сет/.test(v)?'ЗО сеть':'ЗО'):/вне[_\s-]*ам/.test(v)?'ВНЕ_АМ':'';}
  function rate(p){if(p.cover>=9999)return 0;if(p.cover>0&&p.stock>0)return p.stock/p.cover;return Math.max(0,p.sold||0)/28;}
  function dead(p,day){const age=B.daysBetween(p.importDate,day);return p.stock>0&&p.sold===0&&age!==null&&age>=28;}
  function slow(p,day=iso(new Date())){const age=B.daysBetween(p.importDate,day);return age!==null&&age>=28&&p.sold!==null&&B.slow(p.stock,p.sold);}
  function profit(p){return p.revenue!==null&&p.soldCost!==null?p.revenue-p.soldCost:null;}
  function price(p){
    if(!(p.price>0&&p.tn>0))return {kind:'missing',delta:null,percent:null,value:null};
    const delta=(Math.round(p.price*100)-Math.round(p.tn*100))/100;
    return {kind:delta<0?'below':delta>0?'above':'equal',delta,percent:delta/p.tn*100,value:delta*Math.max(0,p.stock||0)};
  }
  function priceMatches(p,kind,minRub=0,minPct=0,threshold='any'){
    const a=price(p);if(kind!=='all'&&a.kind!==kind)return false;
    if(a.kind==='missing'||a.kind==='equal')return true;
    const checks=[];if(minRub>0)checks.push(Math.abs(a.delta)+1e-8>=minRub);if(minPct>0)checks.push(Math.abs(a.percent)+1e-8>=minPct);
    return !checks.length||(threshold==='both'?checks.every(Boolean):checks.some(Boolean));
  }
  function shortage(p,arrival){
    const daily=rate(p),units=Math.max(0,daily*arrival-Math.max(0,p.stock||0));
    const gp=profit(p),unitGp=p.sold>0&&gp!==null?gp/p.sold:null;
    return {daily,units,revenueRisk:p.sold>0&&p.revenue!==null?units*p.revenue/p.sold:null,gpRisk:unitGp===null?null:units*Math.max(0,unitGp),blocked:cube(p).startsWith('ЗО'),warning:cube(p)==='ВНЕ_АМ'};
  }
  function priorities(products,day,arrival=7,stockDay=day){
    return products.map(p=>{
      const reasons=[];let score=0,kind='shelf';const days=B.daysBetween(day,p.endDate),gap=price(p),risk=shortage(p,arrival);
      if(p.stock>0&&days!==null&&days<0){reasons.push('Срок продаж прошёл');score=100;kind='expiry';}
      else if(p.stock>0&&days!==null&&days<=7){reasons.push('До окончания продаж '+days+' дн.');score=90;kind='expiry';}
      if(risk.units>0&&!p.endDate){reasons.push(risk.blocked?'Запаса не хватит; ЗО — поставка запрещена':'Запаса не хватит до поставки');if(score<80){score=80;kind='supply';}}
      if(gap.kind==='missing'){reasons.push('Проверить отсутствующую или неверную цену');if(score<70){score=70;kind='price';}}
      if(p.stock<0){reasons.push('Проверить отрицательный остаток');if(score<85){score=85;kind='shelf';}}
      if(dead(p,stockDay)){reasons.push('Мёртвый сток — проверить полку и ценник');score=Math.max(score,55);}
      else if(slow(p,stockDay)){reasons.push('Медленный сток — проверить выкладку');score=Math.max(score,40);}
      return {p,reasons,score,kind,days,risk};
    }).filter(x=>x.score).sort((a,b)=>b.score-a.score||(b.p.stockValue||0)-(a.p.stockValue||0)||a.p.code.localeCompare(b.p.code));
  }
  function groups(products,day){
    const map=new Map();products.forEach(p=>{
      const key=p.group||'Без группы';if(!map.has(key))map.set(key,{group:key,count:0,stock:0,dead:0,slow:0,problem:0,gp:0,gpKnown:0,soldCost:0});
      const g=map.get(key),value=Math.max(0,p.stockValue||0),isDead=dead(p,day),isSlow=slow(p,day),gp=profit(p);
      g.count++;g.stock+=value;if(isDead)g.dead+=value;if(isSlow)g.slow+=value;if(isDead||isSlow)g.problem+=value;
      if(gp!==null){g.gp+=gp;g.gpKnown++;}g.soldCost+=p.soldCost||0;
    });
    return [...map.values()].map(g=>({...g,efficiency:g.stock>0&&g.gpKnown?g.gp/g.stock*100:null,cover:g.soldCost>0?g.stock/(g.soldCost/28):null}));
  }
  function compare(before,after){
    if(before.store!==after.store)throw Error('Сравнение доступно только для одного магазина');
    if(before.date>=after.date)throw Error('Первый снимок должен быть раньше второго');
    const a=new Map(before.products.map(p=>[p.code,p])),b=new Map(after.products.map(p=>[p.code,p]));
    return [...new Set([...a.keys(),...b.keys()])].map(code=>{
      const old=a.get(code),now=b.get(code),difference=key=>old&&now&&old[key]!==null&&now[key]!==null?now[key]-old[key]:null;
      return {code,p:now||old,kind:!old?'added':!now?'removed':'existing',before:old,after:now,stockDelta:difference('stock'),priceDelta:difference('price'),tnDelta:difference('tn'),stockValueDelta:difference('stockValue'),soldDelta:difference('sold'),deadBefore:old?dead(old,before.date):false,deadAfter:now?dead(now,after.date):false,slowBefore:old?slow(old,before.date):false,slowAfter:now?slow(now,after.date):false};
    });
  }
  function priceHistory(snapshots){
    const byStore=new Map(),events=[];snapshots.forEach(s=>{if(!byStore.has(s.store))byStore.set(s.store,[]);byStore.get(s.store).push(s);});
    byStore.forEach(list=>{list.sort((a,b)=>a.date.localeCompare(b.date));for(let i=1;i<list.length;i++)compare(list[i-1],list[i]).forEach(c=>{if(c.priceDelta!==null&&Math.abs(c.priceDelta)>=0.005)events.push({...c,date:list[i].date,previousDate:list[i-1].date,store:list[i].store});});});
    return events.sort((a,b)=>b.date.localeCompare(a.date)||a.code.localeCompare(b.code));
  }
  function planZone(products,zone,day,arrival=7,options={}){
    const catalog=new Map(products.map(p=>[p.code,p])),codes=new Set(zone.codes||[]);
    return [...codes].map(code=>{
      const p=catalog.get(code);if(!p)return {code,missing:true,action:'Нет артикула в текущем отчёте'};
      const norm=number((zone.refill||{})[code]),members=(options.zones||[zone]).filter(z=>(z.codes||[]).includes(code)),totalNorm=members.reduce((sum,z)=>sum+Math.max(0,number((z.refill||{})[code])||0),0),daily=rate(p),risk=shortage(p,arrival),projected=Math.max(0,(p.stock||0)-daily*arrival);
      const order=totalNorm>0&&!risk.blocked&&!p.endDate?Math.max(0,Math.ceil(totalNorm+daily*7-projected)):0;
      const replace=dead(p,day)||slow(p,day)||(p.endDate&&B.daysBetween(day,p.endDate)<0);
      const level=options.level||'group2',query=text(options.query).toLowerCase(),min=number(options.min),max=number(options.max);
      const alternatives=replace?products.filter(q=>!codes.has(q.code)&&(level==='all'||(level==='group2'?q.group===p.group&&!!p.group2&&q.group2===p.group2:level==='group3'?q.group===p.group&&q.group2===p.group2&&!!p.group3&&q.group3===p.group3:q.group===p.group))&&q.stock>0&&q.sold>0&&!slow(q,day)&&!cube(q).startsWith('ЗО')&&!q.endDate&&(!query||[q.code,q.name,q.group,q.group2,q.group3].join(' ').toLowerCase().includes(query))&&(min===null||q.price>=min)&&(max===null||q.price<=max)).sort((a,b)=>(profit(b)||0)-(profit(a)||0)).slice(0,Math.max(1,Math.min(20,options.limit||5))):[];
      return {p,code,norm,totalNorm,members:members.map(z=>({id:z.id,name:z.name})),order,projected,alternatives,action:p.endDate?'Выводится из ассортимента — без дозаказа':replace?'Проверить и рассмотреть замену':order>0?'Дозаказать':norm>0?'Оставить':'Задать норму выкладки',blocked:risk.blocked,warning:risk.warning,discontinued:!!p.endDate};
    });
  }
  function quality(products,day){
    const seen=new Set(),issues=[];
    products.forEach((p,index)=>{const add=(message,severity='error')=>issues.push({code:p.code||'Строка '+(index+1),p,message,severity});
      if(!p.code)add('Отсутствует артикул');else if(seen.has(p.code))add('Повторный артикул');seen.add(p.code);
      if(!p.name)add('Отсутствует название','warning');
      if(p.stock===null)add('Нет корректного остатка');else if(p.stock<0)add('Отрицательный остаток');
      if(!(p.cost>0))add('Нет положительной себестоимости');
      if(!(p.price>0))add('Нет корректной цены магазина');if(!(p.tn>0))add('Нет корректной цены ТН');
      (p.invalid||[]).forEach(message=>add(message));
      if(p.importDate&&B.daysBetween(day,p.importDate)>0)add('Дата ввоза позже даты отчёта');
      if(p.repriceDate&&B.daysBetween(day,p.repriceDate)>0)add('Дата переоценки позже даты отчёта','warning');
      if(p.cover!==null&&p.cover<0)add('Отрицательный запас в днях');
      if(p.sold!==null&&p.sold<0)add('Возвратная строка — учитывайте отдельно','warning');
    });return issues;
  }
  function taskResult(task,snapshot){
    if(!snapshot||snapshot.store!==task.store||snapshot.date<=task.snapshotDate)return {label:'Нужен более поздний отчёт',verified:false};
    const p=snapshot.products.find(x=>x.code===task.code);
    if(!p)return {label:'Артикул отсутствует в новом отчёте — требуется проверка',verified:false};
    let verified=false;
    if(task.kind==='price')return {label:'Контроль цены подтверждается вручную; отклонение от ТН допустимо',verified:false,stockDelta:p.stock-task.baseline.stock,soldDelta:p.sold-task.baseline.sold,priceDelta:p.price-task.baseline.price};
    if(task.kind==='expiry')verified=p.stock===0;
    if(task.kind==='supply')verified=p.stock>0&&(p.cover>0||p.sold>0)&&shortage(p,task.arrival??7).units===0;
    const baseline=task.baseline||{};
    return {label:verified?'Признак проблемы устранён по отчёту':task.kind==='shelf'?'Проверка полки подтверждается сотрудником':'Проблема ещё требует проверки',verified,stockDelta:p.stock!==null&&baseline.stock!==null?p.stock-baseline.stock:null,soldDelta:p.sold!==null&&baseline.sold!==null?p.sold-baseline.sold:null,priceDelta:p.price!==null&&baseline.price!==null?p.price-baseline.price:null};
  }
  function validateSnapshot(s){
    if(!s||typeof s.store!=='string'||!s.store||iso(s.date)!==s.date||!Array.isArray(s.products))throw Error('Некорректный снимок');
    const codes=new Set();s.products.forEach(p=>{if(!p||typeof p.code!=='string'||!p.code||codes.has(p.code))throw Error('Некорректные или повторные артикулы снимка');codes.add(p.code);if(p.store&&p.store!==s.store)throw Error('Товар другого магазина в снимке');Object.keys(numericFields).forEach(k=>{if(p[k]!==null&&typeof p[k]!=='number')throw Error('Некорректное число в снимке');if(typeof p[k]==='number'&&!Number.isFinite(p[k]))throw Error('Некорректное число в снимке');});['name','group','group2','group3','store','cube'].forEach(k=>{if(typeof p[k]!=='string')throw Error('Некорректное поле снимка');});['importDate','repriceDate','endDate'].forEach(k=>{if(p[k]!==null&&iso(p[k])!==p[k])throw Error('Некорректная дата товара');});});return s;
  }
  const api={text,number,iso,product,cube,rate,dead,slow,profit,price,priceMatches,shortage,priorities,groups,compare,priceHistory,planZone,quality,taskResult,validateSnapshot};
  root.DirectorRules=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
