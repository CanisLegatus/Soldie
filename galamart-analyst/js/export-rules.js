/* Common export contract. Prices are proposals explicitly entered/applied by the user. */
(function(root){
  'use strict';
  const prices=new Map();
  function resolve(p,edits=prices){const raw=edits.has(p.code)?edits.get(p.code):p.price;const price=Number(raw);if(raw===''||raw===null||!Number.isFinite(price)||price<1)throw Error('Некорректная цена: '+p.code);return price;}
  function changed(p,edits=prices){return edits.has(p.code)&&Math.abs(resolve(p,edits)-p.price)>=0.0001;}
  function rows(products,kind='full',edits=prices){
    if(kind==='codes')return [['Артикул'],...products.map(p=>[p.code])];
    if(kind==='prices'||kind==='changed'){
      const list=kind==='changed'?products.filter(p=>changed(p,edits)):products;
      if(!list.length)throw Error('Нет изменённых цен для экспорта');
      return [['Код','Цена'],...list.map(p=>[p.code,resolve(p,edits)])];
    }
    return [['Артикул','Товар','Группа 1','Группа 2','Группа 3','КУБ','Остаток','Продано за 28 дней','Себестоимость','Цена магазина','Цена ТН','Цена пользователя','Изменено пользователем'],...products.map(p=>[p.code,p.name,p.group,p.group2,p.group3,p.cube,p.stock,p.sold,p.cost,p.price,p.tn,edits.has(p.code)?resolve(p,edits):p.price,edits.has(p.code)&&changed(p,edits)?'Да':'Нет'])];
  }
  function rawRows(data,headers,normalize,kind='full',edits=prices){
    if(kind!=='full')return rows(data.map(normalize),kind,edits);
    return [[...headers,'Цена пользователя','Изменено пользователем'],...data.map(r=>{const p=normalize(r);return [...headers.map(h=>r[h]??''),edits.has(p.code)?resolve(p,edits):p.price,edits.has(p.code)&&changed(p,edits)?'Да':'Нет'];})];
  }
  function edit(code,value,original){if(value!==''&&Number(value)===Number(original))prices.delete(code);else prices.set(code,value);}
  const api={prices,resolve,changed,rows,rawRows,edit};root.SuadelaExport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
