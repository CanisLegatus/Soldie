const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { indexedDB } = require('fake-indexeddb');
const source = fs.readFileSync(require.resolve('../galamart-analyst/js/sku3.js'),'utf8');
function store() {
  const data = new Map();
  const context = { window:{indexedDB}, indexedDB, localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}, console:{error(){},warn(){}}, Map, Promise };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  var S3STORE_DB_NAME'), source.indexOf('  var s3store =')), context);
  return { create:()=>vm.runInContext('new S3Store()',context), data, context };
}
test('fallback retains full sales across a new store instance', async () => {
  const env=store(), a=env.create(); a.chunks.set('2026-10-25',[{article:'A',qty:2}]);
  assert.equal(await a.save({settings:{name:'test'}},['2026-10-25'],[]),true);
  const b=env.create(); b.loadFromFallback();
  assert.equal(b.getState().sales.length,1);
  assert.equal(b.getState().sales[0].qty,2);
});
test('IndexedDB writes metadata and changed days atomically; queued snapshots are stable', async () => {
  const env=store(), a=env.create(); await a.init();
  const day='2026-10-25'; const state={settings:{name:'first'}};
  a.chunks.set(day,[{article:'A',qty:2}]); const first=a.save(state,[day],[]);
  state.settings.name='second'; a.chunks.set(day,[{article:'A',qty:3}]);
  const second=a.save(state,[day],[]); await first; await second;
  const b=env.create(); await b.init(); assert.equal(b.getState().settings.name,'second'); assert.equal(b.getState().sales[0].qty,3);
  a.db.close(); b.db.close();
});
test('failed storage write returns failure rather than success', async () => {
  const env=store(), a=env.create();
  env.context.localStorage.setItem=()=>{ throw new Error('disk unavailable'); };
  assert.equal(await a.save({settings:{}},[],[]),false);
});
test('transaction failure rolls back metadata and sales together', async () => {
  const env=store(), a=env.create(); await a.init();
  a.chunks.set('2026-10-25',[{article:'A',qty:5}]);await a.save({settings:{name:'safe'}},['2026-10-25'],[]);
  const original=a.db.transaction.bind(a.db);
  a.db.transaction=(...args)=>{
    const tx=original(...args), objectStore=tx.objectStore.bind(tx);
    tx.objectStore=(...names)=>{const os=objectStore(...names),put=os.put.bind(os);let count=0;os.put=(...params)=>{if(++count===2)throw new Error('simulated write failure');return put(...params)};return os};
    return tx;
  };
  a.chunks.set('2026-10-25',[{article:'A',qty:99}]);
  assert.equal(await a.save({settings:{name:'unsafe'}},['2026-10-25'],[]),false);
  const b=env.create();await b.init();assert.equal(b.getState().settings.name,'safe');assert.equal(b.getState().sales[0].qty,5);
  a.db.close();b.db.close();
});
test('fallback history migrates when IndexedDB becomes available', async () => {
  const env=store(), a=env.create();
  a.chunks.set('2026-10-26',[{article:'B',qty:8}]);
  await a.save({settings:{name:'fallback'},lastSaved:'2099-10-26T10:00:00Z'},['2026-10-26'],[]);
  const b=env.create();await b.init();assert.equal(b.getState().settings.name,'fallback');assert.equal(b.getState().sales[0].qty,8);b.db.close();
});
