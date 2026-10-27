const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../galamart-analyst/js/business.js');
test('Russian and ISO dates are strict, including leap days', () => {
  assert.equal(R.date('05.10.2026').getMonth(), 9);
  assert.equal(R.date('31.02.2026'), null);
  assert.equal(R.date('2026-02-29'), null);
  assert.equal(R.date('2024-02-29').getDate(), 29);
  assert.equal(R.daysBetween('2026-10-24', '2026-10-25'), 1);
});
test('price endings never exceed target and preserve 1 ruble minimum', () => {
  for (const [input, expected] of [[200,199.9],[1000,999.9],[1300,1299],[9.9,9.9],[5,4.9],[3,2.9],[1.5,1],[0,1]]) assert.equal(R.roundedPrice(input), expected);
});
test('slow stock is estimated from 28 days and excludes empty and return-only rows', () => {
  assert.equal(R.slow(80,20), true);
  assert.equal(R.slow(70,30), false);
  assert.equal(R.slow(0,0), false);
  assert.equal(R.slow(10,0), true);
  assert.equal(R.slow(10,-1), false);
});
test('klizma deadline rolls after 15th and final markdown is last Tue/Fri', () => {
  assert.equal(R.date(R.klizmaDeadline('2026-10-16')).getMonth(), 10);
  assert.equal(R.klizmaDeadline('2026-10-15').getDate(), 15);
  assert.equal(R.finalMarkdownDay('2026-10-15','kлизма').getDate(), 13);
  assert.equal(R.finalMarkdownDay('2026-10-15','sellto').getDate(), 15);
});
test('markdown uses per-item expiry, preserves healthy prices and last-day rule', () => {
  assert.equal(R.markdown(100,5,'2026-10-30','sellto','2026-10-25').price,100);
  assert.equal(R.markdown(100,5,'2026-10-25','sellto','2026-10-25').price,1);
  assert.equal(R.markdown(100,5,'2026-10-24','sellto','2026-10-25').expired,true);
  assert.equal(R.markdown(100,5,'2026-10-15','kлизма','2026-10-13').price,1);
  const deferred = R.markdown(100,9999,'2026-10-15','kлизма','2026-10-12');
  assert.equal(deferred.deferred,true);
  assert.equal(deferred.actionDate.getDate(),13);
  assert.equal(deferred.price,1);
  assert.ok(R.markdown(100,40,'2026-11-15','sellto','2026-10-25').price < 100);
});
test('minimum payout is applied per seller and SKU', () => {
  assert.equal(R.payout(400,500)+R.payout(600,500),600);
  assert.equal(R.payout(500,500),500);
});
test('15th remains current deadline at any hour, and missed klizma schedule is blocked', () => {
  assert.equal(R.klizmaDeadline(new Date(2026,9,15,12)).getMonth(),9);
  const missed=R.markdown(100,100,'2026-10-15','kлизма','2026-10-14');
  assert.equal(missed.blocked,true);assert.equal(missed.price,100);
});
test('fund distribution preserves cents without negative remainder for many sellers', () => {
  const vm=require('node:vm'), fs=require('node:fs');
  const source=fs.readFileSync(require.resolve('../galamart-analyst/js/sku3.js'),'utf8');
  const context={};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function distributeFund('),source.indexOf('function computeMetrics()')),context);
  const entries=Array.from({length:100},()=>({units:1}));
  context.distributeFund(entries,'fund',0.5,100,'units');
  assert.ok(entries.every(entry=>entry.fund>=0));
  assert.equal(Math.round(entries.reduce((sum,entry)=>sum+entry.fund,0)*100),50);
});
