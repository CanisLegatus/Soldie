const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../galamart-analyst/js/director-rules.js');
function p(overrides={}){return R.product({'код':'A','товар':'Товар','группа 1':'Группа','группа 2':'Подгруппа','магазин':'Магазин','себ, руб.':10,'цена маг, руб.':20,'цена тн, руб':25,'склад кол':80,'склад сумма, руб.':800,'продано (шт)':20,'то, руб':400,'то сс, руб':200,'остатки, дней':112,'дата ввоза':'01.08.2026',...overrides});}
function snapshot(date,products,store='Магазин'){return {date,products,store,savedAt:date+'T10:00:00Z'};}
test('price control distinguishes direction, equality, missing values and threshold OR/AND',()=>{
 const item=p(),gap=R.price(item);assert.equal(gap.kind,'below');assert.equal(gap.delta,-5);assert.equal(gap.percent,-20);assert.equal(gap.value,-400);
 assert.equal(R.priceMatches(item,'below',6,10,'any'),true);assert.equal(R.priceMatches(item,'below',6,10,'both'),false);
 assert.equal(R.price(p({'цена маг, руб.':30})).kind,'above');assert.equal(R.price(p({'цена маг, руб.':25})).kind,'equal');assert.equal(R.price(p({'цена тн, руб':0})).kind,'missing');
});
test('stock groups do not double-count dead and slow money',()=>{const gs=R.groups([p({'продано (шт)':0}),p({'код':'B'})],'2026-10-25');assert.equal(gs[0].dead,800);assert.equal(gs[0].slow,1600);assert.equal(gs[0].problem,1600);assert.equal(gs[0].efficiency,25);});
test('shortage uses real daily pace; ZO blocks supply but risk remains visible',()=>{
 const r=R.shortage(p({'склад кол':2,'остатки, дней':1,'кубы':'ЗО вр'}),7);assert.equal(r.units,12);assert.equal(r.gpRisk,120);assert.equal(r.blocked,true);
 assert.equal(R.shortage(p({'остатки, дней':9999}),7).units,0);
});
test('snapshots compare additions, removals, price and rolling sales without crossing stores',()=>{
 const a=snapshot('2026-10-24',[p(),p({'код':'B'})]),b=snapshot('2026-10-25',[p({'цена маг, руб.':25,'склад кол':70,'продано (шт)':25}),p({'код':'C'})]);const result=R.compare(a,b);assert.equal(result.find(x=>x.code==='A').stockDelta,-10);assert.equal(result.find(x=>x.code==='A').soldDelta,5);assert.equal(result.find(x=>x.code==='B').kind,'removed');assert.equal(result.find(x=>x.code==='C').kind,'added');assert.throws(()=>R.compare(a,{...b,store:'Другой'}));assert.throws(()=>R.compare(b,a));assert.equal(R.priceHistory([b,a]).length,1);
});
test('zone plan proposes only compatible available non-ZO replacements and keeps norm',()=>{
 const a=p({'продано (шт)':0,'остатки, дней':9999}),b=p({'код':'B','склад кол':1,'продано (шт)':100}),c=p({'код':'C','склад кол':1,'продано (шт)':100,'кубы':'ЗО'});
 const result=R.planZone([a,b,c],{codes:['A','A','B'],refill:{A:5,B:10}},'2026-10-25',7);assert.equal(result.length,2);assert.equal(result[0].alternatives.length,0);assert.equal(result[1].order>0,true);
 const replacement=R.planZone([a,b,c],{codes:['A'],refill:{}},'2026-10-25',7)[0];assert.deepEqual(replacement.alternatives.map(x=>x.code),['B']);
});
test('quality reports duplicates, bad values and future import dates but not future expiry',()=>{
 const issues=R.quality([p({'себ, руб.':'oops','склад кол':-1,'дата ввоза':'30.10.2026','дата окончания продаж':'31.12.2026'}),p()],'2026-10-25');assert.ok(issues.some(x=>x.message==='Повторный артикул'));assert.ok(issues.some(x=>x.message==='Отрицательный остаток'));assert.ok(issues.some(x=>x.message==='Дата ввоза позже даты отчёта'));assert.equal(issues.some(x=>/окончания/.test(x.message)),false);
});
test('task evidence requires later report and never infers shelf verification',()=>{
 const task={code:'A',store:'Магазин',snapshotDate:'2026-10-24',kind:'price',baseline:{stock:80,sold:20,price:20}};
 assert.equal(R.taskResult(task,snapshot('2026-10-24',[p()])).verified,false);assert.equal(R.taskResult(task,snapshot('2026-10-25',[p({'цена маг, руб.':25})])).verified,false);
 assert.equal(R.taskResult({...task,kind:'shelf'},snapshot('2026-10-25',[p()])).verified,false);
});
test('snapshot schema rejects duplicates and nonnumeric fields',()=>{assert.doesNotThrow(()=>R.validateSnapshot(snapshot('2026-10-25',[p()])));assert.throws(()=>R.validateSnapshot(snapshot('2026-10-25',[p(),p()])));assert.throws(()=>R.validateSnapshot(snapshot('2026-10-25',[{...p(),price:'wrong'}])));});
test('slow stock excludes new products until day 28',()=>{assert.equal(R.slow(p({'дата ввоза':'28.09.2026'}),'2026-10-25'),false);assert.equal(R.slow(p({'дата ввоза':'27.09.2026'}),'2026-10-25'),true);assert.equal(R.slow(p({'дата ввоза':''}),'2026-10-25'),false);});
test('valid TN differences do not create problems',()=>{assert.deepEqual(R.priorities([p({'продано (шт)':100})],'2026-10-25'),[]);});
test('zone supply sums all norms and never orders withdrawn products',()=>{const item=p({'склад кол':20,'продано (шт)':28,'остатки, дней':20});const zones=[{id:'a',codes:['A'],refill:{A:10}},{id:'b',codes:['A'],refill:{A:15}}];assert.equal(R.planZone([item],zones[0],'2026-10-25',0,{zones})[0].order,12);assert.equal(R.planZone([{...item,endDate:'2026-12-31'}],zones[0],'2026-10-25',0,{zones})[0].order,0);});
