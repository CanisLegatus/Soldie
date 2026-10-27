/* ══════════════════════════════════════════════════════════════
   sku3.js — раздел «3SKU» (полная интеграция проекта suadela)
   Мотивация и дашборд продаж по 3 SKU: обзор, персонал, day-day.
   Логика перенесена из suadela/suadela.html без изменений поведения:
     • код изолирован в IIFE (нет конфликтов имён с core/app/vision);
     • стили ограничены селектором #sku3Card (CSS-переменные наследуются);
     • разметка инжектируется один раз при первом открытии вкладки;
     • XLSX и Chart.js используются общие (из lib/), CDN не нужен.
   Точки входа: window.sku3RenderMarkup(), window.sku3Init().
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     S3Store — слой хранения «горячих» данных раздела 3SKU в IndexedDB.
     Проблематика: весь стейт (в первую очередь state.sales — записи продаж
     за каждый загруженный день) сохранялся одним JSON-блоком в localStorage
     (~5 МБ квота WebView), из-за чего при ежедневных импортах данных
     переставало помещаться.

     Схема решения (архитектура приложения и sku3Api не меняются):
       • meta    — маленький снимок состояния: settings, checks, imports,
                   version, lastSaved + salesIndex (список дат продаж);
       • chunk:<ISO дата> — массив записей продаж одного дня (чанк);
       • backup_legacy_v1 — оригинальный blob старого ключа localStorage
                   (сохраняется до подтверждения миграции).
     Импорт/удаление дня = одна транзакция с чанками; всё остальное читается
     из компактного meta. При недоступности IndexedDB — автоматический откат
     на localStorage (прежнее поведение, только для компактных данных).
     ══════════════════════════════════════════════════════════════ */
  var S3STORE_DB_NAME = 'sku3_motivator_idb';
  var S3STORE_DB_VERSION = 1;
  var S3STORE_META_KEY = 'meta';
  var S3STORE_CHUNK_PREFIX = 'chunk:';
  var S3STORE_BACKUP_KEY = 'backup_legacy_v1';

  function s3idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB недоступен')); return; }
      var req;
      try {
        req = indexedDB.open(S3STORE_DB_NAME, S3STORE_DB_VERSION);
      } catch (e) { reject(e); return; }
      req.onupgradeneeded = function (ev) {
        var oldVersion = ev.oldVersion || 0;
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        } else if (oldVersion < 1) {
          try { db.deleteObjectStore('kv'); } catch (e2) {}
          db.createObjectStore('kv');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Ошибка открытия IndexedDB')); };
      req.onblocked = function () { reject(new Error('IndexedDB заблокирован другим вкладкой')); };
    });
  }

  function s3idbGet(db, key) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('kv', 'readonly');
      var rq = tx.objectStore('kv').get(key);
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
  }

  function s3idbGetAllKeys(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('kv', 'readonly');
      var rq = tx.objectStore('kv').getAllKeys();
      rq.onsuccess = function () { resolve(rq.result || []); };
      rq.onerror = function () { reject(rq.error); };
    });
  }

  function s3idbPut(db, key, value) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('Транзакция прервана')); };
    });
  }

  function s3idbDelete(db, keys) {
    return new Promise(function (resolve, reject) {
      if (!keys.length) { resolve(); return; }
      var tx = db.transaction('kv', 'readwrite');
      var store = tx.objectStore('kv');
      keys.forEach(function (k) { try { store.delete(k); } catch (e) {} });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('Транзакция прервана')); };
    });
  }

  function s3dateKey(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso) : '__nodate__'; }
  function s3chunkKey(iso) { return S3STORE_CHUNK_PREFIX + iso; }

  function S3Store() {
    this.db = null;              // соединение с IndexedDB (null => fallback на localStorage)
    this.useIdb = false;
    this.fallbackKey = 'sku3_motivator_v1_fallback'; // компактный стейт, если IDB недоступен
    this.meta = null;            // кэш meta-объекта
    this.chunks = new Map();     // ISO дата -> массив записей продаж дня
    this.pending = Promise.resolve(); // сериализация всех операций записи
    this.writeErrorShown = false;
    this.legacyBackupPresent = false; // есть ли backup старого состояния в IDB
  }

  S3Store.prototype.init = function () {
    var self = this;
    return s3idbOpen().then(function (db) {
      self.db = db;
      self.useIdb = true;
      return self.loadFromDb().then(function () {
        var raw;
        try { raw = localStorage.getItem(self.fallbackKey); } catch (e) { return; }
        if (!raw) return;
        var fallback;
        try { fallback = JSON.parse(raw); } catch (e) { throw new Error('Повреждено резервное хранилище. Восстановите JSON.'); }
        if (!Array.isArray(fallback.sales)) return;
        if (self.meta && (!fallback.lastSaved || fallback.lastSaved <= (self.meta.lastSaved || ''))) return;
        var previousDays = Array.from(self.chunks.keys());
        self.replaceAllSales(fallback.sales);
        return self.save(fallback, Array.from(self.chunks.keys()), previousDays.filter(function(day){return !self.chunks.has(day);})).then(function(saved){
          if (!saved) throw new Error('Не удалось перенести резервную историю в IndexedDB');
        });
      });
    }, function (err) {
      console.warn('[sku3] IndexedDB недоступен, возврат к localStorage:', err && err.message);
      self.useIdb = false;
      return self.loadFromFallback();
    });
  };

  S3Store.prototype.loadFromDb = function () {
    var self = this;
    return s3idbGet(this.db, S3STORE_META_KEY).then(function (meta) {
      self.meta = meta && typeof meta === 'object' ? meta : null;
      if (!self.meta || !Array.isArray(self.meta.salesIndex)) {
        self.chunks.clear();
        return;
      }
      self.chunks.clear();
      var dates = self.meta.salesIndex.filter(function (d) { return typeof d === 'string'; });
      return Promise.all(dates.map(function (d) {
        return s3idbGet(self.db, s3chunkKey(d)).then(function (v) {
          if (!Array.isArray(v)) throw new Error('Не найден день истории: ' + d);
          self.chunks.set(d, v);
        });
      }));
    });
  };

  S3Store.prototype.loadFromFallback = function () {
    try {
      var raw = localStorage.getItem(this.fallbackKey);
      this.meta = raw ? JSON.parse(raw) : null;
    } catch (e) { throw new Error('Не удалось прочитать резервное хранилище: ' + e.message); }
    this.chunks.clear();
    if (this.meta && Array.isArray(this.meta.salesIndex)) {
      if (Array.isArray(this.meta.sales)) this.replaceAllSales(this.meta.sales);
      else if (this.meta.salesIndex.length) throw new Error('В старом резервном хранилище нет продаж. Восстановите историю из JSON или отчётов.');
    }
  };

  /* Полная сборка state из meta + чанков (для renderAll / computeMetrics) */
  S3Store.prototype.getState = function () {
    var st = this.meta;
    if (!st) return null;
    var sales = [];
    this.chunks.forEach(function (arr) {
      if (Array.isArray(arr)) { for (var i = 0; i < arr.length; i++) sales.push(arr[i]); }
    });
    return Object.assign({}, st, { sales: sales });
  };

  /* Сохранение: meta всегда; чанки — только реально изменённые/удалённые.
     Операции записи сериализуются в одной очереди (pending). */
  S3Store.prototype.save = function (state, dirtyDates, removedDates) {
    var self = this;
    // Snapshot now: queued writes must not observe later edits to state/chunks.
    var meta = JSON.parse(JSON.stringify(Object.assign({}, state, { sales: undefined, salesIndex: Array.from(this.chunks.keys()).sort() })));
    var chunks = new Map();
    this.chunks.forEach(function (rows, day) {
      if (!self.useIdb || (dirtyDates || []).includes(day)) chunks.set(day, JSON.parse(JSON.stringify(rows)));
    });
    var op = function () {
      if (self.useIdb && self.db) {
        return new Promise(function (resolve, reject) {
          var tx = self.db.transaction('kv', 'readwrite'), store = tx.objectStore('kv');
          try {
          store.put(meta, S3STORE_META_KEY);
          (removedDates || []).forEach(function (day) { store.delete(s3chunkKey(day)); });
          (dirtyDates || []).forEach(function (day) { if (chunks.has(day)) store.put(chunks.get(day), s3chunkKey(day)); });
          } catch (error) { tx.abort(); reject(error); return; }
          tx.oncomplete = function () { self.meta = meta; resolve(true); };
          tx.onerror = tx.onabort = function () { reject(tx.error || new Error('Транзакция прервана')); };
        });
      }
      var sales = []; chunks.forEach(function (rows) { rows.forEach(function(row) { sales.push(row); }); });
      localStorage.setItem(self.fallbackKey, JSON.stringify(Object.assign({}, meta, { sales: sales })));
      self.meta = meta;
      return true;
    };

    this.pending = this.pending.then(op, op);
    return this.pending.catch(function (e) {
      console.error('[sku3] Не удалось сохранить состояние:', e);
      if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
        if (!self.writeErrorShown) {
          self.writeErrorShown = true;
          if (typeof showToast === 'function') showToast('Хранилище переполнено — часть данных могла не сохраниться. Скачайте резервную копию JSON.', 'error');
        }
      } else if (typeof showToast === 'function') {
        showToast('Ошибка сохранения данных: ' + (e && e.message ? e.message : e), 'error');
      }
      return false;
    });
  };

  /* Установка всего набора чанков продаж разом (миграция, загрузка JSON, очистка) */
  S3Store.prototype.replaceAllSales = function (records) {
    this.chunks.clear();
    (records || []).forEach(function (r) {
      if (!r) return;
      var k = s3dateKey(r.date);
      if (!this.chunks.has(k)) this.chunks.set(k, []);
      this.chunks.get(k).push(r);
    }, this);
  };

  S3Store.prototype.replaceDay = function (date, records) {
    this.chunks.set(s3dateKey(date), Array.isArray(records) ? records.slice() : []);
  };

  S3Store.prototype.removeDays = function (dates) {
    var list = Array.isArray(dates) ? dates : [dates];
    list.forEach(function (d) { this.chunks.delete(s3dateKey(d)); }, this);
  };

  S3Store.prototype.clearAllSales = function () { this.chunks.clear(); };

  S3Store.prototype.getLegacyBackup = function () {
    var self = this;
    if (!this.useIdb || !this.db) return Promise.resolve(null);
    return s3idbGet(this.db, S3STORE_BACKUP_KEY).then(function (b) {
      self.legacyBackupPresent = !!(b && b.data);
      return b || null;
    }).catch(function () { return null; });
  };

  S3Store.prototype.saveLegacyBackup = function (blob) {
    var self = this;
    if (!this.useIdb || !this.db) return Promise.resolve();
    return s3idbPut(this.db, S3STORE_BACKUP_KEY, { at: new Date().toISOString(), data: blob }).then(function () {
      self.legacyBackupPresent = true;
    }).catch(function (e) {
      console.warn('[sku3] Не удалось сохранить backup старого состояния:', e);
    });
  };

  S3Store.prototype.dropLegacyBackup = function () {
    var self = this;
    if (!this.useIdb || !this.db) return Promise.resolve();
    return s3idbDelete(this.db, [S3STORE_BACKUP_KEY]).then(function () {
      self.legacyBackupPresent = false;
    }).catch(function () {});
  };

  var s3store = new S3Store();

  /* Одноразовый перенос данных из старого localStorage-ключа в IndexedDB.
     Оригинал blob сохраняется как backup и удаляется только после
     подтверждения пользователя. */
  function migrateFromLegacy(store) {
    var LEGACY_KEY = 'sku3_motivator_v1';
    var pendingRaw = null;
    try { pendingRaw = localStorage.getItem(LEGACY_KEY); } catch (e) { pendingRaw = null; }

    var hasNew = !!store.meta;

    if (!pendingRaw) {
      if (hasNew) return Promise.resolve({ loaded: true });
      return Promise.resolve({ loaded: false }); // чистая установка
    }

    var legacyState = null;
    try { legacyState = JSON.parse(pendingRaw); } catch (e) { legacyState = null; }

    // IDB уже содержит данные (возможны изменения после миграции) — старый ключ ждёт подтверждения удаления
    if (hasNew) {
      return store.saveLegacyBackup(pendingRaw).then(function () {
        return { loaded: true, awaitingConfirm: true };
      });
    }

    if (!legacyState || typeof legacyState !== 'object') {
      // битый blob: сохраняем как backup и стартуем с чистого состояния
      return store.saveLegacyBackup(pendingRaw).then(function () {
        return { loaded: false, corrupted: true };
      });
    }

    var migrated = migrateState(legacyState); // defaults and schema version; preserve history
    store.replaceAllSales(migrated.sales || []);
    return store.saveLegacyBackup(pendingRaw)
      .then(function () { return store.save(migrated, Array.from(store.chunks.keys()), []); })
      .then(function (saved) { if (!saved) throw new Error('Миграция не сохранена'); return { loaded: true, freshMigration: true, hadData: !!(migrated.sales && migrated.sales.length) }; })
      .catch(function (e) {
        console.error('[sku3] Миграция в IndexedDB не удалась:', e);
        store.meta = migrated;
        return { loaded: true, migrationFailed: true };
      });
  }

  // ── Стили suadela (scope: #sku3Card) ──
  var sku3Style = document.createElement('style');
  sku3Style.id = 'sku3Styles';
  sku3Style.textContent = `
#sku3Card{
  --bg:#f5f7fb;
  --card:#ffffff;
  --text:#0f172a;
  --muted:#64748b;
  --border:#e2e8f0;
  --primary:#4f46e5;
  --primary-2:#7c3aed;
  --accent:#06b6d4;
  --success:#10b981;
  --warning:#f59e0b;
  --danger:#ef4444;
  --radius:20px;
  --shadow:0 12px 32px rgba(15,23,42,.08);
}
#sku3Card *{box-sizing:border-box}
#sku3Card [hidden]{display:none !important}
#sku3Card h1, #sku3Card h2, #sku3Card h3, #sku3Card h4{margin:0}
#sku3Card button, #sku3Card input, #sku3Card select, #sku3Card textarea{font:inherit}
#sku3Card .container{max-width:1440px;margin:0 auto;padding:0 24px}
#sku3Card .header{
  position:sticky;top:0;z-index:60;
  background:rgba(255,255,255,.82);
  backdrop-filter:blur(14px);
  border-bottom:1px solid var(--border);
}
#sku3Card .header-inner{
  max-width:1440px;margin:auto;padding:14px 24px;
  display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;
}
#sku3Card .brand{display:flex;align-items:center;gap:14px;min-width:260px}
#sku3Card .logo{
  width:48px;height:48px;border-radius:16px;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--primary),var(--primary-2) 60%,var(--accent));
  color:#fff;font-weight:800;font-size:14px;letter-spacing:.02em;box-shadow:0 10px 22px rgba(79,70,229,.24);
}
#sku3Card .brand h1{font-size:20px;font-weight:800;letter-spacing:-.02em}
#sku3Card .brand .muted{font-size:13px;color:var(--muted);margin-top:2px}
#sku3Card .header-stats{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#sku3Card .mini-stat{
  background:#fff;border:1px solid var(--border);border-radius:14px;padding:8px 12px;min-width:104px;
  box-shadow:0 6px 18px rgba(15,23,42,.04)
}
#sku3Card .mini-stat span{display:block;font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.04em}
#sku3Card .mini-stat strong{font-size:15px}
#sku3Card .header-actions{display:flex;gap:10px;flex-wrap:wrap}
#sku3Card .btn{
  border:1px solid var(--border);background:#fff;color:var(--text);
  padding:10px 15px;border-radius:13px;font-weight:700;cursor:pointer;
  transition:transform .16s ease, box-shadow .16s ease, background .16s ease, opacity .16s;
  white-space:nowrap;
}
#sku3Card .btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(15,23,42,.08)}
#sku3Card .btn:active{transform:translateY(0)}
#sku3Card .btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
#sku3Card .btn-primary{
  background:linear-gradient(135deg,var(--primary),var(--primary-2));
  border:none;color:#fff;box-shadow:0 10px 24px rgba(79,70,229,.22)
}
#sku3Card .btn-success{background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff}
#sku3Card .btn-danger{background:#fff5f5;border-color:#fecaca;color:#b91c1c}
#sku3Card .btn-ghost{background:transparent}
#sku3Card .btn-sm{padding:7px 11px;border-radius:10px;font-size:13px}
#sku3Card .tabs-wrap{max-width:1440px;margin:20px auto 0;padding:0 24px}
#sku3Card .tabs{display:inline-flex;gap:6px;padding:6px;background:rgba(255,255,255,.75);border:1px solid var(--border);border-radius:999px;box-shadow:var(--shadow)}
#sku3Card .tab-btn{
  border:none;background:transparent;color:var(--muted);padding:10px 20px;border-radius:999px;
  font-weight:800;cursor:pointer;transition:.18s
}
#sku3Card .tab-btn.active{background:linear-gradient(135deg,var(--primary),var(--primary-2));color:#fff;box-shadow:0 10px 20px rgba(79,70,229,.2)}
#sku3Card main{max-width:1440px;margin:0 auto;padding:18px 24px 70px}
#sku3Card .alerts-wrap{max-width:1440px;margin:16px auto 0;padding:0 24px}
#sku3Card .alert{
  display:flex;gap:14px;align-items:center;justify-content:space-between;
  border-radius:18px;padding:14px 16px;margin-bottom:12px;border:1px solid transparent;
}
#sku3Card .alert strong{display:block;margin-bottom:3px}
#sku3Card .alert small, #sku3Card .alert div>div{font-size:13px;line-height:1.45}
#sku3Card .alert-danger{background:#fff1f2;border-color:#fecdd3;color:#9f1239}
#sku3Card .alert-warning{background:#fffbeb;border-color:#fde68a;color:#92400e}
#sku3Card .alert-info{background:#eff6ff;border-color:#bfdbfe;color:#1e40af}
#sku3Card .alert-success{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
#sku3Card .alert-actions{display:flex;gap:8px;flex-wrap:wrap}
#sku3Card .grid{display:grid;gap:18px;margin-bottom:18px}
#sku3Card .grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
#sku3Card .grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
#sku3Card .grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}
#sku3Card .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:18px}
#sku3Card .card{
  background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  box-shadow:var(--shadow);padding:20px;position:relative;overflow:hidden
}
#sku3Card .card h3{font-size:18px;font-weight:800;margin-bottom:16px;letter-spacing:-.01em}
#sku3Card .section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
#sku3Card .muted{color:var(--muted)}
#sku3Card .small{font-size:12px}
#sku3Card .kpi-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
#sku3Card .kpi-label{font-size:13px;color:var(--muted);font-weight:700}
#sku3Card .kpi-icon{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;background:#eef2ff;color:var(--primary);font-size:18px}
#sku3Card .kpi-card.success .kpi-icon{background:#ecfdf5;color:#059669}
#sku3Card .kpi-card.warning .kpi-icon{background:#fffbeb;color:#b45309}
#sku3Card .kpi-card.danger .kpi-icon{background:#fff1f2;color:#e11d48}
#sku3Card .kpi-card.info .kpi-icon{background:#eff6ff;color:#2563eb}
#sku3Card .kpi-value{font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-.03em;margin-bottom:6px}
#sku3Card .kpi-sub{font-size:13px;color:var(--muted);line-height:1.45;margin-bottom:12px}
#sku3Card .progress{position:relative;height:10px;background:#eef2ff;border-radius:999px;overflow:hidden}
#sku3Card .progress-fill{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--accent))}
#sku3Card .progress-fill.success{background:linear-gradient(90deg,#10b981,#34d399)}
#sku3Card .progress-fill.warning{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
#sku3Card .progress-fill.danger{background:linear-gradient(90deg,#ef4444,#f87171)}
#sku3Card .threshold-marker{position:absolute;top:0;bottom:0;width:2px;background:rgba(15,23,42,.32)}
#sku3Card .chart-box{position:relative;height:300px}
#sku3Card .table-wrap{overflow-x:auto}
#sku3Card table.data-table{width:100%;border-collapse:collapse;min-width:860px}
#sku3Card .data-table th, #sku3Card .data-table td{padding:12px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}
#sku3Card .data-table th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:800;background:#f8fafc;position:sticky;top:0}
#sku3Card .data-table td.num, #sku3Card .data-table th.num{text-align:right;font-variant-numeric:tabular-nums}
#sku3Card .data-table tbody tr:hover{background:#f8fafc}
#sku3Card .data-table tfoot td{font-weight:800;background:#f8fafc}
#sku3Card .clickable{cursor:pointer}
#sku3Card tr.selected{background:#eef2ff !important}
#sku3Card .seller-cell strong{display:block}
#sku3Card .chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:800;border:1px solid transparent;white-space:nowrap}
#sku3Card .chip-neutral{background:#f1f5f9;color:#475569;border-color:#e2e8f0}
#sku3Card .chip-primary{background:#eef2ff;color:#4338ca;border-color:#c7d2fe}
#sku3Card .chip-success{background:#ecfdf5;color:#047857;border-color:#a7f3d0}
#sku3Card .chip-warning{background:#fffbeb;color:#b45309;border-color:#fde68a}
#sku3Card .chip-danger{background:#fff1f2;color:#be123c;border-color:#fecdd3}
#sku3Card .chip-info{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
#sku3Card .badge{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800;border:1px solid transparent;margin:2px 2px 0 0;white-space:nowrap}
#sku3Card .badge-gold{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
#sku3Card .badge-silver{background:#f8fafc;color:#475569;border-color:#e2e8f0}
#sku3Card .badge-bronze{background:#fffbeb;color:#92400e;border-color:#fde68a}
#sku3Card .badge-primary{background:#eef2ff;color:#4338ca;border-color:#c7d2fe}
#sku3Card .badge-success{background:#ecfdf5;color:#047857;border-color:#a7f3d0}
#sku3Card .badge-warning{background:#fffbeb;color:#b45309;border-color:#fde68a}
#sku3Card .badge-accent{background:#ecfeff;color:#0e7490;border-color:#a5f3fc}
#sku3Card .badge-neutral{background:#f1f5f9;color:#475569;border-color:#e2e8f0}
#sku3Card .sku-card{display:flex;flex-direction:column;gap:14px}
#sku3Card .sku-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
#sku3Card .sku-title{font-size:18px;font-weight:800;margin:8px 0 4px}
#sku3Card .big-number{font-size:32px;font-weight:800;letter-spacing:-.03em}
#sku3Card .big-number span{font-size:15px;color:var(--muted);font-weight:700}
#sku3Card .stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#sku3Card .stat-box{background:#f8fafc;border:1px solid var(--border);border-radius:14px;padding:10px}
#sku3Card .stat-box span{display:block;font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
#sku3Card .stat-box strong{font-size:15px}
#sku3Card .leader-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
#sku3Card .leader-card{border:1px solid var(--border);border-radius:18px;padding:18px;background:linear-gradient(180deg,#fff,#f8fafc)}
#sku3Card .leader-medal{font-size:30px;margin-bottom:10px}
#sku3Card .heatmap-wrap{overflow:auto;padding-bottom:8px}
#sku3Card .heatmap{display:grid;gap:4px;min-width:1000px}
#sku3Card .heat-name{
  position:sticky;left:0;background:#fff;z-index:2;padding:6px 10px 6px 0;
  font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px
}
#sku3Card .heat-head{font-size:10px;font-weight:800;color:var(--muted);text-align:center;padding:4px 0}
#sku3Card .heat-cell{
  min-width:30px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;
  font-size:10px;font-weight:800;background:#f1f5f9;color:#94a3b8;border:1px solid transparent
}
#sku3Card .heat-cell.future{background:#f8fafc;color:#cbd5e1}
#sku3Card .heat-cell.missing{background:repeating-linear-gradient(45deg,#fff1f2,#fff1f2 4px,#ffe4e6 4px,#ffe4e6 8px);color:#be123c}
#sku3Card .heat-total{background:#eef2ff;color:#3730a3}
#sku3Card .sku3-modal{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;padding:18px}
#sku3Card .sku3-modal.open{display:flex}
#sku3Card .sku3-modal-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.46);backdrop-filter:blur(6px)}
#sku3Card .sku3-modal-panel{
  position:relative;background:#fff;border-radius:26px;box-shadow:0 28px 80px rgba(15,23,42,.24);
  width:min(1180px,100%);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;
  animation:sku3ModalIn .22s ease
}
#sku3Card .sku3-modal-panel.medium{width:min(860px,100%)}
@keyframes sku3ModalIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
#sku3Card .sku3-modal-header{padding:20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:16px;align-items:center}
#sku3Card .sku3-modal-header h2{font-size:22px;font-weight:800;letter-spacing:-.02em}
#sku3Card .sku3-modal-body{padding:20px;overflow:auto}
#sku3Card .sku3-modal-footer{padding:16px 20px;border-top:1px solid var(--border);background:#f8fafc;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
#sku3Card .field{display:block;margin-bottom:14px}
#sku3Card .field label{display:block;font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
#sku3Card .input, #sku3Card select, #sku3Card textarea{
  width:100%;padding:11px 13px;border:1px solid var(--border);border-radius:13px;background:#fff;color:var(--text);
  outline:none;transition:border .16s, box-shadow .16s
}
#sku3Card .input:focus, #sku3Card select:focus, #sku3Card textarea:focus{border-color:#a5b4fc;box-shadow:0 0 0 4px rgba(79,70,229,.09)}
#sku3Card textarea{min-height:92px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
#sku3Card .settings-section{margin-bottom:26px}
#sku3Card .settings-section h4{font-size:16px;font-weight:800;margin-bottom:12px}
#sku3Card .settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
#sku3Card .editor-card{border:1px solid var(--border);border-radius:18px;background:#f8fafc;padding:16px;margin-bottom:14px}
#sku3Card .editor-card-top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}
#sku3Card .employee-list{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
#sku3Card .employee-chip{
  display:inline-flex;align-items:center;gap:8px;padding:8px 10px;border-radius:999px;
  background:#fff;border:1px solid var(--border);font-size:13px;font-weight:600
}
#sku3Card .employee-chip button{border:none;background:#f1f5f9;color:#64748b;width:22px;height:22px;border-radius:50%;cursor:pointer;font-weight:800}
#sku3Card .add-row{display:flex;gap:10px;flex-wrap:wrap}
#sku3Card .add-row .input{flex:1;min-width:220px}
#sku3Card .checkbox{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer}
#sku3Card .checkbox input{width:18px;height:18px}
#sku3Card .dropzone{
  border:2px dashed #c7d2fe;border-radius:22px;background:#f8faff;padding:36px 20px;text-align:center;
  cursor:pointer;transition:.18s;margin-bottom:18px
}
#sku3Card .dropzone.drag{background:#eef2ff;border-color:var(--primary);transform:scale(1.005)}
#sku3Card .dropzone strong{display:block;font-size:18px;margin-bottom:6px}
#sku3Card .preview-card{border:1px solid var(--border);border-radius:18px;padding:16px;margin-bottom:14px;background:#fff}
#sku3Card .preview-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
#sku3Card .stat-chips{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
#sku3Card .list-box{background:#f8fafc;border:1px solid var(--border);border-radius:14px;padding:12px;font-size:13px;line-height:1.5;max-height:190px;overflow:auto}
#sku3Card .empty-state{text-align:center;padding:36px 20px;color:var(--muted)}
#sku3Card .empty-state strong{display:block;font-size:20px;color:var(--text);margin-bottom:8px}
#sku3Card .toast-container{position:fixed;right:20px;bottom:20px;z-index:200;display:flex;flex-direction:column;gap:10px;max-width:min(360px,calc(100vw - 40px))}
#sku3Card .toast{
  background:#0f172a;color:#fff;padding:13px 16px;border-radius:16px;box-shadow:0 18px 40px rgba(15,23,42,.24);
  font-size:14px;font-weight:600;animation:toastIn .22s ease
}
#sku3Card .toast-success{background:#065f46}
#sku3Card .toast-error{background:#9f1239}
#sku3Card .toast-warning{background:#92400e}
@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#sku3Card .note{font-size:12px;color:var(--muted);line-height:1.45}
#sku3Card .hr{height:1px;background:var(--border);margin:18px 0}
@media(max-width:1100px){
#sku3Card .grid-3, #sku3Card .grid-4, #sku3Card .leader-grid{grid-template-columns:1fr}
#sku3Card .grid-2{grid-template-columns:1fr}
}
@media(max-width:760px){
#sku3Card .container, #sku3Card .header-inner, #sku3Card .tabs-wrap, #sku3Card main, #sku3Card .alerts-wrap{padding-left:14px;padding-right:14px}
#sku3Card .header-inner{align-items:flex-start}
#sku3Card .kpi-value{font-size:25px}
#sku3Card .sku3-modal{padding:0}
#sku3Card .sku3-modal-panel{border-radius:0;max-height:100vh;width:100%}
}`;
  document.head.appendChild(sku3Style);

  // ── Разметка suadela ──
  window.sku3RenderMarkup = function () {
    var card = document.getElementById('sku3Card');
    if (!card || card.getAttribute('data-ready')) return;
    card.innerHTML = `
<header class="header">
  <div class="header-inner" id="headerContent"></div>
</header>

<div id="alerts" class="alerts-wrap"></div>

<div class="tabs-wrap">
  <div class="tabs">
    <button class="tab-btn active" data-action="switch-tab" data-tab="overview">Обзор</button>
    <button class="tab-btn" data-action="switch-tab" data-tab="team">Персонал</button>
    <button class="tab-btn" data-action="switch-tab" data-tab="dayday">Day-day анализ</button>
  </div>
</div>

<main>
  <section id="tab-overview" class="tab-panel">
    <div id="overviewKpis" class="kpi-grid"></div>
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title"><h3>Накопительный итог: план / факт</h3><span class="chip chip-primary" id="cumulativeChip"></span></div>
        <div class="chart-box"><canvas id="cumulativeChart"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title"><h3>Продажи по дням</h3><span class="chip chip-info" id="dailyChip"></span></div>
        <div class="chart-box"><canvas id="dailyChart"></canvas></div>
      </div>
    </div>
    <div id="skuCards" class="grid grid-3"></div>
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title"><h3>Деньги по сотрудникам</h3><span class="chip chip-success">база + фонд</span></div>
        <div class="chart-box"><canvas id="payoutChart"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title"><h3>Структура продаж по SKU</h3><span class="chip chip-neutral">штуки</span></div>
        <div class="chart-box"><canvas id="skuMixChart"></canvas></div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">
        <h3>Кто сколько получит</h3>
        <span class="chip chip-warning" id="minPayoutChip"></span>
      </div>
      <div class="table-wrap" id="payoutTable"></div>
    </div>
    <div class="card">
      <div class="section-title"><h3>Лидеры</h3><span class="chip chip-primary">для летучки</span></div>
      <div id="leaderboard"></div>
    </div>
  </section>

  <section id="tab-team" class="tab-panel" hidden>
    <div id="teamKpis" class="kpi-grid"></div>
    <div class="card">
      <div class="section-title"><h3>Вклад персонала</h3><span class="chip chip-info">клик по строке — детальный разбор</span></div>
      <div class="table-wrap" id="teamTable"></div>
    </div>
    <div class="card">
      <div class="section-title"><h3>Day-by-day усилия</h3><span class="chip chip-neutral">тепловая карта продаж</span></div>
      <div id="heatmap"></div>
      <div class="note" style="margin-top:10px">
        Красная штриховка — день ожидает загрузки отчёта. Серые — будущие дни. Чем ярче клетка, тем выше личный результат дня.
      </div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title"><h3>Динамика сотрудника</h3><span class="chip chip-primary" id="selectedSellerChip"></span></div>
        <div id="selectedSellerInfo"></div>
        <div class="chart-box" style="margin-top:14px"><canvas id="sellerChart"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title"><h3>Разрез по товарным позициям</h3><span class="chip chip-success">личный вклад</span></div>
        <div id="sellerSkuBreakdown"></div>
      </div>
    </div>
  </section>

  <section id="tab-dayday" class="tab-panel" hidden>
    <div class="kpi-grid" id="daydayKpis"></div>
    
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title"><h3>Продажи по дням (общий)</h3><span class="chip chip-primary">штуки</span></div>
        <div class="chart-box"><canvas id="ddDailyChart"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title"><h3>Накопительный итог по дням</h3><span class="chip chip-success">план vs факт</span></div>
        <div class="chart-box"><canvas id="ddCumulativeChart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <h3>Анализ по кассирам</h3>
        <span class="chip chip-info">клик по графику — детали</span>
      </div>
      <div class="chart-box" style="height:400px"><canvas id="ddSellerHeatmapChart"></canvas></div>
      <div class="note" style="margin-top:10px">Тепловая карта показывает вклад каждого кассира по дням. Чем ярче цвет, тем выше продажи.</div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="section-title"><h3>Динамика по SKU</h3><span class="chip chip-warning">товарные позиции</span></div>
        <div class="chart-box" style="height:350px"><canvas id="ddSkuChart"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title"><h3>Структура продаж по дням</h3><span class="chip chip-neutral">доля SKU</span></div>
        <div class="chart-box" style="height:350px"><canvas id="ddStackedChart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <h3>Детальный разбор по дню</h3>
        <select id="ddDaySelect" class="input" style="width:auto;display:inline-block;min-width:180px"></select>
      </div>
      <div id="ddDayDetail"></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="section-title"><h3>Рейтинг кассиров за период</h3><span class="chip chip-primary">топ performers</span></div>
        <div class="chart-box" style="height:400px"><canvas id="ddSellerRankingChart"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title"><h3>Проникновение по дням</h3><span class="chip chip-success">чеки и штуки</span></div>
        <div class="chart-box"><canvas id="ddPenetrationChart"></canvas></div>
      </div>
    </div>
  </section>
</main>

<div class="toast-container" id="toastContainer"></div>

<div class="sku3-modal" id="settingsModal">
  <div class="sku3-modal-backdrop" data-action="close-modal" data-modal="settingsModal"></div>
  <div class="sku3-modal-panel">
    <div class="sku3-modal-header">
      <div>
        <h2>Настройка месяца</h2>
        <div class="muted small">Цели, артикулы, ставки, пороги, сотрудники и сохранение состояния</div>
      </div>
      <button class="btn btn-sm" data-action="close-modal" data-modal="settingsModal">Закрыть</button>
    </div>
    <div class="sku3-modal-body" id="settingsBody"></div>
    <div class="sku3-modal-footer">
      <button class="btn" data-action="save-json">Сохранить JSON</button>
      <button class="btn" data-action="load-json">Загрузить JSON</button>
      <button class="btn btn-danger" data-action="reset-all">Сбросить всё</button>
      <button class="btn btn-primary" data-action="save-settings">Сохранить настройки</button>
    </div>
  </div>
</div>

<div class="sku3-modal" id="importModal">
  <div class="sku3-modal-backdrop" data-action="close-modal" data-modal="importModal"></div>
  <div class="sku3-modal-panel medium">
    <div class="sku3-modal-header">
      <div>
        <h2>Импорт продаж</h2>
        <div class="muted small">Файлы 1С: дата, продавец, товар, код, количество</div>
      </div>
      <button class="btn btn-sm" data-action="close-modal" data-modal="importModal">Закрыть</button>
    </div>
    <div class="sku3-modal-body" id="importBody"></div>
    <div class="sku3-modal-footer">
      <button class="btn" data-action="close-modal" data-modal="importModal">Отмена</button>
      <button class="btn btn-primary" id="confirmImportBtn" data-action="confirm-import" disabled>Импортировать</button>
    </div>
  </div>
</div>

<div class="sku3-modal" id="checksModal">
  <div class="sku3-modal-backdrop" data-action="close-modal" data-modal="checksModal"></div>
  <div class="sku3-modal-panel medium">
    <div class="sku3-modal-header">
      <div>
        <h2>Чеки вручную</h2>
        <div class="muted small">Нужны для 3SKU на 100 чеков и нагрузки на кассира</div>
      </div>
      <button class="btn btn-sm" data-action="close-modal" data-modal="checksModal">Закрыть</button>
    </div>
    <div class="sku3-modal-body" id="checksBody"></div>
    <div class="sku3-modal-footer">
      <button class="btn" data-action="copy-previous-checks">Скопировать предыдущий день</button>
      <button class="btn btn-primary" data-action="save-checks">Сохранить чеки</button>
    </div>
  </div>
</div>

<input type="file" id="importFileInput" accept=".xlsx,.xls,.csv" multiple hidden>
<input type="file" id="jsonFileInput" accept=".json,application/json" hidden>
`;
    card.setAttribute('data-ready', '1');
  };

  // ── Логика suadela (оригинальный код, вызывается при активации вкладки) ──
  window.sku3Init = function () {
const STORAGE_KEY = 'sku3_motivator_v1';
const STATE_VERSION = 2;
const STORE_KEY = '__STORE__';
const UNKNOWN_KEY = '__UNKNOWN__';
const SKU_COLORS = ['#4f46e5','#06b6d4','#f59e0b','#10b981','#ec4899','#8b5cf6','#0ea5e9','#f97316'];
const SELLER_COLORS = ['#4f46e5','#06b6d4','#f59e0b','#10b981','#ec4899','#8b5cf6','#0ea5e9','#f97316','#84cc16','#f43f5e','#14b8a6','#a855f7','#fbbf24','#64748b'];
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTH_STEMS = ['янв','фев','мар','апр','ма','июн','июл','авг','сен','окт','ноя','дек'];
const LATIN_TO_CYR = {a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у'};
const DEFAULT_EMPLOYEES = [
  'Клякина Марина Николаевна',
  'Чернопятова Вера Вячеславовна',
  'Манникова Наталья Михайловна',
  'Перфилова Елизавета Александровна',
  'Юринова Наталья Геннадьевна',
  'Караморина Анастасия Михайловна',
  'Кузнецова Алена Шихкеримовна',
  'Моисеева Дарина Денисовна'
];

/* Состояние: settings/checks/imports — компактный «meta»;
   sales («горячие» данные) — чанки по дням в IndexedDB (см. S3Store). */
let state = defaultState();          // заполняется асинхронно при инициализации
let migrationNote = '';
let currentTab = 'overview';
let charts = {};
let pendingImports = [];
let settingsDraft = null;
let selectedSeller = null;
let checksDraftDate = null;
let dirtyDates = new Set();          // изменённые дни продаж (для точечной записи чанков)
let removedDates = new Set();        // удалённые дни продаж (чанки удаляются из хранилища)
let saveTimer = null;                // дебаунс фоновых сохранений
let storeReady = false;
let stateReadyPromise;              // данные догружены из хранилища
let legacyPendingRaw = null;         // оригинальный blob старого ключа до подтверждения миграции
const SAVE_DEBOUNCE_MS = 1500;

function init(){
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.color = '#64748b';
  }
  bindEvents();
  showSkeleton('Загрузка данных…');
  stateReadyPromise = loadStateAsync().then(function(res){
    hideSkeleton();
    storeReady = true;
    renderAll();
    refreshSaveInfo();
    if (res && res.freshMigration) {
      showToast('Данные перенесены в новое хранилище (IndexedDB). Старая копия записей находится в разделе «Настройки → Данные и состояние».', 'info');
    }
    if (res && res.migrationFailed) {
      showToast('Не удалось сохранить перенос данных. История доступна в памяти, исходная копия сохранена. Выгрузите JSON.', 'warning');
    }
    if (migrationNote) showToast(migrationNote, 'warning');
    window.dispatchEvent(new Event('sku3-data-changed'));
    return true;
  }).catch(function(e){
    console.error('[sku3] Ошибка загрузки состояния:', e);
    hideSkeleton();
    storeReady = false;
    renderAll();
    showToast('Ошибка загрузки сохранённых данных: ' + (e && e.message ? e.message : e), 'error');
    return false;
  });
}

/* Скелетон-экран на время асинхронной догрузки состояния */
function showSkeleton(text){
  const card = document.getElementById('sku3Card');
  if (!card || document.getElementById('sku3Skeleton')) return;
  const el = document.createElement('div');
  el.id = 'sku3Skeleton';
  el.style.cssText = 'padding:48px 24px;text-align:center;color:#64748b;font:600 15px Inter,system-ui,sans-serif';
  el.textContent = text || 'Загрузка…';
  card.appendChild(el);
}
function hideSkeleton(){
  const el = document.getElementById('sku3Skeleton');
  if (el) el.remove();
}

/* ============================= STATE ============================= */

function uid(prefix){ return (prefix || 'id') + '_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4); }

function defaultState(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    version: STATE_VERSION,
    settings: {
      storeName: 'Магазин',
      monthName: monthNameRu(now),
      startDate: toISO(start),
      endDate: toISO(end),
      planChecks: 0,
      minPayout: 100,
      fundMode: 'cashiersByUnits',
      employees: DEFAULT_EMPLOYEES.map(name => ({ id: uid('emp'), name })),
      skus: [{
        id: uid('sku'),
        name: 'Кабели',
        articles: ['931-606','931-607','931-608','931-544'],
        planUnits: 1000,
        cashierRate: 5,
        fundRate: 5,
        threshold: 70,
        startDate: '',
        endDate: '',
        enabled: true
      }]
    },
    sales: [],
    checks: [],
    imports: [],
    lastSaved: null
  };
}

/* Асинхронная загрузка состояния: IndexedDB + одноразовая миграция из localStorage */
function loadStateAsync(){
  return s3store.init().then(function(){
    return migrateFromLegacy(s3store);
  }).then(function(res){
    // Запоминаем старый ключ для подтверждения удаления (только при активном IndexedDB)
    if (s3store.useIdb) {
      try { legacyPendingRaw = localStorage.getItem('sku3_motivator_v1'); } catch(e) { legacyPendingRaw = null; }
    }
    const loaded = s3store.getState();
    if (loaded) {
      state = migrateState(loaded);
      // sales уже разложен по чанкам в хранилище — синхронизируем chunks с состоянием
      s3store.replaceAllSales(state.sales || []);
    } else {
      state = defaultState();
      s3store.replaceAllSales([]);
      return s3store.save(state, [], []).then(function(){ return res || { loaded: false }; });
    }
    return res || { loaded: true };
  });
}

/* Сохранение состояния: meta — всегда, чанки продаж — только изменённые дни.
   mode='immediate' — запись сразу (важные события: импорт, настройки, сброс);
   mode='debounced' — фоновое сохранение с дебаунсом (renderAll). */
function persist(mode){
  if (!storeReady) return Promise.resolve(false);
  const savedAt = new Date().toISOString();
  const d = Array.from(dirtyDates), r = Array.from(removedDates);
  dirtyDates = new Set(); removedDates = new Set();

  if (mode === 'debounced') {
    // изменённые/удалённые даты остаются в очередях до фактической записи
    d.forEach(x => dirtyDates.add(x));
    r.forEach(x => removedDates.add(x));
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){ saveTimer = null; persist('immediate'); }, SAVE_DEBOUNCE_MS);
    return Promise.resolve();
  }

  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  return s3store.save(Object.assign({}, state, { lastSaved: savedAt }), d, r).then(function(saved){
    if (!saved) {
      d.forEach(x => { if (s3store.chunks.has(x)) dirtyDates.add(x); });
      r.forEach(x => { if (!s3store.chunks.has(x)) removedDates.add(x); });
      return false;
    }
    state.lastSaved = savedAt;
    refreshStorageUi();
    return true;
  });
}

/* Точечное удаление чанков дней из памяти хранилища (для replace-операций) */
function forgetSalesDays(dates){
  const list = Array.isArray(dates) ? dates : [dates];
  list.forEach(function(d){
    const k = /^\d{4}-\d{2}-\d{2}$/.test(String(d||'')) ? String(d) : '__nodate__';
    if (s3store.chunks.has(k)) { s3store.chunks.delete(k); removedDates.add(k); }
  });
}

function refreshSaveInfo(){
  const el = document.getElementById('storageInfoLine');
  if (!el) return;
  const days = s3store.chunks.size;
  let recs = 0;
  s3store.chunks.forEach(function(arr){ recs += Array.isArray(arr) ? arr.length : 0; });
  const where = s3store.useIdb ? 'IndexedDB' : 'localStorage (резервный режим)';
  const saved = state.lastSaved ? new Date(state.lastSaved).toLocaleString('ru-RU') : '—';
  el.textContent = 'Хранилище: ' + where + ' · Дней продаж: ' + days + ' · Записей: ' + fmtNum(recs) + ' · Сохранено: ' + saved;
}

/* Обновление строки статуса и блока миграции в открытом окне настроек */
function refreshStorageUi(){
  const line = document.getElementById('storageInfoLine');
  if (line) {
    refreshSaveInfo();
    let block = document.getElementById('migrationBlock');
    const html = migrationBlockHtml();
    if (!block && html) {
      block = document.createElement('div');
      block.id = 'migrationBlock';
      line.insertAdjacentElement('afterend', block);
    }
    if (block) {
      if (html) block.innerHTML = html;
      else block.remove();
    }
  }
}

/* Фоновое сохранение не должно теряться при закрытии/сворачивании WebView.
   При наличии «грязных» дней сначала синхронно пересобираем чанки из state.sales,
   затем persist('immediate') ставится в очередь за текущей операцией записи. */
function flushSku3Save(){
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!storeReady || !state) return;
  if (dirtyDates.size || removedDates.size) {
    s3store.replaceAllSales(state.sales || []);
    dirtyDates = new Set(s3store.chunks.keys());
    removedDates = new Set([...removedDates].filter(day => !s3store.chunks.has(day)));
  }
  persist('immediate');
}

function migrateState(st){
  const def = defaultState();
  st = st || {};
  const prevVersion = Number(st.version) || 1;
  const settings = Object.assign({}, def.settings, st.settings || {});

  settings.employees = Array.isArray(settings.employees) ? settings.employees : [];
  settings.skus = Array.isArray(settings.skus) ? settings.skus : [];
  settings.skus = settings.skus.map(sku => ({
    id: sku.id || uid('sku'),
    name: sku.name || 'Товарная позиция',
    articles: Array.isArray(sku.articles) ? sku.articles : [],
    planUnits: Number(sku.planUnits) || 0,
    cashierRate: Number(sku.cashierRate) || 0,
    fundRate: Number(sku.fundRate) || 0,
    threshold: Number(sku.threshold) || 0,
    startDate: typeof sku.startDate === 'string' ? sku.startDate : '',
    endDate: typeof sku.endDate === 'string' ? sku.endDate : '',
    enabled: sku.enabled !== false
  }));

  if (prevVersion < STATE_VERSION) migrationNote = 'История старой версии сохранена. Проверьте её; при необходимости повторно загрузите исходные отчёты.';

  return {
    version: STATE_VERSION,
    settings,
    sales: Array.isArray(st.sales) ? st.sales : [],
    checks: Array.isArray(st.checks) ? st.checks : [],
    imports: Array.isArray(st.imports) ? st.imports : [],
    lastSaved: st.lastSaved || null
  };
}

/* ============================= UTILS ============================= */

function esc(v){
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function round2(n){ return Math.round((Number(n) || 0) * 100) / 100; }
function toISO(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function parseISO(s){ const p=String(s).split('-').map(Number); return new Date(p[0], (p[1]||1)-1, p[2]||1); }
function addDaysISO(iso, n){ const d=parseISO(iso); d.setDate(d.getDate()+n); return toISO(d); }
function todayISO(){ return toISO(new Date()); }
function monthNameRu(d){ return MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear(); }
function eachDate(start,end){
  const res=[];
  if (!start || !end || start > end) return res;
  let cur=start, guard=0;
  while (cur <= end && guard < 1200){ res.push(cur); cur=addDaysISO(cur,1); guard++; }
  return res;
}
function daysBetweenInclusive(start,end){ return eachDate(start,end).length; }
/* Диапазон продаж SKU внутри месяца акции: null = весь месяц (как раньше), иначе [skuStart, skuEnd] */
function skuSaleRange(sku, monthStart, monthEnd){
  if (!sku) return null;
  const s = (sku.startDate && sku.startDate > monthStart) ? sku.startDate : monthStart;
  const e = (sku.endDate && sku.endDate < monthEnd) ? sku.endDate : monthEnd;
  if (s === monthStart && e === monthEnd) return null;
  if (s > e) return { start:s, end:e };
  return { start:s, end:e };
}
function isDateInSkuRange(dateISO, range){ return !range || (dateISO >= range.start && dateISO <= range.end); }
function rangeStartIso(range, fallback){ return range ? range.start : fallback; }
function rangeEndIso(range, fallback){ return range ? range.end : fallback; }
function skuRangeText(range){ return range ? formatShortDate(range.start) + ' — ' + formatShortDate(range.end) : 'весь месяц'; }
function formatShortDate(iso){ if(!iso) return '—'; const d=parseISO(iso); return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0'); }
function formatFullDate(iso){ if(!iso) return '—'; const d=parseISO(iso); return formatShortDate(iso)+'.'+d.getFullYear(); }
function fmtNum(v, dec){
  dec = dec || 0;
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:dec, minimumFractionDigits:dec}).format(n);
}
function fmtMoney(v){
  const n = round2(v);
  return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2, minimumFractionDigits:0}).format(n) + ' ₽';
}
function fmtPct(v, dec){
  if (v == null || !isFinite(Number(v))) return '—';
  return fmtNum(v, dec == null ? 1 : dec) + '%';
}
function clampWidth(v){ return Math.max(0, Math.min(100, Number(v) || 0)); }
function shortName(name){
  const parts = String(name||'').trim().split(/\s+/);
  if (parts.length >= 2) return parts[0] + ' ' + parts[1][0] + '.';
  return name || '—';
}

function parseNumericCell(v){
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/\u00a0/g, ' ').trim();
  if (!s) return null;
  s = s.replace(/\s+/g, '').replace(',', '.');
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  return null;
}

function normArticle(v){ return String(v||'').trim().toUpperCase().replace(/\s+/g,''); }
function normName(v){
  if (v == null) return '';
  let s = String(v).trim().toLowerCase().replace(/ё/g,'е');
  s = s.replace(/[a-z]/g, ch => LATIN_TO_CYR[ch] || ch);
  s = s.replace(/[^а-я\s-]/gi, '');
  s = s.replace(/\s+/g,' ').trim();
  return s;
}
function sellerKeyFromName(name){ return normName(name) || UNKNOWN_KEY; }
function parseArticles(v){
  const arr = Array.isArray(v) ? v : String(v||'').split(/[\s,;]+/);
  return [...new Set(arr.map(x => String(x).trim()).filter(Boolean))];
}
function allArticles(){ return (state.settings.skus||[]).flatMap(sku => sku.articles || []); }
function buildArticleMap(skuList){
  const map = new Map();
  (skuList || state.settings.skus || []).forEach(sku => {
    (sku.articles || []).forEach(a => {
      const k = normArticle(a);
      if (k && !map.has(k)) map.set(k, sku.id);
    });
  });
  return map;
}
function findEmployeeByName(name){
  const k = sellerKeyFromName(name);
  if (k === UNKNOWN_KEY) return null;
  return state.settings.employees.find(e => sellerKeyFromName(e.name) === k) || null;
}
function displayNameForKey(key){
  if (key === UNKNOWN_KEY) return 'Продавец не определён';
  const emp = state.settings.employees.find(e => sellerKeyFromName(e.name) === key);
  if (emp) return emp.name;
  const sale = state.sales.find(r => sellerKeyFromName(r.seller) === key);
  if (sale && sale.seller) return sale.seller;
  const chk = state.checks.find(c => c.seller !== STORE_KEY && sellerKeyFromName(c.seller) === key);
  if (chk) return chk.seller;
  return key;
}
function getActiveSellers(){
  const map = new Map();
  state.settings.employees.forEach(employee => {
    const key = sellerKeyFromName(employee.name);
    if (key !== UNKNOWN_KEY && !map.has(key)) map.set(key, {key, name:employee.name.trim()});
  });
  return [...map.values()].sort((a,b) => a.name.localeCompare(b.name,'ru'));
}
function hasChecksForDate(date){
  return (state.checks || []).some(c => c.date === date && Number(c.checks) > 0);
}
function latestImportDate(){
  const dates = (state.imports || []).map(i => i.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
function latestSalesDate(){
  const dates = (state.sales || []).map(s => s.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
function chip(text, type){ return '<span class="chip chip-' + (type||'neutral') + '">' + esc(text) + '</span>'; }
function badge(text, type){ return '<span class="badge badge-' + (type||'neutral') + '">' + esc(text) + '</span>'; }

/* ============================= METRICS ============================= */

function blankSeller(key, name){
  return {
    key, name,
    units:0, revenue:0, base:0, fund:0, accrued:0, payable:0, shortfall:0,
    projUnits:0, projBase:0, projFund:0, projAccrued:0, projPayable:0,
    checks:0, checksDaily:{}, penetration:null, unitsPerCheck:null,
    activeDays:0, maxDay:0, share:0, rank:0, daily:{}, skuData:{}
  };
}

function distributeFund(entries, field, total, totalUnits, unitField){
  entries.forEach(entry => entry[field] = 0);
  const cents = Math.round(total * 100);
  const positive = entries.filter(entry => Number(entry[unitField]) > 0);
  const units = positive.reduce((sum, entry) => sum + Number(entry[unitField]), 0);
  if (!(cents > 0) || !(units > 0)) return;
  const shares = positive.map((entry, index) => {
    const exact = cents * Number(entry[unitField]) / units;
    return { entry, index, cents:Math.floor(exact), fraction:exact - Math.floor(exact) };
  });
  let remainder = cents - shares.reduce((sum, share) => sum + share.cents, 0);
  shares.sort((a,b) => b.fraction - a.fraction || a.index - b.index);
  for (let index=0; remainder>0; index++, remainder--) shares[index % shares.length].cents++;
  shares.forEach(share => share.entry[field] = share.cents / 100);
}

function computeMetrics(){
  const s = state.settings;
  const startDate = s.startDate || todayISO();
  const endDate = s.endDate || startDate;
  const allDates = eachDate(startDate, endDate);
  const allDatesSet = new Set(allDates);
  const today = todayISO();
  const minPayout = Number(s.minPayout) || 0;
  const skuList = (s.skus || []).filter(x => x && x.enabled !== false);
  const articleMap = buildArticleMap(skuList);

  const importedSet = new Set((state.imports || []).map(i => i.date).filter(d => allDatesSet.has(d)));
  const salesInRange = (state.sales || []).filter(r => allDatesSet.has(r.date));
  /* Диапазон продаж каждой SKU: пустые даты = весь месяц, иначе строгий период «с — по» */
  const skuRanges = {};
  skuList.forEach(sku => { skuRanges[sku.id] = skuSaleRange(sku, startDate, endDate); });
  const mapped = [];
  let unmappedCount = 0, unmappedQty = 0;
  salesInRange.forEach(r => {
    const skuId = articleMap.get(normArticle(r.article));
    if (skuId) {
      if (isDateInSkuRange(r.date, skuRanges[skuId])) mapped.push(Object.assign({}, r, { skuId }));
      else { unmappedCount++; unmappedQty += Number(r.qty) || 0; }
    }
    else { unmappedCount++; unmappedQty += Number(r.qty) || 0; }
  });

  const expectedEnd = today < startDate ? null : (today > endDate ? endDate : addDaysISO(today, -1));
  const expectedDates = expectedEnd && expectedEnd >= startDate ? eachDate(startDate, expectedEnd) : [];
  const todayLoaded = importedSet.has(today) && today >= startDate && today <= endDate;
  const elapsedDays = expectedDates.length + (todayLoaded ? 1 : 0);
  let remainingStart = null;
  if (today <= endDate) remainingStart = today < startDate ? startDate : (todayLoaded ? addDaysISO(today, 1) : today);
  const remainingDates = remainingStart && remainingStart <= endDate ? eachDate(remainingStart, endDate) : [];
  const remainingDays = remainingDates.length;
  const missingDates = expectedDates.filter(d => !importedSet.has(d));
  const daysWithData = importedSet.size;
  const checksMissingDates = [...importedSet].filter(d => !hasChecksForDate(d)).sort();

  const sellersInfo = new Map();
  function ensureSeller(key, rawName){
    if (!sellersInfo.has(key)) {
      const name = rawName && String(rawName).trim() ? String(rawName).trim() : displayNameForKey(key);
      sellersInfo.set(key, blankSeller(key, name));
    }
    return sellersInfo.get(key);
  }
  getActiveSellers().forEach(sel => sellersInfo.set(sel.key, blankSeller(sel.key, sel.name)));

  const bySku = {};
  skuList.forEach(sku => { bySku[sku.id] = { units:0, revenue:0, sellers:{}, byDate:{} }; });
  const byDate = {};

  mapped.forEach(r => {
    const qty = Number(r.qty) || 0;
    if (qty <= 0) return;
    const skuData = bySku[r.skuId];
    if (!skuData) return;
    const key = sellerKeyFromName(r.seller);
    if (key === UNKNOWN_KEY || !findEmployeeByName(r.seller)) return;
    const seller = ensureSeller(key, r.seller);
    const revenue = Number(r.sum) || 0;
    skuData.units += qty;
    skuData.revenue += revenue;
    skuData.sellers[key] = skuData.sellers[key] || { units:0, revenue:0 };
    skuData.sellers[key].units += qty;
    skuData.sellers[key].revenue += revenue;
    skuData.byDate[r.date] = (skuData.byDate[r.date] || 0) + qty;
    byDate[r.date] = (byDate[r.date] || 0) + qty;
    seller.daily[r.date] = (seller.daily[r.date] || 0) + qty;
  });

  const checksBySeller = {};
  const checksDailyBySeller = {};
  const checksByDate = new Map();
  (state.checks || []).forEach(c => {
    if (!allDatesSet.has(c.date)) return;
    const val = Number(c.checks) || 0;
    if (val <= 0) return;
    if (!checksByDate.has(c.date)) checksByDate.set(c.date, { explicit: null, sellers: 0 });
    const dayChecks = checksByDate.get(c.date);
    if (c.seller === STORE_KEY) { dayChecks.explicit = val; return; }
    const key = sellerKeyFromName(c.seller);
    if (key === UNKNOWN_KEY || !findEmployeeByName(c.seller)) return;
    checksBySeller[key] = (checksBySeller[key] || 0) + val;
    dayChecks.sellers += val;
    checksDailyBySeller[key] = checksDailyBySeller[key] || {};
    checksDailyBySeller[key][c.date] = (checksDailyBySeller[key][c.date] || 0) + val;
  });
  const storeChecks = [...checksByDate.values()].reduce((sum, day) => sum + (day.explicit ?? day.sellers), 0);

  const skuMetrics = skuList.map((sku, idx) => {
    const data = bySku[sku.id] || { units:0, revenue:0, sellers:{}, byDate:{} };
    const units = data.units;
    const skuByDate = data.byDate || {};
    const plan = Number(sku.planUnits) || 0;
    const cashierRate = Number(sku.cashierRate) || 0;
    const fundRate = Number(sku.fundRate) || 0;
    const threshold = Number(sku.threshold) || 0;
    /* Период продаж позиции: расчёты, план и статистика — строго по нему (весь месяц, если даты не заданы) */
    const range = skuRanges[sku.id] || null;
    const skuDates = range ? eachDate(range.start, range.end) : allDates;
    const skuTotalDays = skuDates.length;
    const skuImportedSet = new Set(skuDates.filter(d => importedSet.has(d)));
    let skuExpectedEnd = today < rangeStartIso(range, startDate) ? null : (today > rangeEndIso(range, endDate) ? rangeEndIso(range, endDate) : addDaysISO(today, -1));
    if (range && skuExpectedEnd && skuExpectedEnd < range.start) skuExpectedEnd = null;
    const skuExpectedDates = skuExpectedEnd && skuExpectedEnd >= rangeStartIso(range, startDate) ? eachDate(rangeStartIso(range, startDate), skuExpectedEnd) : [];
    const skuTodayLoaded = importedSet.has(today) && today >= rangeStartIso(range, startDate) && today <= rangeEndIso(range, endDate);
    const skuElapsedDays = skuExpectedDates.length + (skuTodayLoaded ? 1 : 0);
    let skuRemainingStart = null;
    const skuRangeEnd = rangeEndIso(range, endDate);
    if (today <= skuRangeEnd) skuRemainingStart = today < rangeStartIso(range, startDate) ? rangeStartIso(range, startDate) : (skuTodayLoaded ? addDaysISO(today, 1) : today);
    const skuRemainingDates = skuRemainingStart && skuRemainingStart <= skuRangeEnd ? eachDate(skuRemainingStart, skuRangeEnd) : [];
    const skuRemainingDays = skuRemainingDates.length;
    const skuMissingDates = skuExpectedDates.filter(d => !importedSet.has(d));
    const achievement = plan > 0 ? (units / plan * 100) : 0;
    const thresholdUnits = plan > 0 ? plan * threshold / 100 : 0;
    const thresholdReached = plan > 0 && units >= thresholdUnits;
    const requiredToPlan = Math.max(0, Math.ceil(plan - units));
    const requiredToThreshold = Math.max(0, Math.ceil(thresholdUnits - units));
    const perDayToPlan = skuRemainingDays > 0 ? requiredToPlan / skuRemainingDays : requiredToPlan;
    const perDayToThreshold = skuRemainingDays > 0 ? requiredToThreshold / skuRemainingDays : requiredToThreshold;

    let skuCum = 0;
    const skuDailySeries = skuDates.map((d, i) => {
      const imported = skuImportedSet.has(d);
      const dayUnits = skuByDate[d] || 0;
      if (imported) skuCum += dayUnits;
      return {
        date: d,
        imported,
        future: d > today,
        unitsOrZero: dayUnits,
        units: imported ? dayUnits : null,
        cumulative: imported ? round2(skuCum) : null,
        planCumulative: plan > 0 ? round2(plan * (i + 1) / skuTotalDays) : 0,
        requiredPerDay: perDayToPlan
      };
    });
    /* Плановый накопительный на каждую дату месяца: до начала периода — 0, после окончания — план целиком */
    const planCumByDate = {};
    allDates.forEach(d => {
      if (!range) { planCumByDate[d] = plan > 0 ? plan * (allDates.indexOf(d) + 1) / allDates.length : 0; return; }
      if (d < range.start) { planCumByDate[d] = 0; return; }
      if (d >= range.end) { planCumByDate[d] = plan; return; }
      const idx = skuDates.indexOf(d);
      planCumByDate[d] = plan > 0 && skuTotalDays > 0 ? plan * (idx + 1) / skuTotalDays : 0;
    });

    const sellerEntries = Object.entries(data.sellers).map(([key, val]) => {
      const projUnits = skuElapsedDays > 0 ? val.units + (val.units / skuElapsedDays) * skuRemainingDays : val.units;
      return {
        key,
        name: sellersInfo.has(key) ? sellersInfo.get(key).name : displayNameForKey(key),
        units: val.units,
        revenue: val.revenue,
        base: round2(val.units * cashierRate),
        projUnits: round2(projUnits),
        projBase: round2(projUnits * cashierRate),
        fundCurrent: 0,
        fundProjected: 0
      };
    });

    const projectedUnits = round2(sellerEntries.reduce((a, e) => a + (Number(e.projUnits) || 0), 0));
    const projectedAchievement = plan > 0 ? (projectedUnits / plan * 100) : 0;
    const projectedThresholdReached = plan > 0 && projectedUnits >= thresholdUnits;
    const currentBase = round2(sellerEntries.reduce((sum, seller) => sum + seller.base, 0));
    const projectedBase = round2(sellerEntries.reduce((sum, seller) => sum + seller.projBase, 0));
    const currentFund = (s.fundMode === 'cashiersByUnits' && thresholdReached) ? round2(units * fundRate) : 0;
    const projectedFund = (s.fundMode === 'cashiersByUnits' && projectedThresholdReached) ? round2(projectedUnits * fundRate) : 0;

    distributeFund(sellerEntries, 'fundCurrent', currentFund, units, 'units');
    distributeFund(sellerEntries, 'fundProjected', projectedFund, projectedUnits, 'projUnits');
    sellerEntries.forEach(e => {
      e.accrued = round2(e.base + e.fundCurrent);
      e.projAccrued = round2(e.projBase + e.fundProjected);
      e.payable = SoldieRules.payout(e.accrued, minPayout);
      e.projPayable = SoldieRules.payout(e.projAccrued, minPayout);
    });

    return {
      sku,
      id: sku.id,
      index: idx,
      color: SKU_COLORS[idx % SKU_COLORS.length],
      name: sku.name,
      articles: sku.articles || [],
      range,
      saleRangeText: skuRangeText(range),
      skuDates,
      planCumByDate,
      skuDailySeries,
      skuElapsedDays,
      skuRemainingDays,
      skuMissingDates,
      units,
      revenue: data.revenue,
      plan,
      cashierRate,
      fundRate,
      threshold,
      achievement,
      thresholdUnits,
      thresholdReached,
      requiredToPlan,
      requiredToThreshold,
      perDayToPlan,
      perDayToThreshold,
      projectedUnits,
      projectedAchievement,
      projectedThresholdReached,
      currentBase,
      currentFund,
      projectedBase,
      projectedFund,
      targetPenetration: (Number(s.planChecks) > 0 && plan > 0) ? (plan / Number(s.planChecks) * 100) : null,
      sellerMetrics: sellerEntries
    };
  });

  skuMetrics.forEach(skuM => {
    skuM.sellerMetrics.forEach(sm => {
      const seller = ensureSeller(sm.key, sm.name);
      seller.units += sm.units;
      seller.revenue += sm.revenue;
      seller.base = round2(seller.base + sm.base);
      seller.fund = round2(seller.fund + sm.fundCurrent);
      seller.projUnits += sm.projUnits;
      seller.projBase = round2(seller.projBase + sm.projBase);
      seller.projFund = round2(seller.projFund + sm.fundProjected);
      seller.skuData[skuM.id] = {
        skuName: skuM.name,
        color: skuM.color,
        units: sm.units,
        base: sm.base,
        fundCurrent: sm.fundCurrent,
        accrued: sm.accrued, payable: sm.payable,
        projUnits: sm.projUnits,
        projAccrued: sm.projAccrued, projPayable: sm.projPayable
      };
    });
  });

  const totalUnits = skuMetrics.reduce((a, x) => a + x.units, 0);
  const sellers = [...sellersInfo.values()];

  sellers.forEach(seller => {
    seller.checks = checksBySeller[seller.key] || 0;
    seller.checksDaily = checksDailyBySeller[seller.key] || {};
    seller.units = round2(seller.units);
    seller.projUnits = round2(seller.projUnits);
    seller.accrued = round2(seller.base + seller.fund);
    seller.payable = round2(Object.values(seller.skuData).reduce((sum, sku) => sum + sku.payable, 0));
    seller.shortfall = round2(Object.values(seller.skuData).reduce((sum, sku) => sum + (sku.payable > 0 ? 0 : Math.max(0, minPayout - sku.accrued)), 0));
    seller.projAccrued = round2(seller.projBase + seller.projFund);
    seller.projPayable = round2(Object.values(seller.skuData).reduce((sum, sku) => sum + sku.projPayable, 0));
    seller.penetration = seller.checks > 0 ? seller.units / seller.checks * 100 : null;
    seller.unitsPerCheck = seller.checks > 0 ? seller.units / seller.checks : null;
    seller.activeDays = Object.values(seller.daily).filter(v => v > 0).length;
    seller.maxDay = Math.max(0, ...Object.values(seller.daily));
    seller.share = totalUnits > 0 ? seller.units / totalUnits * 100 : 0;
  });

  sellers.sort((a,b) => {
    if (a.key === UNKNOWN_KEY) return 1;
    if (b.key === UNKNOWN_KEY) return -1;
    return b.accrued - a.accrued || b.units - a.units || a.name.localeCompare(b.name, 'ru');
  });
  sellers.forEach((seller, i) => seller.rank = i + 1);

  const planUnits = skuMetrics.reduce((a,x) => a + x.plan, 0);
  const projectedUnits = round2(skuMetrics.reduce((a,x) => a + x.projectedUnits, 0));
  const currentBase = round2(skuMetrics.reduce((a,x) => a + x.currentBase, 0));
  const currentFund = round2(skuMetrics.reduce((a,x) => a + x.currentFund, 0));
  const projectedBase = round2(skuMetrics.reduce((a,x) => a + x.projectedBase, 0));
  const projectedFund = round2(skuMetrics.reduce((a,x) => a + x.projectedFund, 0));
  const accruedTotal = round2(currentBase + currentFund);
  const projectedAccruedTotal = round2(projectedBase + projectedFund);
  const payableTotal = round2(sellers.reduce((a,x) => a + x.payable, 0));
  const projectedPayableTotal = round2(sellers.reduce((a,x) => a + x.projPayable, 0));
  const requiredToPlan = Math.max(0, Math.ceil(planUnits - totalUnits));
  const maxDailySellerUnits = Math.max(0, ...sellers.map(x => x.maxDay));
  /* Темп и прогноз «нужно в день» считаем по фактическим дням продаж каждой позиции (учитывая периоды «с — по») */
  const paceUnitsPerDay = skuMetrics.reduce((sum, sku) => sum + (sku.skuElapsedDays > 0 ? sku.units / sku.skuElapsedDays : 0), 0);
  const totalsPerDayToPlan = skuMetrics.reduce((sum, sku) => sum + (sku.skuRemainingDays > 0 ? sku.requiredToPlan / sku.skuRemainingDays : 0), 0);

  let cum = 0;
  const dailySeries = allDates.map((d, i) => {
    const imported = importedSet.has(d);
    const units = byDate[d] || 0;
    if (imported) cum += units;
    return {
      date: d,
      imported,
      future: d > today,
      unitsOrZero: units,
      units: imported ? units : null,
      cumulative: imported ? round2(cum) : null,
      planCumulative: planUnits > 0 ? round2(skuMetrics.reduce((a,x) => a + x.planCumByDate[d], 0)) : 0,
      requiredPerDay: totalsPerDayToPlan
    };
  });

  const totals = {
    planUnits,
    units: totalUnits,
    achievement: planUnits > 0 ? totalUnits / planUnits * 100 : 0,
    projectedUnits,
    projectedAchievement: planUnits > 0 ? projectedUnits / planUnits * 100 : 0,
    requiredToPlan,
    perDayToPlan: totalsPerDayToPlan,
    paceUnitsPerDay,
    thresholdsReached: skuMetrics.filter(x => x.thresholdReached).length,
    projectedThresholdsReached: skuMetrics.filter(x => x.projectedThresholdReached).length,
    revenue: round2(skuMetrics.reduce((a,x) => a + x.revenue, 0)),
    currentBase,
    currentFund,
    accruedTotal,
    payableTotal,
    projectedBase,
    projectedFund,
    projectedAccruedTotal,
    projectedPayableTotal,
    storePenetration: storeChecks > 0 ? totalUnits / storeChecks * 100 : null,
    targetPenetration: (Number(s.planChecks) > 0 && planUnits > 0) ? planUnits / Number(s.planChecks) * 100 : null
  };

  return {
    startDate, endDate, allDates, today, importedSet, expectedDates, missingDates, daysWithData,
    elapsedDays, remainingDays, totalDays: allDates.length, checksMissingDates,
    skuMetrics, sellers, totals, dailySeries, byDate, storeChecks, unmappedCount, unmappedQty,
    minPayout, maxDailySellerUnits
  };
}

/* ============================= 1C PARSER ============================= */

function parseRussianDate(text){
  const numeric = String(text).match(/\b(\d{1,2}\.\d{1,2}\.\d{4})\b/);
  if (numeric) { const d = SoldieRules.date(numeric[1]); if (d) return toISO(d); }
  const m = String(text).match(/(\d{1,2})\s+([а-яёa-z]+)\s+(\d{4})/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const word = m[2].toLowerCase();
  const year = parseInt(m[3], 10);
  const idx = MONTH_STEMS.findIndex(st => word.startsWith(st));
  if (idx < 0 || day < 1 || day > 31 || year < 2000) return null;
  const iso = year + '-' + String(idx + 1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
  return SoldieRules.date(iso) ? iso : null;
}

function findReportDate(rows){
  const limit = Math.min(rows.length, 40);
  for (let i=0; i<limit; i++){
    const text = (rows[i] || []).map(c => String(c == null ? '' : c)).join(' ');
    if (/период/i.test(text) || /\d{1,2}\s+[а-яё]+\s+\d{4}/i.test(text)){
      const d = parseRussianDate(text);
      if (d) return d;
    }
  }
  for (let i=0; i<limit; i++){
    const text = (rows[i] || []).map(c => String(c == null ? '' : c)).join(' ');
    const d = parseRussianDate(text);
    if (d) return d;
  }
  return null;
}

function normalizeHeaderCell(v){
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

function findHeader(rows){
  const limit = Math.min(rows.length, 120);
  let includeCandidate = null;

  for (let i=0; i<limit; i++){
    const rawCells = rows[i] || [];
    const cells = rawCells.map(normalizeHeaderCell);

    let exactLabel = -1, exactQty = -1, exactSum = -1;
    let inclLabel = -1, inclQty = -1, inclSum = -1, inclSumAny = -1;

    cells.forEach((c, idx) => {
      const original = String(rawCells[idx] == null ? '' : rawCells[idx]);
      if (!c || c.length > 60 || original.includes('\n')) return;
      const n = c.toLowerCase();

      if (exactLabel < 0 && ['номенклатура.код','номенклатура код','код','артикул','номенклатура.артикул'].includes(n)) exactLabel = idx;
      if (exactQty < 0 && ['количество товаров','количество','кол-во товаров','кол. товаров','кол во товаров'].includes(n)) exactQty = idx;
      if (exactSum < 0 && ['сумма продаж со скидкой','сумма со скидкой','сумма продажи со скидкой'].includes(n)) exactSum = idx;

      if (inclLabel < 0 && ((n.includes('номенклатура') && n.includes('код')) || n.includes('артикул'))) inclLabel = idx;
      if (inclQty < 0 && n.includes('количество')) inclQty = idx;
      if (inclSum < 0 && n.includes('сумма') && n.includes('со скидкой')) inclSum = idx;
      if (inclSumAny < 0 && n.includes('сумма')) inclSumAny = idx;
    });

    if (exactLabel >= 0 && exactQty >= 0 && exactLabel !== exactQty) {
      let sumCol = exactSum;
      if (sumCol < 0 || sumCol === exactLabel || sumCol === exactQty) sumCol = inclSum;
      if (sumCol < 0 || sumCol === exactLabel || sumCol === exactQty) sumCol = inclSumAny;
      if (sumCol < 0 || sumCol === exactLabel || sumCol === exactQty) sumCol = exactQty + 2;
      return { rowIndex:i, labelCol:exactLabel, qtyCol:exactQty, sumCol, detected:true };
    }

    if (!includeCandidate && inclLabel >= 0 && inclQty >= 0 && inclLabel !== inclQty) {
      let sumCol = inclSum;
      if (sumCol < 0 || sumCol === inclLabel || sumCol === inclQty) sumCol = inclSumAny;
      if (sumCol < 0 || sumCol === inclLabel || sumCol === inclQty) sumCol = inclQty + 2;
      includeCandidate = { rowIndex:i, labelCol:inclLabel, qtyCol:inclQty, sumCol, detected:true };
    }
  }

  return includeCandidate;
}

function isHeaderOrTotalLabel(label){
  const l = String(label || '').trim().toLowerCase();
  if (!l) return true;
  const exact = ['итого','продавец','номенклатура','номенклатура.код','количество товаров','сумма продаж без скидки','сумма продаж со скидкой','средняя стоимость без скидки','средняя стоимость со скидкой','продажи'];
  if (exact.includes(l)) return true;
  return l.startsWith('итого') || l.startsWith('период:') || l.startsWith('группировки') || l.startsWith('показатели');
}

function isFioLike(label){
  const clean = String(label || '').replace(/[«»"'.,;:!?()[\]\/]/g,' ').replace(/\s+/g,' ').trim();
  if (clean.length < 5 || clean.length > 60) return false;
  if (/\d/.test(clean)) return false;
  const words = clean.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  return words.every(w => /^[\p{Lu}][\p{Ll}\p{L}'’-]+$/u.test(w));
}

function isLikelyArticle(label, knownArticles, hasPending){
  const s = String(label || '').trim();
  if (!s || s.length > 30 || /\s/.test(s)) return false;
  const n = normArticle(s);
  if (knownArticles.has(n)) return true;
  if (!/[0-9]/.test(s)) return false;
  if (!/^[0-9A-Za-zА-Яа-яЁё][0-9A-Za-zА-Яа-яЁё\-\/\.]*$/.test(s)) return false;
  return Boolean(hasPending) || s.includes('-') || /^\d+$/.test(s);
}

function getNextLabel(rows, start, labelCol){
  for (let i=start; i<Math.min(rows.length, start+4); i++){
    const label = String((rows[i] || [])[labelCol] == null ? '' : (rows[i] || [])[labelCol]).trim();
    if (label && !isHeaderOrTotalLabel(label)) return label;
  }
  return '';
}

function extractRecords(rows, start, header, date){
  const knownEmployees = new Set(state.settings.employees.map(e => normName(e.name)).filter(Boolean));
  const knownArticles = new Set(allArticles().map(normArticle));
  let currentSeller = '';
  let pending = null;
  const raw = [];

  for (let i=start; i<rows.length; i++){
    const row = rows[i] || [];
    const label = String(row[header.labelCol] == null ? '' : row[header.labelCol]).trim();
    const qty = parseNumericCell(row[header.qtyCol]);
    const sum = header.sumCol >= 0 ? parseNumericCell(row[header.sumCol]) : null;

    if (!label) { pending = null; continue; }
    if (isHeaderOrTotalLabel(label)) { pending = null; continue; }

    const knownKey = normName(label);
    const nextLabel = getNextLabel(rows, i + 1, header.labelCol);
    const knownSeller = knownKey && knownEmployees.has(knownKey);
    let sellerRow = knownSeller;

    if (!sellerRow && !isLikelyArticle(label, knownArticles, false) && isFioLike(label)) {
      sellerRow = !(nextLabel && isLikelyArticle(nextLabel, knownArticles, false));
    }

    if (sellerRow) {
      currentSeller = label;
      pending = null;
      continue;
    }

    if (isLikelyArticle(label, knownArticles, pending)) {
      const useQty = qty != null ? qty : (pending ? pending.qty : 0);
      const useSum = sum != null ? sum : (pending ? pending.sum : 0);
      if (useQty !== 0) {
        raw.push({
          date: date || '',
          seller: currentSeller || '',
          article: label,
          name: pending ? pending.name : '',
          qty: useQty,
          sum: useSum || 0
        });
      }
      pending = null;
      continue;
    }

    if (qty != null && qty !== 0) pending = { name: label, qty, sum: sum || 0 };
    else pending = null;
  }

  return aggregateRecords(raw);
}

function aggregateRecords(records){
  const map = new Map();
  records.forEach(r => {
    const key = [r.date || '', sellerKeyFromName(r.seller), normArticle(r.article), Number(r.qty) < 0 ? 'return' : 'sale'].join('|');
    const ex = map.get(key);
    if (ex) {
      ex.qty = round2(ex.qty + (Number(r.qty) || 0));
      ex.sum = round2(ex.sum + (Number(r.sum) || 0));
      if (!ex.name && r.name) ex.name = r.name;
    } else {
      map.set(key, {
        date: r.date || '',
        seller: r.seller || '',
        article: String(r.article || '').trim(),
        name: r.name || '',
        qty: round2(Number(r.qty) || 0),
        sum: round2(Number(r.sum) || 0)
      });
    }
  });
  return [...map.values()];
}

async function parseSalesFile(file){
  const result = {
    fileName: file.name,
    date: null,
    dateDetected: false,
    records: [],
    error: null,
    warnings: [],
    header: null,
    totalQty: 0,
    mappedQty: 0,
    mappedCount: 0,
    bySku: {},
    sellers: [],
    newSellers: [],
    unknownArticles: [],
    hasUnknownSeller: false
  };

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array' });
    let chosen = null;

    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, raw:false, defval:'' });
      if (!rows.length) continue;
      const date = findReportDate(rows);
      const header = findHeader(rows);
      if (header) { chosen = { rows, date, header, sheetName }; break; }
      if (date && (!chosen || !chosen.date)) chosen = { rows, date, header:null, sheetName };
      if (!chosen) chosen = { rows, date, header:null, sheetName };
    }

    if (!chosen) { result.error = 'Не найдено ни одного листа с данными'; return result; }

    const header = chosen.header || { rowIndex:-1, labelCol:0, qtyCol:1, sumCol:3, detected:false };
    let start = header.rowIndex + 1;

    if (!header.detected) {
      const markerIdx = chosen.rows.findIndex(r => (r || []).some(c => /показатели:|группировки строк:/i.test(String(c == null ? '' : c))));
      start = markerIdx >= 0 ? markerIdx + 1 : 0;
      result.warnings.push('Заголовок «Номенклатура.Код / Количество товаров» не найден. Использую по умолчанию: столбец 1 — артикул, столбец 2 — количество. Проверьте контрольные строки ниже.');
    }

    result.header = header;
    result.date = chosen.date || '';
    result.dateDetected = Boolean(chosen.date);
    result.records = extractRecords(chosen.rows, start, header, result.date);

    if (!result.dateDetected) result.warnings.push('Дата в файле не найдена. Укажите дату вручную.');
    if (!result.records.length) result.warnings.push('В файле нет продаж. Если это корректный нулевой дневной отчёт, подтвердите импорт — день будет отмечен загруженным.');

    const skuByArticle = buildArticleMap(state.settings.skus);
    const unknownArticles = new Set();
    const sellers = new Set();

    result.records.forEach(r => {
      result.totalQty += Number(r.qty) || 0;
      const skuId = skuByArticle.get(normArticle(r.article));
      if (skuId) {
        result.mappedCount++;
        result.mappedQty += Number(r.qty) || 0;
        result.bySku[skuId] = (result.bySku[skuId] || 0) + (Number(r.qty) || 0);
      } else {
        unknownArticles.add(r.article);
      }
      if (r.seller) sellers.add(r.seller);
      else result.hasUnknownSeller = true;
    });

    result.sellers = [...sellers];
    result.unknownArticles = [...unknownArticles];
    result.newSellers = result.sellers.filter(name => !findEmployeeByName(name) && isFioLike(name));

    if (!state.settings.skus.length) result.warnings.push('В настройках нет товарных позиций — акционные продажи не будут распознаны.');
    if (!result.mappedCount && result.records.length) result.warnings.push('Ни один артикул из файла не сопоставлен с акционными SKU. Все продажи сохранятся, но в мотивацию пока не попадут.');
    if (result.unknownArticles.length) result.warnings.push('Найдены артикулы вне акции: ' + result.unknownArticles.length + ' уникальных.');
    if (result.hasUnknownSeller) result.warnings.push('Часть строк не имеет продавца. Они сохранятся в истории продаж, но не войдут в план и начисления 3SKU.');
    if (result.date && (result.date < state.settings.startDate || result.date > state.settings.endDate)) {
      result.warnings.push('Дата ' + formatFullDate(result.date) + ' вне периода акции. Данные сохранятся, но в расчёт месяца не попадут.');
    }
  } catch(e) {
    result.error = 'Ошибка чтения файла: ' + (e && e.message ? e.message : e);
  }

  return result;
}

async function handleImportFiles(files){
  await stateReadyPromise;
  if (!storeReady) { showToast('Хранилище не загружено. Сначала восстановите JSON.', 'error'); return; }
  if (!files || !files.length) return;
  const body = document.getElementById('importBody');
  if (body) body.innerHTML = '<div class="empty-state"><strong>Обрабатываю файлы…</strong><div class="muted">Ищу дату, заголовок 1С, продавцов, товары и коды</div></div>';
  openModal('importModal');
  pendingImports = [];
  for (const file of files) {
    const parsed = await parseSalesFile(file);
    pendingImports.push(parsed);
  }
  renderImportPreview();
}

/* ============================= RENDER ============================= */

function renderAll(){
  persist('debounced');
  const m = computeMetrics();
  Object.keys(charts).forEach(destroyChart);
  renderHeader(m);
  renderAlerts(m);
  renderTabs();
  if (currentTab === 'overview') renderOverview(m);
  else if (currentTab === 'team') renderTeam(m);
  else if (currentTab === 'dayday') renderDayDay(m);
}

function renderTabs(){
  // Область действия — только карточка 3SKU (#sku3Card), чтобы не конфликтовать
  // с внутренними вкладками раздела «Продажи» (js/sales.js).
  const root = document.getElementById('sku3Card') || document;
  root.querySelectorAll('[data-action="switch-tab"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === currentTab);
  });
  document.getElementById('tab-overview').hidden = currentTab !== 'overview';
  document.getElementById('tab-team').hidden = currentTab !== 'team';
  document.getElementById('tab-dayday').hidden = currentTab !== 'dayday';
}

function renderHeader(m){
  const status = m.missingDates.length
    ? chip('Пропущено ' + m.missingDates.length + ' дн.', 'danger')
    : (m.daysWithData > 0 ? chip('Данные полные', 'success') : chip('Нет импорта', 'warning'));
  document.getElementById('headerContent').innerHTML = `
    <div class="brand">
      <div class="logo">3SKU</div>
      <div>
        <h1>Мотивация 3 SKU</h1>
        <div class="muted">${esc(state.settings.storeName)} • ${esc(state.settings.monthName)}</div>
      </div>
    </div>
    <div class="header-stats">
      <div class="mini-stat"><span>Период</span><strong>${formatShortDate(m.startDate)} — ${formatShortDate(m.endDate)}</strong></div>
      <div class="mini-stat"><span>Загружено</span><strong>${m.daysWithData}/${m.totalDays} дн.</strong></div>
      <div class="mini-stat"><span>Выполнение</span><strong>${fmtPct(m.totals.achievement)}</strong></div>
      <div class="mini-stat"><span>К выплате</span><strong>${fmtMoney(m.totals.payableTotal)}</strong></div>
      ${status}
    </div>
    <div class="header-actions">
      <button class="btn btn-primary" data-action="open-import">Импорт продаж</button>
      <button class="btn" data-action="open-checks">Чеки</button>
      <button class="btn" data-action="open-settings">Настройки</button>
    </div>
  `;
}

function alertHtml(type, title, text, actions){
  return `<div class="alert alert-${type}"><div><strong>${esc(title)}</strong><div>${text}</div></div>${actions ? `<div class="alert-actions">${actions}</div>` : ''}</div>`;
}

function renderAlerts(m){
  const html = [];
  if (!state.settings.skus.length) {
    html.push(alertHtml('danger','Нет товарных позиций','Добавьте SKU, артикулы, план, ставки и порог.', '<button class="btn btn-sm btn-primary" data-action="open-settings">Настроить</button>'));
  } else if (m.totals.planUnits <= 0) {
    html.push(alertHtml('warning','План не задан','Укажите план в штуках хотя бы для одной позиции.', '<button class="btn btn-sm" data-action="open-settings">Настройки</button>'));
  }
  if (!state.sales.length) {
    html.push(alertHtml('info','Продажи ещё не загружены','Загрузите ежедневный отчёт 1С, чтобы увидеть план/факт, выплаты и прогноз.', '<button class="btn btn-sm btn-primary" data-action="open-import">Импорт</button>'));
  }
  if (m.missingDates.length) {
    const list = m.missingDates.slice(0,10).map(d => formatShortDate(d)).join(', ') + (m.missingDates.length > 10 ? '…' : '');
    html.push(alertHtml('danger','Не хватает данных за ' + m.missingDates.length + ' дн.', 'Отсутствуют загрузки: <strong>' + esc(list) + '</strong>. Прогноз и мотивация могут быть неполными.', '<button class="btn btn-sm" data-action="open-import">Загрузить</button>'));
  }
  if (m.checksMissingDates.length) {
    const list = m.checksMissingDates.slice(0,10).map(d => formatShortDate(d)).join(', ') + (m.checksMissingDates.length > 10 ? '…' : '');
    html.push(alertHtml('warning','Не введены чеки за ' + m.checksMissingDates.length + ' дн.', 'Даты: <strong>' + esc(list) + '</strong>. Без чеков 3SKU на 100 чеков и нагрузка на кассира не рассчитываются.', '<button class="btn btn-sm" data-action="open-checks">Ввести чеки</button>'));
  }
  const unknownSeller = m.sellers.find(s => s.key === UNKNOWN_KEY && s.units > 0);
  if (unknownSeller) {
    html.push(alertHtml('warning','Есть акционные продажи без продавца','Количество: <strong>' + fmtNum(unknownSeller.units) + ' шт</strong>. Начисления попали в «Продавец не определён». Проверьте структуру отчёта или справочник сотрудников.', '<button class="btn btn-sm" data-action="open-settings">Сотрудники</button>'));
  }
  if (m.unmappedCount > 0) {
    html.push(alertHtml('info','В общем отчёте есть продажи вне акции','Сохранено <strong>' + fmtNum(m.unmappedCount) + '</strong> строк с другими артикулами на <strong>' + fmtNum(m.unmappedQty) + ' шт</strong>. Это нормально для общего отчёта 1С. Если какой-то артикул должен участвовать в акции — добавьте его в настройки.', '<button class="btn btn-sm" data-action="open-settings">Настройки</button>'));
  }
  document.getElementById('alerts').innerHTML = html.join('');
}

function kpiCard(icon, label, value, sub, progress, status){
  const st = status || 'primary';
  const fillClass = st === 'success' ? 'success' : st === 'warning' ? 'warning' : st === 'danger' ? 'danger' : '';
  return `
    <div class="card kpi-card ${st}">
      <div class="kpi-top">
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-icon">${icon}</div>
      </div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${sub}</div>
      ${progress == null ? '' : `<div class="progress"><span class="progress-fill ${fillClass}" style="width:${clampWidth(progress)}%"></span></div>`}
    </div>
  `;
}

function renderOverview(m){
  const t = m.totals;
  const achievementStatus = t.achievement >= 100 ? 'success' : (t.achievement >= 70 ? 'warning' : 'danger');
  const projectedStatus = t.projectedAchievement >= 100 ? 'success' : (t.projectedAchievement >= 70 ? 'warning' : 'danger');
  const pace = t.paceUnitsPerDay;
  const checkProgress = state.settings.planChecks > 0 && m.storeChecks > 0 ? (m.storeChecks / state.settings.planChecks * 100) : null;

  document.getElementById('overviewKpis').innerHTML = [
    kpiCard('📦','Продано по акции', fmtNum(t.units) + ' шт', `План ${fmtNum(t.planUnits)} шт • выполнение ${fmtPct(t.achievement)}`, t.achievement, achievementStatus),
    kpiCard('🔮','Прогноз на конец месяца', fmtNum(t.projectedUnits) + ' шт', `Прогноз ${fmtPct(t.projectedAchievement)} • текущий темп ${fmtNum(pace,1)} шт/день`, t.projectedAchievement, projectedStatus),
    kpiCard('🎯','Нужно продавать в день', fmtNum(t.perDayToPlan,1) + ' шт', `До 100% осталось ${fmtNum(t.requiredToPlan)} шт • осталось ${m.remainingDays} дн.`, null, t.requiredToPlan > 0 ? 'warning' : 'success'),
    kpiCard('🏁','Пороги по SKU', `${t.thresholdsReached}/${m.skuMetrics.length}`, `Прогнозно: ${t.projectedThresholdsReached}/${m.skuMetrics.length} • фонд включается по каждой позиции отдельно`, m.skuMetrics.length ? t.thresholdsReached / m.skuMetrics.length * 100 : 0, t.thresholdsReached === m.skuMetrics.length && m.skuMetrics.length ? 'success' : 'warning'),
    kpiCard('💰','К выплате сейчас', fmtMoney(t.payableTotal), `Начислено ${fmtMoney(t.accruedTotal)} • фонд кассирам ${fmtMoney(t.currentFund)} • прогноз ${fmtMoney(t.projectedPayableTotal)}`, null, 'success'),
    kpiCard('🧾','Чеки и 3SKU на 100 чеков', m.storeChecks > 0 ? fmtNum(m.storeChecks) : '—', m.storeChecks > 0
      ? `3SKU на 100 чеков ${fmtPct(t.storePenetration)} • план чеков ${fmtNum(state.settings.planChecks)}`
      : 'Введите чеки вручную для расчёта 3SKU на 100 чеков', checkProgress, 'info')
  ].join('');

  document.getElementById('cumulativeChip').textContent = t.units > 0 ? fmtPct(t.achievement) + ' от плана' : 'нет данных';
  document.getElementById('dailyChip').textContent = m.daysWithData + ' из ' + m.totalDays + ' дн.';
  document.getElementById('minPayoutChip').textContent = 'Минимум по каждой SKU: ' + fmtMoney(m.minPayout) + ' · ниже минимума не выплачивается и не переносится';

  document.getElementById('skuCards').innerHTML = m.skuMetrics.length ? m.skuMetrics.map(sku => {
    const status = sku.thresholdReached ? 'success' : (sku.projectedThresholdReached ? 'warning' : 'danger');
    const payoutNow = round2(sku.currentBase + sku.currentFund);
    const payoutProj = round2(sku.projectedBase + sku.projectedFund);
    const articlesPreview = sku.articles.length
      ? sku.articles.slice(0,5).join(', ') + (sku.articles.length > 5 ? ' +' + (sku.articles.length - 5) : '')
      : 'артикулы не заданы';
    return `
      <div class="card sku-card">
        <div class="sku-head">
          <div>
            ${chip(sku.thresholdReached ? 'Порог ' + fmtNum(sku.threshold,0) + '% взят' : 'Порог ' + fmtNum(sku.threshold,0) + '%', status)}
            ${sku.range ? chip('Продажи: ' + sku.saleRangeText, 'info') : ''}
            <div class="sku-title">${esc(sku.name)}</div>
            <div class="muted small">${esc(articlesPreview)}</div>
          </div>
          <div style="text-align:right">
            <div class="small muted">Начислено</div>
            <strong style="font-size:20px">${fmtMoney(payoutNow)}</strong>
          </div>
        </div>
        <div class="big-number">${fmtNum(sku.units)} <span>/ ${fmtNum(sku.plan)} шт</span></div>
        <div class="progress">
          <span class="progress-fill ${status}" style="width:${clampWidth(sku.achievement)}%"></span>
          <span class="threshold-marker" style="left:${clampWidth(sku.threshold)}%"></span>
        </div>
        <div class="stat-grid">
          <div class="stat-box"><span>Выполнение</span><strong>${fmtPct(sku.achievement)}</strong></div>
          <div class="stat-box"><span>Прогноз</span><strong>${fmtPct(sku.projectedAchievement)}</strong></div>
          <div class="stat-box"><span>До порога</span><strong>${sku.requiredToThreshold > 0 ? fmtNum(sku.requiredToThreshold) + ' шт' : 'взят'}</strong></div>
          <div class="stat-box"><span>До плана</span><strong>${sku.requiredToPlan > 0 ? fmtNum(sku.requiredToPlan) + ' шт' : 'выполнен'}</strong></div>
          <div class="stat-box"><span>Нужно/день</span><strong>${fmtNum(sku.perDayToPlan,1)} шт</strong></div>
          <div class="stat-box"><span>До порога/день</span><strong>${fmtNum(sku.perDayToThreshold,1)} шт</strong></div>
        </div>
        <div class="note">
          Кассир: <strong>${fmtNum(sku.cashierRate,2)} ₽/шт</strong> •
          Фонд: <strong>${fmtNum(sku.fundRate,2)} ₽/шт</strong> •
          Прогноз выплат: <strong>${fmtMoney(payoutProj)}</strong>
          ${sku.range ? `<br>Период продаж: <strong>${esc(sku.saleRangeText)}</strong> • расчёты и план — только по этим дням (${sku.skuDates.length} дн.)` : ''}
          ${sku.targetPenetration != null ? `<br>Целевая 3SKU на 100 чеков-оценка: <strong>${fmtPct(sku.targetPenetration,2)}</strong>` : ''}
        </div>
      </div>
    `;
  }).join('') : '<div class="card empty-state"><strong>Товарные позиции не настроены</strong><div class="muted">Откройте настройки и добавьте SKU, артикулы, план и ставки.</div></div>';

  const payoutSellers = m.sellers.filter(s => s.units > 0 || s.accrued > 0 || s.checks > 0 || s.key === UNKNOWN_KEY);
  document.getElementById('payoutTable').innerHTML = payoutSellers.length ? `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th><th>Сотрудник</th><th class="num">Шт</th><th class="num">Вклад</th>
          <th class="num">База</th><th class="num">Фонд</th><th class="num">Начислено</th>
          <th class="num">К выплате</th><th class="num">Прогноз</th><th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${payoutSellers.map(s => {
          const status = s.payable > 0
            ? chip('Выплачивается', 'success')
            : (s.accrued > 0 ? chip('Нет ' + fmtMoney(s.shortfall) + ' до порога', 'warning') : chip('Нет продаж', 'neutral'));
          return `<tr class="clickable" data-action="select-seller" data-seller="${encodeURIComponent(s.key)}">
            <td><strong>${s.rank}</strong></td>
            <td class="seller-cell"><strong>${esc(s.name)}</strong><div>${sellerBadges(m,s)}</div></td>
            <td class="num">${fmtNum(s.units)}</td>
            <td class="num">${fmtPct(s.share)}</td>
            <td class="num">${fmtMoney(s.base)}</td>
            <td class="num">${fmtMoney(s.fund)}</td>
            <td class="num"><strong>${fmtMoney(s.accrued)}</strong></td>
            <td class="num" style="color:${s.payable > 0 ? '#047857' : '#b45309'};font-weight:800">${fmtMoney(s.payable)}</td>
            <td class="num">${fmtMoney(s.projPayable)}</td>
            <td>${status}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2">Итого</td>
          <td class="num">${fmtNum(m.totals.units)}</td>
          <td class="num">100%</td>
          <td class="num">${fmtMoney(m.totals.currentBase)}</td>
          <td class="num">${fmtMoney(m.totals.currentFund)}</td>
          <td class="num">${fmtMoney(m.totals.accruedTotal)}</td>
          <td class="num">${fmtMoney(m.totals.payableTotal)}</td>
          <td class="num">${fmtMoney(m.totals.projectedPayableTotal)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  ` : '<div class="empty-state"><strong>Пока нет данных для расчёта выплат</strong><div class="muted">Загрузите продажи и введите чеки.</div></div>';

  const top = m.sellers.filter(s => s.key !== UNKNOWN_KEY).slice(0,3);
  document.getElementById('leaderboard').innerHTML = top.length ? `<div class="leader-grid">${top.map(s => {
    const medals = ['🥇','🥈','🥉'];
    return `
      <div class="leader-card clickable" data-action="select-seller" data-seller="${encodeURIComponent(s.key)}">
        <div class="leader-medal">${medals[s.rank-1] || '🏅'}</div>
        <div style="font-size:18px;font-weight:800;margin-bottom:6px">${esc(s.name)}</div>
        <div class="muted small" style="margin-bottom:12px">${fmtNum(s.units)} шт • вклад ${fmtPct(s.share)} • ${fmtNum(s.activeDays)} дн.</div>
        <div class="big-number" style="font-size:26px;margin-bottom:8px">${fmtMoney(s.payable)}</div>
        <div class="progress"><span class="progress-fill success" style="width:${clampWidth(s.share)}%"></span></div>
        <div style="margin-top:10px">${sellerBadges(m,s)}</div>
      </div>
    `;
  }).join('')}</div>` : '<div class="empty-state"><strong>Лидеров пока нет</strong><div class="muted">Появятся после первой загрузки продаж.</div></div>';

  renderOverviewCharts(m);
}

function sellerBadges(m, s){
  const badges = [];
  if (s.rank === 1 && s.units > 0) badges.push(badge('🥇 Лидер','gold'));
  else if (s.rank === 2 && s.units > 0) badges.push(badge('🥈 2 место','silver'));
  else if (s.rank === 3 && s.units > 0) badges.push(badge('🥉 3 место','bronze'));
  if (s.payable > 0) badges.push(badge('Порог выплаты','success'));
  else if (s.shortfall > 0 && s.shortfall <= 50) badges.push(badge('Осталось ' + fmtMoney(s.shortfall),'warning'));
  if (s.activeDays >= Math.max(2, Math.ceil(m.daysWithData * 0.8)) && s.units > 0) badges.push(badge('Стабильность','primary'));
  if (s.maxDay > 0 && m.maxDailySellerUnits > 0 && s.maxDay >= m.maxDailySellerUnits) badges.push(badge('Прорыв дня','accent'));
  if (s.penetration != null && m.totals.targetPenetration && s.penetration >= m.totals.targetPenetration) badges.push(badge('3SKU на 100 чеков','success'));
  if (s.units > 0 && s.activeDays === 1 && m.daysWithData > 2) badges.push(badge('Разовый всплеск','neutral'));
  return badges.slice(0,4).join('');
}

function renderTeam(m){
  const activeSellers = m.sellers.filter(s => s.units > 0);
  const paidSellers = m.sellers.filter(s => s.payable > 0);
  const avgPenetration = m.totals.storePenetration;
  const leader = m.sellers.find(s => s.key !== UNKNOWN_KEY && s.units > 0);
  const unitsPerCheck = m.storeChecks > 0 ? m.totals.units / m.storeChecks : null;

  document.getElementById('teamKpis').innerHTML = [
    kpiCard('👥','Активные кассиры', String(activeSellers.length), `В справочнике ${getActiveSellers().length} • с продажами ${activeSellers.length}`, activeSellers.length / Math.max(1,getActiveSellers().length) * 100, 'primary'),
    kpiCard('🏆','Лидер', leader ? shortName(leader.name) : '—', leader ? fmtNum(leader.units) + ' шт • ' + fmtMoney(leader.accrued) : 'Нет продаж', leader ? leader.share : 0, 'success'),
    kpiCard('🧾','3SKU на 100 чеков магазина', avgPenetration == null ? '—' : fmtPct(avgPenetration), `Целевая оценка ${m.totals.targetPenetration == null ? '—' : fmtPct(m.totals.targetPenetration)} • чеки ${fmtNum(m.storeChecks)}`, avgPenetration && m.totals.targetPenetration ? avgPenetration / m.totals.targetPenetration * 100 : null, 'info'),
    kpiCard('⚡','Штук на чек', unitsPerCheck == null ? '—' : fmtNum(unitsPerCheck,2), `Продажи ${fmtNum(m.totals.units)} шт / чеки ${fmtNum(m.storeChecks)}`, null, 'primary'),
    kpiCard('💸','Порог 100 ₽ взяли', String(paidSellers.length), `Не получили выплату: ${m.sellers.filter(s => s.accrued > 0 && s.payable === 0).length}`, m.sellers.length ? paidSellers.length / m.sellers.length * 100 : 0, 'success'),
    kpiCard('🔥','Максимум за день', fmtNum(m.maxDailySellerUnits) + ' шт', 'Лучший личный дневной результат', null, 'warning')
  ].join('');

  const rows = m.sellers;
  document.getElementById('teamTable').innerHTML = rows.length ? `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th><th>Сотрудник</th><th class="num">Дни</th><th class="num">Шт</th><th class="num">Вклад</th>
          <th class="num">Шт/день</th><th class="num">Чеки</th><th class="num">3SKU на 100 чеков</th>
          <th class="num">Начислено</th><th class="num">К выплате</th><th class="num">Прогноз</th><th>Бейджи</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(s => `<tr class="clickable ${selectedSeller === s.key ? 'selected' : ''}" data-action="select-seller" data-seller="${encodeURIComponent(s.key)}">
          <td><strong>${s.rank}</strong></td>
          <td class="seller-cell"><strong>${esc(s.name)}</strong><div class="muted small">макс. день: ${fmtNum(s.maxDay)} шт</div></td>
          <td class="num">${fmtNum(s.activeDays)}</td>
          <td class="num">${fmtNum(s.units)}</td>
          <td class="num">${fmtPct(s.share)}</td>
          <td class="num">${fmtNum(m.elapsedDays > 0 ? s.units / m.elapsedDays : 0,1)}</td>
          <td class="num">${s.checks > 0 ? fmtNum(s.checks) : '—'}</td>
          <td class="num">${s.penetration == null ? '—' : fmtPct(s.penetration)}</td>
          <td class="num">${fmtMoney(s.accrued)}</td>
          <td class="num" style="font-weight:800;color:${s.payable ? '#047857' : '#94a3b8'}">${fmtMoney(s.payable)}</td>
          <td class="num">${fmtMoney(s.projPayable)}</td>
          <td>${sellerBadges(m,s)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  ` : '<div class="empty-state"><strong>Нет сотрудников</strong></div>';

  renderHeatmap(m);
  renderSelectedSeller(m);
}

function renderHeatmap(m){
  const dates = m.allDates;
  const sellers = m.sellers.filter(s => s.units > 0 || s.checks > 0 || s.key !== UNKNOWN_KEY);
  if (!dates.length || !sellers.length) {
    document.getElementById('heatmap').innerHTML = '<div class="empty-state"><strong>Тепловая карта пока пуста</strong></div>';
    return;
  }
  const allValues = sellers.flatMap(s => dates.map(d => s.daily[d] || 0));
  const max = Math.max(1, ...allValues);
  const gridStyle = `grid-template-columns:220px repeat(${dates.length}, minmax(30px, 1fr))`;
  let html = `<div class="heatmap-wrap"><div class="heatmap" style="${gridStyle}">`;
  html += `<div class="heat-name"></div>` + dates.map(d => `<div class="heat-head" title="${formatFullDate(d)}">${parseISO(d).getDate()}</div>`).join('');

  sellers.forEach(s => {
    html += `<div class="heat-name" title="${esc(s.name)}">${esc(s.name)}</div>`;
    dates.forEach(d => {
      const v = s.daily[d] || 0;
      const imported = m.importedSet.has(d);
      const future = d > m.today;
      let cls = 'heat-cell';
      let style = '';
      if (future) cls += ' future';
      else if (!imported) cls += ' missing';
      else if (v > 0) {
        const alpha = 0.16 + 0.84 * (v / max);
        style = `background:rgba(79,70,229,${alpha.toFixed(2)});color:${alpha > .55 ? '#fff' : '#312e81'};border-color:rgba(79,70,229,.18)`;
      }
      html += `<div class="${cls}" style="${style}" title="${esc(s.name)} • ${formatFullDate(d)} • ${fmtNum(v)} шт">${v > 0 ? fmtNum(v) : ''}</div>`;
    });
  });

  html += `<div class="heat-name"><strong>Итого по магазину</strong></div>`;
  dates.forEach(d => {
    const v = m.byDate[d] || 0;
    const imported = m.importedSet.has(d);
    const cls = 'heat-cell ' + (v > 0 ? 'heat-total' : (d > m.today ? 'future' : (imported ? 'empty' : 'missing')));
    html += `<div class="${cls}" title="${formatFullDate(d)} • ${fmtNum(v)} шт">${v > 0 ? fmtNum(v) : ''}</div>`;
  });
  html += '</div></div>';
  document.getElementById('heatmap').innerHTML = html;
}

function renderSelectedSeller(m){
  let seller = m.sellers.find(s => s.key === selectedSeller);
  if (!seller) seller = m.sellers.find(s => s.key !== UNKNOWN_KEY && s.units > 0) || m.sellers[0];
  if (!seller) {
    selectedSeller = null;
    document.getElementById('selectedSellerChip').textContent = 'нет данных';
    document.getElementById('selectedSellerInfo').innerHTML = '<div class="empty-state"><strong>Сотрудник не выбран</strong></div>';
    document.getElementById('sellerSkuBreakdown').innerHTML = '<div class="empty-state"><strong>Нет данных</strong></div>';
    return;
  }
  selectedSeller = seller.key;
  document.getElementById('selectedSellerChip').textContent = 'Ранг #' + seller.rank;
  document.getElementById('selectedSellerInfo').innerHTML = `
    <div style="font-size:22px;font-weight:800;margin-bottom:4px">${esc(seller.name)}</div>
    <div class="muted small" style="margin-bottom:14px">${sellerBadges(m,seller) || 'Бейджей пока нет'}</div>
    <div class="stat-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stat-box"><span>Штуки</span><strong>${fmtNum(seller.units)}</strong></div>
      <div class="stat-box"><span>Вклад</span><strong>${fmtPct(seller.share)}</strong></div>
      <div class="stat-box"><span>Начислено</span><strong>${fmtMoney(seller.accrued)}</strong></div>
      <div class="stat-box"><span>К выплате</span><strong>${fmtMoney(seller.payable)}</strong></div>
      <div class="stat-box"><span>Чеки</span><strong>${seller.checks ? fmtNum(seller.checks) : '—'}</strong></div>
      <div class="stat-box"><span>3SKU на 100 чеков</span><strong>${seller.penetration == null ? '—' : fmtPct(seller.penetration)}</strong></div>
      <div class="stat-box"><span>Активных дней</span><strong>${fmtNum(seller.activeDays)}</strong></div>
      <div class="stat-box"><span>Прогноз</span><strong>${fmtMoney(seller.projPayable)}</strong></div>
    </div>
  `;

  const skuRows = m.skuMetrics.map(sku => {
    const d = seller.skuData[sku.id] || { units:0, base:0, fundCurrent:0, accrued:0, projAccrued:0 };
    const share = seller.units > 0 ? d.units / seller.units * 100 : 0;
    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:6px">
          <strong>${esc(sku.name)}</strong>
          <span class="muted small">${fmtNum(d.units)} шт • ${fmtMoney(d.accrued || 0)} • прогноз ${fmtMoney(d.projAccrued || 0)}</span>
        </div>
        <div class="progress"><span class="progress-fill" style="width:${clampWidth(share)}%;background:${sku.color}"></span></div>
        <div class="note" style="margin-top:6px">К выплате по SKU: ${fmtMoney(d.payable || 0)}. На 100 чеков: ${seller.checks > 0 ? fmtNum(d.units / seller.checks * 100, 2) : '—'}. Личный вклад в продажи сотрудника: ${fmtPct(share)}. Доля в SKU: ${fmtPct(sku.units > 0 ? d.units / sku.units * 100 : 0)}.</div>
      </div>
    `;
  }).join('');
  document.getElementById('sellerSkuBreakdown').innerHTML = skuRows || '<div class="empty-state"><strong>Нет товарных позиций</strong></div>';

  renderSellerChart(m, seller);
}

/* ============================= CHARTS ============================= */

function destroyChart(key){
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function renderOverviewCharts(m){
  if (typeof Chart === 'undefined') return;
  const labels = m.dailySeries.map(d => formatShortDate(d.date));

  destroyChart('cumulative');
  const ctx1 = document.getElementById('cumulativeChart');
  if (ctx1) {
    charts.cumulative = new Chart(ctx1, {
      type:'line',
      data:{
        labels,
        datasets:[
          { label:'Факт', data:m.dailySeries.map(d => d.cumulative), borderColor:'#4f46e5', backgroundColor:'rgba(79,70,229,.10)', fill:true, tension:.35, pointRadius:2, borderWidth:3, spanGaps:false },
          { label:'План', data:m.dailySeries.map(d => d.planCumulative), borderColor:'#94a3b8', borderDash:[6,6], pointRadius:0, borderWidth:2, fill:false, tension:.2 }
        ]
      },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, scales:{ y:{ beginAtZero:true, grid:{ color:'#f1f5f9' } }, x:{ grid:{ display:false } } } }
    });
  }

  destroyChart('daily');
  const ctx2 = document.getElementById('dailyChart');
  if (ctx2) {
    const data = m.dailySeries.map(d => d.imported ? d.unitsOrZero : (d.future ? null : 0));
    const colors = m.dailySeries.map(d => d.imported ? (d.unitsOrZero > 0 ? 'rgba(79,70,229,.78)' : 'rgba(148,163,184,.25)') : (d.future ? 'rgba(148,163,184,.08)' : 'rgba(239,68,68,.18)'));
    charts.daily = new Chart(ctx2, {
      type:'bar',
      data:{
        labels,
        datasets:[
          { label:'Продано шт', data, backgroundColor:colors, borderRadius:8, maxBarThickness:26 },
          { type:'line', label:'Нужно в день', data:m.dailySeries.map(() => m.totals.perDayToPlan), borderColor:'#10b981', borderDash:[5,5], pointRadius:0, borderWidth:2 }
        ]
      },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, scales:{ y:{ beginAtZero:true, grid:{ color:'#f1f5f9' } }, x:{ grid:{ display:false } } } }
    });
  }

  destroyChart('payout');
  const ctx3 = document.getElementById('payoutChart');
  const top = m.sellers.filter(s => s.accrued > 0 || s.payable > 0).slice(0,10);
  if (ctx3) {
    charts.payout = new Chart(ctx3, {
      type:'bar',
      data:{
        labels: top.map(s => shortName(s.name)),
        datasets:[
          { label:'База', data:top.map(s => s.base), backgroundColor:'#4f46e5', borderRadius:8, stack:'money' },
          { label:'Фонд', data:top.map(s => s.fund), backgroundColor:'#06b6d4', borderRadius:8, stack:'money' }
        ]
      },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, scales:{ x:{ stacked:true, beginAtZero:true, grid:{ color:'#f1f5f9' } }, y:{ stacked:true, grid:{ display:false } } } }
    });
  }

  destroyChart('mix');
  const ctx4 = document.getElementById('skuMixChart');
  const mix = m.skuMetrics.filter(s => s.units > 0);
  if (ctx4) {
    charts.mix = new Chart(ctx4, {
      type:'doughnut',
      data:{ labels: mix.map(s => s.name), datasets:[{ data:mix.map(s => s.units), backgroundColor:mix.map(s => s.color), borderWidth:0, hoverOffset:8 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'66%', plugins:{ legend:{ position:'bottom' } } }
    });
  }
}

function renderSellerChart(m, seller){
  if (typeof Chart === 'undefined') return;
  destroyChart('seller');
  const ctx = document.getElementById('sellerChart');
  if (!ctx) return;
  const labels = m.allDates.map(d => formatShortDate(d));
  const units = m.allDates.map(d => seller.daily[d] || 0);
  const checks = m.allDates.map(d => (seller.checksDaily && seller.checksDaily[d]) || 0);
  const hasChecks = checks.some(v => v > 0);
  const datasets = [{ label:'Штуки', data:units, backgroundColor:'rgba(79,70,229,.75)', borderRadius:8, maxBarThickness:24, order:2 }];
  if (hasChecks) datasets.push({ type:'line', label:'Чеки', data:checks, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.12)', borderWidth:3, tension:.35, pointRadius:2, yAxisID:'y1', order:1 });
  charts.seller = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom' } },
      scales:{
        y:{ beginAtZero:true, grid:{ color:'#f1f5f9' }, title:{ display:true, text:'Штуки' } },
        y1:{ beginAtZero:true, position:'right', grid:{ drawOnChartArea:false }, display:hasChecks, title:{ display:hasChecks, text:'Чеки' } },
        x:{ grid:{ display:false } }
      }
    }
  });
}

/* ============================= DAY-DAY ANALYSIS ============================= */

function renderDayDay(m){
  renderDayDayKpis(m);
  renderDayDayCharts(m);
  renderDayDayDetail(m);
}

function renderDayDayKpis(m){
  const t = m.totals;
  const bestDay = m.dailySeries.reduce((best, d) => d.unitsOrZero > (best?.unitsOrZero || 0) ? d : best, null);
  const worstDay = m.dailySeries.filter(d => d.imported).reduce((worst, d) => !worst || d.unitsOrZero < worst.unitsOrZero ? d : worst, null);
  const avgDaily = m.elapsedDays > 0 ? round2(t.units / m.elapsedDays) : 0;
  const daysWithSales = m.dailySeries.filter(d => d.unitsOrZero > 0).length;
  const completionRate = m.totalDays > 0 ? round2(m.elapsedDays / m.totalDays * 100) : 0;
  
  document.getElementById('daydayKpis').innerHTML = [
    kpiCard('📊', 'Средний чек дней', fmtNum(avgDaily) + ' шт', `Продано ${fmtNum(t.units)} шт за ${m.elapsedDays} дн.`, null, 'primary'),
    kpiCard('🔥', 'Лучший день', bestDay ? formatShortDate(bestDay.date) + ' • ' + fmtNum(bestDay.unitsOrZero) + ' шт' : '—', bestDay ? `Накопительный: ${fmtNum(bestDay.cumulative)}` : 'Нет данных', null, 'success'),
    kpiCard('📉', 'Слабый день', worstDay ? formatShortDate(worstDay.date) + ' • ' + fmtNum(worstDay.unitsOrZero) + ' шт' : '—', worstDay ? 'Требует анализа' : 'Нет данных', null, 'warning'),
    kpiCard('🎯', 'Дней с продажами', String(daysWithSales), `Всего дней в периоде: ${m.totalDays} • Завершено: ${completionRate}%`, m.totalDays > 0 ? daysWithSales / m.totalDays * 100 : 0, 'info'),
    kpiCard('⏱️', 'Прогресс периода', completionRate + '%', `Прошло ${m.elapsedDays} из ${m.totalDays} дней`, completionRate, 'neutral')
  ].join('');
}

function renderDayDayCharts(m){
  if (typeof Chart === 'undefined') return;
  
  const labels = m.dailySeries.map(d => formatShortDate(d.date));
  
  // Daily sales chart
  destroyChart('ddDaily');
  const ctx1 = document.getElementById('ddDailyChart');
  if (ctx1) {
    const data = m.dailySeries.map(d => d.imported ? d.unitsOrZero : (d.future ? null : 0));
    const colors = m.dailySeries.map(d => {
      if (!d.imported) return d.future ? 'rgba(148,163,184,.08)' : 'rgba(239,68,68,.18)';
      if (d.unitsOrZero === 0) return 'rgba(148,163,184,.25)';
      const intensity = Math.min(1, 0.5 + (d.unitsOrZero / (m.maxDailySellerUnits * 2 || 1)) * 0.5);
      return `rgba(79,70,229,${intensity})`;
    });
    charts.ddDaily = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Продано шт',
          data,
          backgroundColor: colors,
          borderRadius: 8,
          maxBarThickness: 30
        }, {
          type: 'line',
          label: 'Нужно в день',
          data: m.dailySeries.map(() => m.totals.perDayToPlan),
          borderColor: '#10b981',
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + (ctx.raw !== null ? fmtNum(ctx.raw) : 'нет данных')
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, title: { display: true, text: 'Штуки' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
  
  // Cumulative chart
  destroyChart('ddCumulative');
  const ctx2 = document.getElementById('ddCumulativeChart');
  if (ctx2) {
    charts.ddCumulative = new Chart(ctx2, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Факт',
            data: m.dailySeries.map(d => d.imported ? d.cumulative : null),
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79,70,229,.10)',
            fill: true,
            tension: .35,
            pointRadius: 3,
            borderWidth: 3,
            spanGaps: false
          },
          {
            label: 'План',
            data: m.dailySeries.map(d => d.planCumulative),
            borderColor: '#94a3b8',
            borderDash: [6, 6],
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
            tension: .2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + (ctx.raw !== null ? fmtNum(ctx.raw) : 'нет данных')
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, title: { display: true, text: 'Накопительный итог' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
  
  // Seller heatmap chart
  destroyChart('ddSellerHeatmap');
  const ctx3 = document.getElementById('ddSellerHeatmapChart');
  if (ctx3) {
    const sellers = m.sellers.filter(s => s.units > 0).slice(0, 15);
    const dates = m.allDates.slice(0, 31);
    const sellerLabels = sellers.map(s => shortName(s.name));
    
    const datasets = dates.map((date, idx) => ({
      label: formatShortDate(date),
      data: sellers.map(s => s.daily[date] || 0),
      backgroundColor: SELLER_COLORS[idx % SELLER_COLORS.length],
      borderWidth: 0
    }));
    
    charts.ddSellerHeatmap = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: sellerLabels,
        datasets: datasets.slice(0, 14)
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + fmtNum(ctx.raw || 0) + ' шт'
            }
          }
        },
        scales: {
          x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' } },
          y: { stacked: true, grid: { display: false } }
        }
      }
    });
  }
  
  // SKU dynamics chart
  destroyChart('ddSku');
  const ctx4 = document.getElementById('ddSkuChart');
  if (ctx4) {
    const skuList = m.skuMetrics.filter(s => s.units > 0);
    const datasets = skuList.map((sku, idx) => ({
      label: sku.name,
      data: m.dailySeries.map(d => {
        const totalForDay = m.byDate[d.date] || 0;
        if (totalForDay === 0) return 0;
        /* Реальное количество SKU за день (в т.ч. с учётом периода «с — по»); пропорция — как раньше */
        const actualSkuDay = sku.skuDailySeries.reduce((a, x) => x.date === d.date ? a + x.unitsOrZero : a, 0);
        const otherActual = skuList.reduce((a, x) => a + x.skuDailySeries.reduce((b, y) => y.date === d.date ? b + y.unitsOrZero : b, 0), 0);
        const share = otherActual > 0 ? actualSkuDay / otherActual : 1 / skuList.length;
        return round2(totalForDay * share);
      }),
      backgroundColor: sku.color,
      borderColor: sku.color,
      borderWidth: 1,
      tension: .3,
      pointRadius: 2
    }));
    
    charts.ddSku = new Chart(ctx4, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, title: { display: true, text: 'Штуки' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
  
  // Stacked daily chart
  destroyChart('ddStacked');
  const ctx5 = document.getElementById('ddStackedChart');
  if (ctx5) {
    const skuList = m.skuMetrics.filter(s => s.units > 0);
    const datasets = skuList.map(sku => ({
      label: sku.name,
      data: m.dailySeries.map(d => {
        const totalForDay = m.byDate[d.date] || 0;
        if (totalForDay === 0) return 0;
        /* Реальное количество SKU за день (в т.ч. с учётом периода «с — по»); пропорция — как раньше */
        const actualSkuDay = sku.skuDailySeries.reduce((a, x) => x.date === d.date ? a + x.unitsOrZero : a, 0);
        const otherActual = skuList.reduce((a, x) => a + x.skuDailySeries.reduce((b, y) => y.date === d.date ? b + y.unitsOrZero : b, 0), 0);
        const share = otherActual > 0 ? actualSkuDay / otherActual : 1 / skuList.length;
        return round2(totalForDay * share);
      }),
      backgroundColor: sku.color,
      borderWidth: 0
    }));
    
    charts.ddStacked = new Chart(ctx5, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' } }
        }
      }
    });
  }
  
  // Seller ranking chart
  destroyChart('ddSellerRanking');
  const ctx6 = document.getElementById('ddSellerRankingChart');
  if (ctx6) {
    const topSellers = m.sellers.filter(s => s.units > 0).slice(0, 12);
    charts.ddSellerRanking = new Chart(ctx6, {
      type: 'bar',
      data: {
        labels: topSellers.map(s => shortName(s.name)),
        datasets: [{
          label: 'Продано шт',
          data: topSellers.map(s => s.units),
          backgroundColor: topSellers.map((s, i) => {
            if (i === 0) return '#fbbf24';
            if (i === 1) return '#94a3b8';
            if (i === 2) return '#b45309';
            return 'rgba(79,70,229,' + (0.8 - i * 0.05) + ')';
          }),
          borderRadius: 8,
          maxBarThickness: 30
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => fmtNum(ctx.raw) + ' шт • Вклад: ' + fmtPct(m.sellers.find(s => s.name === topSellers[ctx.dataIndex]?.name)?.share || 0)
            }
          }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f1f5f9' }, title: { display: true, text: 'Штуки' } },
          y: { grid: { display: false } }
        }
      }
    });
  }
  
  // Penetration chart
  destroyChart('ddPenetration');
  const ctx7 = document.getElementById('ddPenetrationChart');
  if (ctx7 && m.storeChecks > 0) {
    const penetrationData = m.dailySeries.map(d => {
      const units = d.unitsOrZero || 0;
      const checksForDay = (state.checks || []).filter(c => c.date === d.date).reduce((a, c) => a + (Number(c.checks) || 0), 0);
      return checksForDay > 0 ? round2(units / checksForDay * 100) : null;
    });
    
    charts.ddPenetration = new Chart(ctx7, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Проникновение (%)',
          data: penetrationData,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6,182,212,.12)',
          fill: true,
          tension: .35,
          pointRadius: 3,
          borderWidth: 3,
          spanGaps: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: ctx => (ctx.raw !== null ? fmtNum(ctx.raw, 1) + '%' : 'нет данных по чекам')
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, title: { display: true, text: 'Штук на чек' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

function renderDayDayDetail(m){
  const select = document.getElementById('ddDaySelect');
  const importedDates = m.dailySeries.filter(d => d.imported).map(d => d.date);
  
  if (!select.options.length) {
    select.innerHTML = importedDates.map(d => 
      `<option value="${d}">${formatFullDate(d)}</option>`
    ).join('');
  }
  
  const selectedDate = select.value || importedDates[0];
  
  select.onchange = () => {
    renderDayDayDetail(m);
  };
  
  const dayData = m.dailySeries.find(d => d.date === selectedDate);
  if (!dayData) {
    document.getElementById('ddDayDetail').innerHTML = '<div class="empty-state"><strong>Нет данных для выбранного дня</strong></div>';
    return;
  }
  
  const sellersByContribution = m.sellers
    .filter(s => (s.daily[selectedDate] || 0) > 0)
    .sort((a, b) => (b.daily[selectedDate] || 0) - (a.daily[selectedDate] || 0));
  
  const skuBreakdown = m.skuMetrics.map(sku => {
    const totalForDay = m.byDate[selectedDate] || 0;
    const skuForDay = totalForDay > 0 ? round2((sku.units / m.totals.units) * totalForDay) : 0;
    return { ...sku, unitsForDay: skuForDay };
  }).filter(s => s.unitsForDay > 0).sort((a, b) => b.unitsForDay - a.unitsForDay);
  
  document.getElementById('ddDayDetail').innerHTML = `
    <div class="grid grid-2" style="margin-bottom:18px">
      <div class="stat-box" style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);border:none">
        <span style="font-size:11px;color:#4338ca;font-weight:800;text-transform:uppercase">Дата</span>
        <div style="font-size:20px;font-weight:800;color:#3730a3">${formatFullDate(selectedDate)}</div>
      </div>
      <div class="stat-box" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:none">
        <span style="font-size:11px;color:#047857;font-weight:800;text-transform:uppercase">Продажи</span>
        <div style="font-size:20px;font-weight:800;color:#065f46">${fmtNum(dayData.unitsOrZero)} шт</div>
      </div>
      <div class="stat-box" style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:none">
        <span style="font-size:11px;color:#b45309;font-weight:800;text-transform:uppercase">Накопительный</span>
        <div style="font-size:20px;font-weight:800;color:#92400e">${fmtNum(dayData.cumulative)} шт</div>
      </div>
      <div class="stat-box" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:none">
        <span style="font-size:11px;color:#1d4ed8;font-weight:800;text-transform:uppercase">Отставание от плана</span>
        <div style="font-size:20px;font-weight:800;color:#1e40af">${fmtNum(dayData.planCumulative - dayData.cumulative)} шт</div>
      </div>
    </div>
    
    <h4 style="margin:16px 0 12px;font-size:16px">Топ кассиров дня</h4>
    <div class="employee-list" style="margin-bottom:16px">
      ${sellersByContribution.slice(0, 5).map((s, i) => `
        <div class="employee-chip" style="padding:10px 14px;border-radius:12px;background:${i === 0 ? '#fef3c7' : '#fff'};border-color:${i === 0 ? '#fbbf24' : 'var(--border)'}">
          <span style="font-size:16px;margin-right:6px">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤'}</span>
          <strong>${esc(s.name)}</strong>
          <span style="margin-left:8px;color:var(--muted)">•</span>
          <strong style="margin-left:8px">${fmtNum(s.daily[selectedDate])} шт</strong>
        </div>
      `).join('') || '<span class="muted">Нет данных</span>'}
    </div>
    
    <h4 style="margin:16px 0 12px;font-size:16px">Структура продаж по SKU</h4>
    <div class="list-box" style="max-height:220px">
      ${skuBreakdown.map(sku => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:12px;height:12px;border-radius:3px;background:${sku.color}"></div>
            <strong>${esc(sku.name)}</strong>
          </div>
          <div style="text-align:right">
            <strong>${fmtNum(sku.unitsForDay)} шт</strong>
            <div class="muted small">${fmtPct(m.totals.units > 0 ? sku.unitsForDay / dayData.unitsOrZero * 100 : 0)}</div>
          </div>
        </div>
      `).join('') || '<div class="empty-state" style="padding:16px">Нет данных</div>'}
    </div>
  `;
}

/* ============================= MODALS ============================= */

function openModal(id){ var el=document.getElementById(id); el.classList.add('open'); (el.closest('#sku3Card')||document.body).style.overflow='hidden'; }
function closeModal(id){ var el=document.getElementById(id); el.classList.remove('open'); if (!document.querySelector('#sku3Card .sku3-modal.open')) (el.closest('#sku3Card')||document.body).style.overflow=''; }

/* ---------- SETTINGS ---------- */

function openSettings(){
  settingsDraft = JSON.parse(JSON.stringify(state.settings));
  settingsDraft.employees = (settingsDraft.employees || []).map(e => ({ id:e.id || uid('emp'), name:e.name || '' }));
  settingsDraft.skus = (settingsDraft.skus || []).map(sku => Object.assign({}, sku, { articlesText:(sku.articles || []).join('\n') }));
  renderSettings();
  openModal('settingsModal');
}

function renderSettings(){
  const d = settingsDraft;
  const days = daysBetweenInclusive(d.startDate, d.endDate);
  const expectedChecksPerDay = days > 0 && Number(d.planChecks) > 0 ? fmtNum(Number(d.planChecks) / days, 1) : '—';
  const body = document.getElementById('settingsBody');

  body.innerHTML = `
    <div class="settings-section">
      <h4>Период и общие параметры</h4>
      <div class="settings-grid">
        <div class="field"><label>Магазин</label><input class="input" data-general="storeName" value="${esc(d.storeName)}"></div>
        <div class="field"><label>Название месяца</label><input class="input" data-general="monthName" value="${esc(d.monthName)}"></div>
        <div class="field"><label>Дата начала</label><input class="input" type="date" data-general="startDate" value="${esc(d.startDate)}"></div>
        <div class="field"><label>Дата окончания</label><input class="input" type="date" data-general="endDate" value="${esc(d.endDate)}"></div>
        <div class="field"><label>План чеков за месяц</label><input class="input" type="number" min="0" data-general="planChecks" value="${esc(d.planChecks)}"></div>
        <div class="field"><label>Ожидание чеков в день</label><input class="input" value="${expectedChecksPerDay}" disabled></div>
        <div class="field"><label>Минимальная выплата по каждой SKU сотрудника, ₽</label><input class="input" type="number" min="0" data-general="minPayout" value="${esc(d.minPayout)}"></div>
        <div class="field"><label>Режим премиального фонда</label>
          <select data-general="fundMode">
            <option value="cashiersByUnits" ${d.fundMode==='cashiersByUnits'?'selected':''}>Фонд — кассирам пропорционально штукам</option>
            <option value="none" ${d.fundMode==='none'?'selected':''}>Фонд не выплачивать кассирам</option>
          </select>
        </div>
      </div>
      <div class="note">Порог включения фонда настраивается отдельно для каждой товарной позиции. Если план ниже порога — кассиры получают только базовую ставку за штуки.</div>
    </div>

    <div class="hr"></div>

    <div class="settings-section">
      <h4>Сотрудники</h4>
      <div class="employee-list">
        ${d.employees.length ? d.employees.map((e,i) => `<span class="employee-chip">${esc(e.name)}<button type="button" data-action="delete-employee" data-index="${i}" title="Удалить">×</button></span>`).join('') : '<span class="muted small">Список пуст. Новые продавцы могут добавляться автоматически при импорте.</span>'}
      </div>
      <div class="add-row">
        <input class="input" id="newEmployeeName" placeholder="ФИО нового сотрудника">
        <button class="btn" data-action="add-employee">Добавить</button>
      </div>
    </div>

    <div class="hr"></div>

    <div class="settings-section">
      <h4>Товарные позиции и мотивация</h4>
      ${d.skus.length ? d.skus.map((sku, i) => `
        <div class="editor-card">
          <div class="editor-card-top">
            <strong>Позиция #${i+1}</strong>
            <div style="display:flex;gap:10px;align-items:center">
              <label class="checkbox"><input type="checkbox" data-sku-index="${i}" data-sku-field="enabled" ${sku.enabled !== false ? 'checked' : ''}> Активна</label>
              <button class="btn btn-sm btn-danger" data-action="delete-sku" data-index="${i}">Удалить</button>
            </div>
          </div>
          <div class="settings-grid">
            <div class="field"><label>Название</label><input class="input" data-sku-index="${i}" data-sku-field="name" value="${esc(sku.name)}"></div>
            <div class="field"><label>План, шт</label><input class="input" type="number" min="0" data-sku-index="${i}" data-sku-field="planUnits" value="${esc(sku.planUnits)}"></div>
            <div class="field"><label>Кассиру, ₽/шт</label><input class="input" type="number" min="0" step="0.01" data-sku-index="${i}" data-sku-field="cashierRate" value="${esc(sku.cashierRate)}"></div>
            <div class="field"><label>Фонд, ₽/шт</label><input class="input" type="number" min="0" step="0.01" data-sku-index="${i}" data-sku-field="fundRate" value="${esc(sku.fundRate)}"></div>
            <div class="field"><label>Порог фонда, %</label><input class="input" type="number" min="0" max="100" step="1" data-sku-index="${i}" data-sku-field="threshold" value="${esc(sku.threshold)}"></div>
            <div class="field"><label>Продажи с даты (пусто = со начала месяца)</label><input class="input" type="date" data-sku-index="${i}" data-sku-field="startDate" value="${esc(sku.startDate || '')}" min="${esc(d.startDate)}" max="${esc(d.endDate)}"></div>
            <div class="field"><label>Продажи по дату (пусто = до конца месяца)</label><input class="input" type="date" data-sku-index="${i}" data-sku-field="endDate" value="${esc(sku.endDate || '')}" min="${esc(d.startDate)}" max="${esc(d.endDate)}"></div>
          </div>
          <div class="note">Если даты не указаны — позиция продаётся и рассчитывается весь месяц. Укажите конкретные даты, чтобы план, расчёты и статистика считались строго по этому периоду.</div>
          <div class="field"><label>Артикулы (по одному в строке или через запятую)</label><textarea data-sku-index="${i}" data-sku-field="articlesText">${esc(sku.articlesText || '')}</textarea></div>
        </div>
      `).join('') : '<div class="editor-card muted">Позиций нет. Добавьте первую товарную позицию.</div>'}
      <div class="add-row">
        <button class="btn" data-action="add-sku">Добавить товарную позицию</button>
        <button class="btn btn-ghost" data-action="add-example-skus">Добавить пример 3 SKU</button>
      </div>
    </div>

    <div class="hr"></div>

    <div class="settings-section">
      <h4>Данные и состояние</h4>
      <div class="stat-grid" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:14px">
        <div class="stat-box"><span>Продаж в базе</span><strong>${fmtNum(state.sales.length)}</strong></div>
        <div class="stat-box"><span>Загруженных дней</span><strong>${fmtNum(state.imports.length)}</strong></div>
        <div class="stat-box"><span>Записей чеков</span><strong>${fmtNum(state.checks.length)}</strong></div>
        <div class="stat-box"><span>Последнее сохранение</span><strong>${state.lastSaved ? new Date(state.lastSaved).toLocaleString('ru-RU') : '—'}</strong></div>
      </div>
      <div class="note" id="storageInfoLine"></div>
      <div id="migrationBlock">${migrationBlockHtml()}</div>
      <div class="add-row">
        <button class="btn" data-action="save-json">Скачать JSON-состояние</button>
        <button class="btn" data-action="load-json">Загрузить JSON-состояние</button>
        <button class="btn btn-danger" data-action="clear-sales">Очистить продажи</button>
        <button class="btn btn-danger" data-action="clear-checks">Очистить чеки</button>
      </div>
      <div class="note" style="margin-top:10px">Продажи хранятся по-дневно в IndexedDB — объём практически не ограничен и не зависит от лимита localStorage. Настройки и чеки сохраняются автоматически. JSON нужен для резервной копии или переноса настроек на другой компьютер.</div>
    </div>
  `;
  refreshStorageUi();
}

/* Блок миграции в разделе «Данные и состояние»: показывается, пока
   старый localStorage-ключ или его backup ждут подтверждения пользователя */
function migrationBlockHtml(){
  if (!s3store.useIdb) return '';
  const hasPending = typeof legacyPendingRaw === 'string' && legacyPendingRaw;
  const hasBackup = s3store.legacyBackupPresent;
  if (!hasPending && !hasBackup) return '';
  let html = '<div class="editor-card" style="margin-bottom:12px"><strong>Миграция данных завершена</strong>';
  html += '<div class="note" style="margin-top:6px">Старая копия состояния (localStorage) всё ещё занимает место. Если расчёты и история отображаются корректно — удалите её. При проблемах можно временно вернуться к старым данным.</div>';
  html += '<div class="add-row" style="margin-top:10px">';
  if (hasPending) html += '<button class="btn btn-ghost" data-action="discard-legacy-key">Удалить старый ключ без подтверждения</button>';
  if (hasPending || hasBackup) html += '<button class="btn btn-danger" data-action="confirm-migration-cleanup">Удалить старую копию</button>';
  if (hasBackup) html += '<button class="btn" data-action="restore-legacy-backup">Восстановить из старой копии</button>';
  html += '</div></div>';
  return html;
}

async function saveSettings(){
  if (!settingsDraft) return;
  if (!settingsDraft.startDate || !settingsDraft.endDate || settingsDraft.startDate > settingsDraft.endDate) {
    showToast('Проверьте период акции', 'error');
    return;
  }
  settingsDraft.storeName = String(settingsDraft.storeName || '').trim() || 'Магазин';
  settingsDraft.monthName = String(settingsDraft.monthName || '').trim();
  settingsDraft.planChecks = Number(settingsDraft.planChecks) || 0;
  settingsDraft.minPayout = Number(settingsDraft.minPayout) || 0;
  settingsDraft.fundMode = settingsDraft.fundMode === 'none' ? 'none' : 'cashiersByUnits';
  settingsDraft.employees = settingsDraft.employees
    .map(e => ({ id:e.id || uid('emp'), name:String(e.name || '').trim() }))
    .filter(e => e.name);
  settingsDraft.skus = settingsDraft.skus.map(sku => ({
    id: sku.id || uid('sku'),
    name: String(sku.name || 'Товарная позиция').trim(),
    articles: parseArticles(sku.articlesText || (sku.articles || []).join('\n')),
    planUnits: Number(sku.planUnits) || 0,
    cashierRate: Number(sku.cashierRate) || 0,
    fundRate: Number(sku.fundRate) || 0,
    threshold: Math.max(0, Math.min(100, Number(sku.threshold) || 0)),
    startDate: typeof sku.startDate === 'string' ? sku.startDate : '',
    endDate: typeof sku.endDate === 'string' ? sku.endDate : '',
    enabled: sku.enabled !== false
  })).filter(sku => sku.name);
  /* Период активности позиции: даты необязательны (пусто = весь месяц), но не должны противоречить друг другу */
  const badSkuRange = settingsDraft.skus.some(sku => sku.startDate && sku.endDate && sku.startDate > sku.endDate);
  if (badSkuRange) {
    showToast('Проверьте даты продаж товарной позиции: «с» позже «по»', 'error');
    return;
  }

  const usedArticles = new Set();
  for (const sku of settingsDraft.skus.filter(x => x.enabled)) {
    for (const article of sku.articles) {
      const key = normArticle(article);
      if (usedArticles.has(key)) { showToast('Артикул назначен нескольким SKU: ' + article, 'error'); return; }
      usedArticles.add(key);
    }
  }
  state.settings = JSON.parse(JSON.stringify(settingsDraft));
  settingsDraft = null;
  closeModal('settingsModal');
  const saved = await persist('immediate');
  renderAll();
  if (!saved) return;
  showToast('Настройки сохранены', 'success');
}

/* ---------- IMPORT ---------- */

function openImport(){
  pendingImports = [];
  renderImportPreview();
  openModal('importModal');
}

function renderImportPreview(){
  const body = document.getElementById('importBody');
  const duplicateDates = [...new Set(pendingImports.map(p => p.date).filter(Boolean))]
    .filter(d => (state.imports || []).some(i => i.date === d));
  const anyNewSellers = pendingImports.some(p => p.newSellers && p.newSellers.length);
  const canImport = pendingImports.some(p => !p.error && SoldieRules.date(p.date) && (p.records.length || p.header?.detected));

  let html = `
    <div class="dropzone" id="dropZone">
      <strong>Перетащите файлы 1С сюда</strong>
      <div class="muted">или нажмите, чтобы выбрать .xlsx / .xls / .csv. Можно загрузить сразу несколько дневных отчётов.</div>
    </div>
  `;

  if (duplicateDates.length) {
    html += alertHtml('warning','Данные за некоторые даты уже загружены', 'При импорте старые продажи за эти даты будут заменены новыми: <strong>' + esc(duplicateDates.map(formatShortDate).join(', ')) + '</strong>.');
  }
  if (anyNewSellers) {
    html += `<label class="checkbox" style="margin-bottom:14px"><input type="checkbox" id="addNewSellers" checked> Добавлять новых распознанных продавцов в справочник</label>`;
  }

  if (!pendingImports.length) {
    html += '<div class="empty-state"><strong>Файлы ещё не выбраны</strong><div class="muted">После загрузки я покажу найденный заголовок, столбец количества, продавцов, артикулы и контрольные строки.</div></div>';
  } else {
    html += pendingImports.map((p, idx) => {
      if (p.error) return `<div class="preview-card">${alertHtml('danger', p.fileName, esc(p.error))}</div>`;
      const skuRows = Object.entries(p.bySku || {}).map(([skuId, qty]) => {
        const sku = state.settings.skus.find(x => x.id === skuId);
        return `<div class="stat-box"><span>${esc(sku ? sku.name : skuId)}</span><strong>${fmtNum(qty)} шт</strong></div>`;
      }).join('');

      return `
        <div class="preview-card">
          <div class="preview-title">
            <div><strong>${esc(p.fileName)}</strong><div class="muted small">${p.dateDetected ? 'Дата найдена автоматически' : 'Дата не найдена — укажите вручную'}</div></div>
            <input class="input" type="date" style="max-width:190px" data-pending-index="${idx}" value="${esc(p.date || '')}">
          </div>

          <div class="stat-chips">
            ${p.header && p.header.detected ? chip('Заголовок: строка ' + (p.header.rowIndex + 1), 'success') : chip('Заголовок не найден — колонки по умолчанию', 'warning')}
            ${p.header ? chip('Артикул: столбец ' + (p.header.labelCol + 1), 'neutral') : ''}
            ${p.header ? chip('Количество: столбец ' + (p.header.qtyCol + 1), 'primary') : ''}
            ${p.header ? chip('Сумма: столбец ' + (p.header.sumCol + 1), 'info') : ''}
          </div>

          <div class="stat-chips">
            ${chip('Строк: ' + p.records.length, 'neutral')}
            ${chip('Всего шт: ' + fmtNum(p.totalQty), 'neutral')}
            ${chip('Акционные шт: ' + fmtNum(p.mappedQty), 'primary')}
            ${chip('Продавцов: ' + p.sellers.length, 'info')}
            ${p.hasUnknownSeller ? chip('Есть строки без продавца', 'danger') : ''}
          </div>

          ${p.records.length ? `
            <div class="field">
              <label>Контроль парсинга: артикул → количество → продавец</label>
              <div class="list-box">
                ${p.records.slice(0,12).map(r => `${esc(r.article)} → <strong>${fmtNum(r.qty)} шт</strong> → ${esc(r.seller || 'без продавца')}`).join('<br>')}
              </div>
            </div>
          ` : ''}

          ${skuRows ? `<div class="stat-grid" style="margin-bottom:12px">${skuRows}</div>` : ''}
          ${p.unknownArticles.length ? `<div class="field"><label>Артикулы вне акции (${p.unknownArticles.length})</label><div class="list-box">${esc(p.unknownArticles.slice(0,40).join(', '))}${p.unknownArticles.length > 40 ? '…' : ''}</div></div>` : ''}
          ${p.newSellers.length ? `<div class="field"><label>Новые продавцы</label><div class="list-box">${p.newSellers.map(esc).join('<br>')}</div></div>` : ''}
          ${p.warnings.length ? `<div class="field"><label>Предупреждения</label><div class="list-box">${p.warnings.map(w => '• ' + esc(w)).join('<br>')}</div></div>` : ''}
        </div>
      `;
    }).join('');
  }

  body.innerHTML = html;
  document.getElementById('confirmImportBtn').disabled = !canImport;
  bindDropzone();
}

function bindDropzone(){
  const dz = document.getElementById('dropZone');
  if (!dz) return;
  dz.addEventListener('click', () => document.getElementById('importFileInput').click());
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) handleImportFiles(e.dataTransfer.files); });
}

async function confirmImport(){
  const addNewEl = document.getElementById('addNewSellers');
  const addNew = !addNewEl || addNewEl.checked;
  const groups = new Map();

  pendingImports.forEach(p => {
    if (p.error || !SoldieRules.date(p.date) || (!p.records.length && !p.header?.detected)) return;
    // One report is a complete snapshot of a day; the last selected file replaces earlier copies.
    groups.set(p.date, { date:p.date, records:[], files:[], newSellers:new Set() });
    const g = groups.get(p.date);
    g.records.push(...p.records);
    g.files.push(p.fileName);
    (p.newSellers || []).forEach(n => g.newSellers.add(n));
  });

  if (!groups.size) { showToast('Нет файлов с датой и распознанными строками', 'error'); return; }

  groups.forEach(g => {
    state.sales = state.sales.filter(r => r.date !== g.date);
    state.imports = state.imports.filter(i => i.date !== g.date);
    const records = aggregateRecords(g.records.map(r => Object.assign({}, r, { date:g.date })));
    state.sales.push(...records);
    state.imports.push({ date:g.date, file:g.files.join(', '), at:new Date().toISOString(), count:records.length });
    /* «Горячие» данные: чанк дня перезаписывается целиком (одна запись при persist) */
    s3store.replaceDay(g.date, records);
    dirtyDates.add(/^\d{4}-\d{2}-\d{2}$/.test(String(g.date || '')) ? g.date : '__nodate__');
    removedDates.delete(g.date);
    if (addNew) {
      g.newSellers.forEach(name => {
        if (!findEmployeeByName(name)) state.settings.employees.push({ id:uid('emp'), name });
      });
    }
  });

  const importedDates = [...groups.keys()].sort();
  pendingImports = [];
  closeModal('importModal');
  const saved = await persist('immediate');
  renderAll();
  if (!saved) { showToast('Данные в памяти, но не сохранены. Повторите сохранение или выгрузите JSON.', 'error'); return false; }
  window.dispatchEvent(new Event('sku3-data-changed'));
  showToast('Загружено дней: ' + importedDates.length, 'success');

  const lastDate = importedDates[importedDates.length - 1];
  if (lastDate && !hasChecksForDate(lastDate)) openChecksModal(lastDate);
}

/* ---------- CHECKS ---------- */

function openChecksModal(date){
  checksDraftDate = date || latestImportDate() || latestSalesDate() || state.settings.startDate || todayISO();
  renderChecksModal();
  openModal('checksModal');
}

function renderChecksModal(){
  const date = checksDraftDate || todayISO();
  const sellers = getActiveSellers();
  const existing = {};
  (state.checks || []).filter(c => c.date === date).forEach(c => existing[c.seller] = c.checks);
  const importedWithoutChecks = [...new Set((state.imports || []).map(i => i.date))].filter(d => !hasChecksForDate(d)).sort();
  const body = document.getElementById('checksBody');

  body.innerHTML = `
    <div class="settings-grid">
      <div class="field"><label>Дата</label><input class="input" type="date" id="checksDateInput" value="${esc(date)}" min="${esc(state.settings.startDate)}" max="${esc(state.settings.endDate)}"></div>
      <div class="field"><label>Подсказка</label><input class="input" value="Чеки нужны для 3SKU на 100 чеков" disabled></div>
    </div>
    ${importedWithoutChecks.length ? alertHtml('info','Нет чеков за загруженные дни', importedWithoutChecks.map(d => `<button class="btn btn-sm" data-action="open-check-date" data-date="${d}">${formatShortDate(d)}</button>`).join(' ')) : ''}
    <div class="table-wrap">
      <table class="data-table" style="min-width:500px">
        <thead><tr><th>Кассир / источник</th><th class="num">Количество чеков</th></tr></thead>
        <tbody>
          ${sellers.length ? sellers.map(s => `
            <tr>
              <td>${esc(s.name)}</td>
              <td class="num" style="max-width:180px"><input class="input" type="number" min="0" step="1" data-check-seller="${encodeURIComponent(s.key)}" value="${existing[s.key] != null ? esc(existing[s.key]) : ''}"></td>
            </tr>
          `).join('') : '<tr><td colspan="2" class="muted">Сотрудники не найдены. Добавьте их в настройках или сначала импортируйте продажи.</td></tr>'}
          <tr style="background:#f8fafc">
            <td><strong>Всего по магазину</strong><div class="note">Можно заполнить вместо чеков по кассирам, если точных данных по каждому нет.</div></td>
            <td class="num" style="max-width:180px"><input class="input" type="number" min="0" step="1" data-check-seller="${STORE_KEY}" value="${existing[STORE_KEY] != null ? esc(existing[STORE_KEY]) : ''}"></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="note">Если заполнены чеки по каждому кассиру, общий итог по магазину можно не вводить — он посчитается автоматически. Если введён общий итог, он используется для общей 3SKU на 100 чеков магазина.</div>
  `;
}

function copyPreviousChecks(){
  const dateInput = document.getElementById('checksDateInput');
  if (!dateInput || !dateInput.value) return;
  const date = dateInput.value;
  const prevDates = [...new Set((state.checks || []).map(c => c.date))].filter(d => d < date).sort();
  const prev = prevDates[prevDates.length - 1];
  if (!prev) { showToast('Нет предыдущего дня с чеками', 'warning'); return; }
  const prevMap = {};
  state.checks.filter(c => c.date === prev).forEach(c => prevMap[c.seller] = c.checks);
  document.querySelectorAll('#checksBody [data-check-seller]').forEach(inp => {
    const key = decodeURIComponent(inp.dataset.checkSeller);
    if (prevMap[key] != null) inp.value = prevMap[key];
  });
  showToast('Скопированы чеки за ' + formatFullDate(prev) + '. Нажмите «Сохранить».', 'info');
}

async function saveChecks(){
  const dateInput = document.getElementById('checksDateInput');
  if (!dateInput || !dateInput.value) { showToast('Укажите дату', 'error'); return; }
  const date = dateInput.value;
  const inputs = document.querySelectorAll('#checksBody [data-check-seller]');
  state.checks = state.checks.filter(c => c.date !== date);
  inputs.forEach(inp => {
    const val = Number(inp.value) || 0;
    const key = decodeURIComponent(inp.dataset.checkSeller);
    if (val > 0) state.checks.push({ date, seller:key, checks:val });
  });
  closeModal('checksModal');
  const saved = await persist('immediate');
  renderAll();
  if (!saved) return;
  showToast('Чеки за ' + formatFullDate(date) + ' сохранены', 'success');
}

/* ---------- JSON / RESET ---------- */

function downloadJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '3sku-state-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('JSON-состояние выгружено', 'success');
}

function validateStateFile(data) {
  if (!data || typeof data !== 'object' || !data.settings || !Array.isArray(data.sales) || !Array.isArray(data.checks) || !Array.isArray(data.imports)) throw new Error('Неверная структура состояния');
  for (const row of data.sales) {
    if (!SoldieRules.date(row.date) || !row.article || !Number.isFinite(Number(row.qty)) || !Number.isFinite(Number(row.sum))) throw new Error('Неверная запись продаж');
  }
  if (!Array.isArray(data.settings.skus) || !Array.isArray(data.settings.employees)) throw new Error('Неверные настройки');
}
function loadJSONFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      validateStateFile(data);
      state = migrateState(data);
      storeReady = true;
      /* Полный перенос продаж в чанки: старые дни удаляются из хранилища,
         новые записываются одной пакетной операцией */
      removedDates = new Set(Array.from(s3store.chunks.keys()));
      s3store.clearAllSales();
      s3store.replaceAllSales(state.sales || []);
      dirtyDates = new Set(s3store.chunks.keys());
      selectedSeller = null;
      settingsDraft = null;
      closeModal('settingsModal');
      persist('immediate').then(function(saved){ if (saved) { renderAll(); window.dispatchEvent(new Event('sku3-data-changed')); showToast('JSON-состояние загружено', 'success'); } });
      renderAll();
      if (migrationNote) showToast(migrationNote, 'warning');
    } catch(e) {
      showToast('Не удалось прочитать JSON', 'error');
    }
  };
  reader.readAsText(file);
}

function clearSales(){
  if (!confirm('Удалить все импортированные продажи и отметки о загрузке дней?')) return;
  storeReady = true;
  removedDates = new Set(Array.from(s3store.chunks.keys()).concat(Array.from(removedDates)));
  state.sales = [];
  state.imports = [];
  s3store.clearAllSales();
  dirtyDates = new Set();
  closeModal('settingsModal');
  persist('immediate');
  renderAll();
  showToast('Продажи очищены', 'warning');
}

function clearChecks(){
  if (!confirm('Удалить все вручную введённые чеки?')) return;
  state.checks = [];
  closeModal('settingsModal');
  persist('immediate');
  renderAll();
  showToast('Чеки очищены', 'warning');
}

function resetAll(){
  if (!confirm('Полный сброс: настройки, продажи, чеки и импорты будут удалены. Продолжить?')) return;
  removedDates = new Set(Array.from(s3store.chunks.keys()).concat(Array.from(removedDates)));
  state = defaultState();
  s3store.clearAllSales();
  dirtyDates = new Set();
  selectedSeller = null;
  settingsDraft = null;
  pendingImports = [];
  closeModal('settingsModal');
  persist('immediate');
  renderAll();
  showToast('Инструмент сброшен к начальным настройкам', 'warning');
}

/* Подтверждение миграции: пользователь видит, что всё работает —
   старый localStorage-ключ и backup удаляются, место освобождается. */
function confirmMigrationCleanup(){
  const finish = function(){
    closeModal('settingsModal');
    renderSettings();
    showToast('Старая копия данных удалена. Освобождено место в localStorage.', 'success');
  };
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  legacyPendingRaw = null;
  if (s3store.useIdb) {
    s3store.dropLegacyBackup().then(finish);
  } else {
    finish();
  }
}

function discardPendingLegacy(){
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  legacyPendingRaw = null;
  closeModal('settingsModal');
  renderSettings();
  showToast('Старый ключ localStorage удалён.', 'success');
}

function restoreFromLegacyBackup(){
  var raw = legacyPendingRaw;
  if (!raw) {
    try { raw = localStorage.getItem(STORAGE_KEY); } catch(e) { raw = null; }
  }
  if (raw) { applyRestoredState(raw); return; }
  s3store.getLegacyBackup().then(function(b){
    if (b && b.data) applyRestoredState(b.data);
    else showToast('Резервная копия старого состояния не найдена', 'error');
  });
}

function applyRestoredState(raw){
  try {
    var data = JSON.parse(raw);
    validateStateFile(data);
    state = migrateState(data);
    storeReady = true;
    removedDates = new Set(Array.from(s3store.chunks.keys()));
    s3store.clearAllSales();
    s3store.replaceAllSales(state.sales || []);
    dirtyDates = new Set(s3store.chunks.keys());
    try { localStorage.setItem(STORAGE_KEY, raw); } catch(e) {}
    legacyPendingRaw = raw;
    closeModal('settingsModal');
    persist('immediate').then(function(saved){ if (saved) { renderAll(); renderSettings(); } });
    renderAll();
    showToast('Данные восстановлены из резервной копии', 'success');
  } catch(e) {
    showToast('Не удалось восстановить резервную копию', 'error');
  }
}

function addExampleSkus(){
  if (!settingsDraft) return;
  const examples = [
    { name:'Носки', articles:['019-432','019-459','019-433','019-460','312-339','312-342','019-132'], planUnits:400, cashierRate:5, fundRate:5, threshold:70 },
    { name:'Наушники', articles:['410-273'], planUnits:80, cashierRate:25, fundRate:25, threshold:70 },
    { name:'Батарейки', articles:['917-113','917-112'], planUnits:1000, cashierRate:5, fundRate:5, threshold:70 }
  ];
  examples.forEach(ex => {
    settingsDraft.skus.push(Object.assign({ id:uid('sku'), enabled:true, articlesText:ex.articles.join('\n') }, ex));
  });
  renderSettings();
  showToast('Пример 3 SKU добавлен. Проверьте планы и ставки.', 'info');
}

/* ============================= EVENTS ============================= */

function bindEvents(){
  document.addEventListener('click', function(e){
    if (!e.target.closest('#sku3Card')) return;
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'switch-tab') { currentTab = el.dataset.tab; renderAll(); return; }
    if (action === 'open-settings') { openSettings(); return; }
    if (action === 'open-import') { openImport(); return; }
    if (action === 'open-checks') { openChecksModal(el.dataset.date); return; }
    if (action === 'open-check-date') { openChecksModal(el.dataset.date); return; }
    if (action === 'close-modal') { closeModal(el.dataset.modal); return; }
    if (action === 'save-settings') { saveSettings(); return; }
    if (action === 'add-sku') {
      settingsDraft.skus.push({ id:uid('sku'), name:'Новая позиция', articlesText:'', planUnits:0, cashierRate:0, fundRate:0, threshold:70, enabled:true });
      renderSettings(); return;
    }
    if (action === 'delete-sku') { settingsDraft.skus.splice(Number(el.dataset.index),1); renderSettings(); return; }
    if (action === 'add-example-skus') { addExampleSkus(); return; }
    if (action === 'add-employee') {
      const input = document.getElementById('newEmployeeName');
      const name = input && input.value.trim();
      if (!name) { showToast('Введите ФИО сотрудника', 'error'); return; }
      settingsDraft.employees.push({ id:uid('emp'), name });
      renderSettings(); return;
    }
    if (action === 'delete-employee') { settingsDraft.employees.splice(Number(el.dataset.index),1); renderSettings(); return; }
    if (action === 'save-json') { downloadJSON(); return; }
    if (action === 'load-json') { document.getElementById('jsonFileInput').click(); return; }
    if (action === 'clear-sales') { clearSales(); return; }
    if (action === 'clear-checks') { clearChecks(); return; }
    if (action === 'reset-all') { resetAll(); return; }
    if (action === 'confirm-migration-cleanup') { confirmMigrationCleanup(); return; }
    if (action === 'discard-legacy-key') { discardPendingLegacy(); return; }
    if (action === 'restore-legacy-backup') { restoreFromLegacyBackup(); return; }
    if (action === 'confirm-import') { confirmImport(); return; }
    if (action === 'save-checks') { saveChecks(); return; }
    if (action === 'copy-previous-checks') { copyPreviousChecks(); return; }
    if (action === 'select-seller') {
      selectedSeller = decodeURIComponent(el.dataset.seller || '');
      currentTab = 'team';
      renderAll();
      window.scrollTo({ top:0, behavior:'smooth' });
      return;
    }
  });

  document.addEventListener('input', function(e){
    const t = e.target;
    if (t.dataset.pendingIndex !== undefined && pendingImports.length) return;
    if (!settingsDraft) return;

    if (t.dataset.general) {
      const field = t.dataset.general;
      settingsDraft[field] = t.type === 'number' ? (Number(t.value) || 0) : t.value;
      return;
    }
    if (t.dataset.skuIndex !== undefined && t.dataset.skuField) {
      const idx = Number(t.dataset.skuIndex);
      const field = t.dataset.skuField;
      if (!settingsDraft.skus[idx]) return;
      let v = t.value;
      if (['planUnits','cashierRate','fundRate','threshold'].includes(field)) v = Number(v) || 0;
      settingsDraft.skus[idx][field] = v;
    }
  });

  document.addEventListener('change', function(e){
    const t = e.target;
    if (t.dataset.pendingIndex !== undefined && pendingImports.length) {
      const idx = Number(t.dataset.pendingIndex);
      if (pendingImports[idx]) { pendingImports[idx].date = t.value; renderImportPreview(); }
      return;
    }
    if (settingsDraft && t.dataset.skuIndex !== undefined && t.dataset.skuField === 'enabled') {
      settingsDraft.skus[Number(t.dataset.skuIndex)].enabled = t.checked;
      return;
    }
    if (settingsDraft && t.dataset.general) {
      const field = t.dataset.general;
      settingsDraft[field] = t.type === 'number' ? (Number(t.value) || 0) : t.value;
      renderSettings();
      return;
    }
    if (t.id === 'checksDateInput') { checksDraftDate = t.value; renderChecksModal(); }
  });

  document.getElementById('importFileInput').addEventListener('change', async function(e){
    const files = [...(e.target.files || [])];
    e.target.value = '';
    await handleImportFiles(files);
  });

  document.getElementById('jsonFileInput').addEventListener('change', function(e){
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) loadJSONFile(file);
  });

  window.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      document.querySelectorAll('.sku3-modal.open').forEach(modal => closeModal(modal.id));
    }
  });

  /* Фоновое сохранение не должно теряться при закрытии/сворачивании WebView */
  window.addEventListener('pagehide', function(){ flushSku3Save(); });
  window.addEventListener('beforeunload', function(){ flushSku3Save(); });
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') flushSku3Save();
  });
}

function showToast(msg, type){
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateY(8px)'; setTimeout(() => el.remove(), 220); }, 4600);
}

    init();

    /* ---------- Экспорт внутреннего API для раздела «💰 Продажи» (js/sales.js) ---------- */
    window.sku3Api = {
      getState: function(){ return state; },
      getSettings: function(){ return state.settings; },
      computeMetrics: function(){ return computeMetrics(); },
      aggregateRecords: function(records){ return aggregateRecords(records); },
      parseSalesFile: function(file){ return parseSalesFile(file); },
      handleImportFiles: function(files){ return handleImportFiles(files); },
      ready: stateReadyPromise,
      confirmImport: function(){ return confirmImport(); },
      renderAll: function(){ renderAll(); },
      persist: function(){ return persist('immediate'); },
      openModal: function(id){ openModal(id); },
      closeModal: function(id){ closeModal(id); },
      showToast: function(msg, type){ showToast(msg, type); },
      findReportDate: function(rows){ return findReportDate(rows); },
      findHeader: function(rows){ return findHeader(rows); },
      extractRecords: function(rows, start, header, date){ return extractRecords(rows, start, header, date); },
      toISO: toISO,
      parseISO: parseISO,
      addDaysISO: addDaysISO,
      todayISO: todayISO,
      esc: esc,
      round2: round2,
      fmtNum: fmtNum,
      fmtMoney: fmtMoney,
      formatShortDate: formatShortDate,
      formatFullDate: formatFullDate,
      normArticle: normArticle
    };

    window.sku3Hide = function () {
      var c = document.getElementById('sku3Card');
      if (c) c.classList.add('hidden');
    };
  };
})();
