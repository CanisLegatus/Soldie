/* Separate database: never modifies the existing sales, zones or settings stores. */
(function(root){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const key=s=>JSON.stringify([s.store,s.date]);
  class DirectorStore {
    constructor(options={}){this.idb=options.indexedDB===undefined?root.indexedDB:options.indexedDB;this.storage=options.storage;this.db=null;this.fallback=null;this.queue=Promise.resolve();this.error=null;}
    async init(){
      try{if(!this.storage)this.storage=root.localStorage;}catch(e){this.storage=null;}
      if(this.idb){
        try{this.db=await new Promise((resolve,reject)=>{const r=this.idb.open('soldie_director_v1',1);r.onupgradeneeded=()=>{for(const name of ['snapshots','meta','tasks'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('История открыта в другой вкладке; закройте её и повторите'));});}
        catch(e){if(!this.storage)throw e;}
      }
      if(!this.db){if(!this.storage)throw Error('Локальное хранилище недоступно');const raw=this.storage.getItem('soldie_director_fallback_v1');this.fallback=raw?JSON.parse(raw):{snapshots:[],tasks:[]};if(!Array.isArray(this.fallback.snapshots)||!Array.isArray(this.fallback.tasks))throw Error('Повреждена история директора');}
      if(this.db&&this.storage){
        let raw;try{raw=this.storage.getItem('soldie_director_fallback_v1');}catch(e){return this;}
        if(raw){
          let fallback;try{fallback=JSON.parse(raw);if(!Array.isArray(fallback.snapshots)||!Array.isArray(fallback.tasks))throw Error('Неверная структура');}catch(e){this.warning='Резервная история повреждена. Основная база доступна; сохраните её JSON.';return this;}
          const metas=new Map((await this.list()).map(m=>[m.id,m])),currentTasks=new Map((await this.tasks()||[]).map(t=>[t.id,t]));
          const snapshots=fallback.snapshots.filter(s=>!metas.has(key(s))||(s.savedAt||'')>(metas.get(key(s)).savedAt||''));
          const time=t=>t.updatedAt||t.completedAt||t.createdAt||'';
          const tasks=fallback.tasks.filter(t=>!currentTasks.has(t.id)||time(t)>time(currentTasks.get(t.id)));
          if(snapshots.length||tasks.length)await this.write(snapshots,tasks);
          if(this.storage.removeItem)this.storage.removeItem('soldie_director_fallback_v1');else this.storage.setItem('soldie_director_fallback_v1',JSON.stringify({snapshots:[],tasks:[]}));
        }
      }
      return this;
    }
    meta(snapshot){return {id:key(snapshot),store:snapshot.store,date:snapshot.date,count:snapshot.products.length,file:snapshot.file||'',savedAt:snapshot.savedAt||new Date().toISOString()};}
    read(name,id){if(!this.db){const list=name==='meta'?this.fallback.snapshots.map(s=>this.meta(s)):this.fallback[name];return Promise.resolve(copy(id===undefined?list:list.find(x=>(x.id||key(x))===id)||null));}return new Promise((resolve,reject)=>{const tx=this.db.transaction(name),r=id===undefined?tx.objectStore(name).getAll():tx.objectStore(name).get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
    write(snapshots=[],tasks=[],remove=[]){
      const savedSnapshots=copy(snapshots).map(s=>({...s,id:key(s)})),savedTasks=copy(tasks);
      const operation=async()=>{
        if(this.db)await new Promise((resolve,reject)=>{const tx=this.db.transaction(['snapshots','meta','tasks'],'readwrite');try{savedSnapshots.forEach(s=>{tx.objectStore('snapshots').put(s);tx.objectStore('meta').put(this.meta(s));});savedTasks.forEach(t=>tx.objectStore('tasks').put(t));remove.forEach(id=>{tx.objectStore('snapshots').delete(id);tx.objectStore('meta').delete(id);});}catch(e){tx.abort();reject(e);return;}tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('Запись прервана'));});
        else{const next=copy(this.fallback);savedSnapshots.forEach(s=>{next.snapshots=next.snapshots.filter(x=>key(x)!==s.id);next.snapshots.push(s);});savedTasks.forEach(t=>{next.tasks=next.tasks.filter(x=>x.id!==t.id);next.tasks.push(t);});next.snapshots=next.snapshots.filter(x=>!remove.includes(key(x)));this.storage.setItem('soldie_director_fallback_v1',JSON.stringify(next));this.fallback=next;}
      };
      this.queue=this.queue.then(operation,operation);return this.queue;
    }
    async list(){return (await this.read('meta')||[]).sort((a,b)=>b.date.localeCompare(a.date)||a.store.localeCompare(b.store));}
    get(id){return this.read('snapshots',id);}
    tasks(){return this.read('tasks');}
    saveSnapshot(s){return this.write([s]);}
    saveTasks(tasks){return this.write([],tasks);}
    remove(id){return this.write([],[],[id]);}
    async restore(snapshots,tasks){
      const old=this.fallback;
      if(!this.db&&(!old||!Array.isArray(old.snapshots)||!Array.isArray(old.tasks)))this.fallback={snapshots:[],tasks:[]};
      try{await this.write(snapshots,tasks);if(this.db&&this.storage){try{if(this.storage.removeItem)this.storage.removeItem('soldie_director_fallback_v1');else this.storage.setItem('soldie_director_fallback_v1',JSON.stringify({snapshots:[],tasks:[]}));}catch(e){this.warning='Не удалось очистить резервный ключ';}}}catch(e){this.fallback=old;throw e;}
    }
    async backup(){await this.queue.catch(()=>{});return {app:'soldie-director',version:1,exportedAt:new Date().toISOString(),snapshots:await this.read('snapshots'),tasks:await this.tasks()};}
  }
  root.DirectorStore=DirectorStore;if(typeof module!=='undefined'&&module.exports)module.exports=DirectorStore;
})(typeof window!=='undefined'?window:globalThis);
