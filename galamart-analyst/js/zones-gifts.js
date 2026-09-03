window.__bootStamp && window.__bootStamp('js/zones-gifts.js: выполнение');
/* ══════════════════════════════════════════════════════════════
   zones-gifts.js — коммерческие зоны, мега-зоны, подарки
   ══════════════════════════════════════════════════════════════ */

// ── Состояние зон ──
let zones = [];
let megas = [];
let zoneSel = new Set();
let zoneFormOpen = false;
let openZoneId = null;
let trialCodes = [];
let trialGroupVal = '';

function persistZones() { try { localStorage.setItem('galamart_zones', JSON.stringify({ zones, megas })); } catch (e) {} }
function loadZonesLS() {
  try {
    const d = JSON.parse(localStorage.getItem('galamart_zones') || 'null');
    if (d) { zones = d.zones || []; megas = d.megas || []; }
  } catch (e) {}
}
loadZonesLS();

// ── Аналитика зоны ──
function zoneStats(codesArr) {
  const seen = new Set(); const rowsArr = []; let missing = 0;
  (codesArr || []).forEach(c => {
    const k = String(c ?? '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    const r = codeIndex.get(k);
    if (r) rowsArr.push(r); else missing++;
  });
  const agg = rowsArr.reduce((a, r) => {
    a.stock += num(r['склад кол']);
    a.stockSum += num(r['склад сумма, руб.']) || num(r['склад кол']) * num(r['себ, руб.']);
    a.sold += num(r['продано (шт)']);
    a.to += num(r['то, руб']);
    a.toss += num(r['то сс, руб']);
    return a;
  }, { stock: 0, stockSum: 0, sold: 0, to: 0, toss: 0 });
  const rateSum = rowsArr.reduce((s, r) => s + dailyRate(r), 0);
  const cover = rateSum > 0 ? agg.stock / rateSum : Infinity;
  return { rows: rowsArr, missing, agg, rateSum, cover };
}

function zoneItemStatus(r, norm, log) {
  const stock = num(r['склад кол']), rate = dailyRate(r);
  const projected = Math.max(0, stock - rate * log.arrivalIn);
  if (!(norm > 0)) return { st: 'nonorm', projected, need: 0, qty: 0 };
  const need = norm * 1.1;
  if (projected < need) return { st: 'order', projected, need, qty: Math.ceil(need - projected) };
  return { st: 'ok', projected, need, qty: 0 };
}
function zoneStatusBadgeHtml(chk) {
  if (chk.st === 'nonorm') return '<span class="hint">норма не задана</span>';
  if (chk.st === 'order') return `<span class="ratio-badge ratio-fire">🔥 НУЖЕН ДОЗАКАЗ ~${chk.qty} шт</span>`;
  return '<span class="ratio-badge ratio-ok">✅ хватает</span>';
}
function zoneOrderInfo(z, log) {
  let orders = 0, qty = 0, normed = 0;
  z.codes.forEach(c => {
    const k = String(c ?? '').trim();
    const r = codeIndex.get(k);
    if (!r) return;
    const norm = (z.refill || {})[k] || 0;
    if (norm > 0) {
      normed++;
      const chk = zoneItemStatus(r, norm, log);
      if (chk.st === 'order') { orders++; qty += chk.qty; }
    }
  });
  return { orders, qty, normed };
}

// ── Карточки зон на странице ──
function zoneCardHtml(z, zlog) {
  const st = rawData.length ? zoneStats(z.codes) : null;
  const oi = rawData.length ? zoneOrderInfo(z, zlog) : null;
  const checked = zoneSel.has(z.id) ? ' checked' : '';
  const stats = st ? `
    <div class="zone-kv"><span>ТО</span><b>${fmt(st.agg.to)} ₽</b></div>
    <div class="zone-kv"><span>ВП</span><b class="${st.agg.gp < 0 ? 'fire-text' : ''}">${fmt(st.agg.gp)} ₽</b></div>
    <div class="zone-kv"><span>Продано</span><b>${fmt(st.agg.sold)} шт</b></div>
    <div class="zone-kv"><span>Склад</span><b>${fmt(st.agg.stock)} шт</b></div>
    <div class="zone-kv"><span>Покрытие</span><b>${coverBadge(st.cover)}</b></div>
    <div class="zone-kv"><span>🔥 Дозаказ к поставке</span><b class="${oi && oi.orders ? 'fire-text' : ''}">${oi ? (oi.orders ? `${oi.orders} поз. ~${oi.qty} шт` : 'нет') : '—'}</b></div>
    ${st.missing ? `<div class="zone-kv"><span>⚠️ Не найдено</span><b>${st.missing}</b></div>` : ''}
  ` : `<div class="hint">нет данных — загрузите отчёт</div>`;
  return `<div class="zone-card" data-zone-open="${z.id}">
    <input type="checkbox" class="zone-pick" data-zone-pick="${z.id}"${checked} title="Выбрать для объединения в мега-зону">
    <div class="zone-name">🧱 ${escapeHtml(z.name)}</div>
    <div class="zone-kv"><span>Артикулов</span><b>${z.codes.length}</b></div>
    ${stats}
  </div>`;
}

function megaCardHtml(m, zlog) {
  const childZones = m.zoneIds.map(id => zones.find(z => z.id === id)).filter(Boolean);
  const union = [...new Set(childZones.flatMap(z => z.codes))];
  const st = rawData.length ? zoneStats(union) : null;
  let orders = 0;
  if (rawData.length) childZones.forEach(z => orders += zoneOrderInfo(z, zlog).orders);
  const chips = childZones.map(z => `<span class="mini-zone-chip">🧱 ${escapeHtml(z.name)} · ${z.codes.length}</span>`).join('');
  const stats = st ? `
    <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:.82rem">
      <span>ТО: <b>${fmt(st.agg.to)} ₽</b></span>
      <span>ВП: <b>${fmt(st.agg.gp)} ₽</b></span>
      <span>Продано: <b>${fmt(st.agg.sold)} шт</b></span>
      <span>Склад: <b>${fmt(st.agg.stock)} шт</b></span>
      <span>Покрытие: ${coverBadge(st.cover)}</span>
      <span>🔥 Дозаказ: <b class="${orders ? 'fire-text' : ''}">${orders} поз.</b></span>
    </div>` : '';
  return `<div class="mega-card" data-mega-open="${m.id}">
    <div class="mega-tools">
      <button class="icon-btn" type="button" data-mega-rename="${m.id}" title="Переименовать">✎</button>
      <button class="icon-btn" type="button" data-mega-split="${m.id}" title="Разделить мега-зону">✖</button>
    </div>
    <div class="zone-name">🧩 ${escapeHtml(m.name)}<span class="mega-badge">МЕГА-ЗОНА</span></div>
    <div>${chips || '<span class="hint">зоны удалены</span>'}</div>
    ${stats}
  </div>`;
}

function renderZones() {
  zonesCard.classList.remove('hidden');
  const hasData = rawData.length > 0;
  const zlog = getLogistics(cfg);
  let html = '';
  if (!hasData) html += '<div class="alert-item alert-warn" style="margin-bottom:12px">📂 Отчёт ещё не загружен — статистика зон появится после загрузки файла. Создавать, сохранять и загружать зоны можно уже сейчас.</div>';

  if (zoneFormOpen) {
    html += `<div class="zone-form">
      <b>Новая коммерческая зона</b>
      <input type="text" id="newZoneName" placeholder="Название (например, «Сетка у входа»)">
      <textarea id="newZoneCodes" placeholder="Артикулы: через пробел, запятую или с новой строки"></textarea>
      <div style="display:flex;gap:8px">
        <button type="button" id="createZoneBtn">✔ Создать зону</button>
        <button type="button" class="btn-ghost" id="cancelZoneBtn">Отмена</button>
      </div>
    </div>`;
  }

  if (zoneSel.size >= 2) {
    html += `<div class="merge-bar">
      <span>Выбрано зон: <b>${zoneSel.size}</b></span>
      <input type="text" id="megaNameInput" placeholder="Название мега-зоны…" style="max-width:260px">
      <button type="button" id="megaMergeBtn">🧩 Объединить в мега-зону</button>
      <button type="button" class="btn-ghost" id="megaClearBtn">Снять выбор</button>
    </div>`;
  }

  if (megas.length) {
    html += '<h4 style="margin:6px 0 10px">🧩 Мега-зоны</h4>' + megas.map(m => megaCardHtml(m, zlog)).join('');
  }
  html += `<h4 style="margin:14px 0 10px">🧱 Зоны ${zones.length ? `(${zones.length})` : ''}</h4>`;
  if (!zones.length) {
    html += '<div class="alert-item alert-ok">Зон пока нет. Нажмите «➕ Новая зона» и создайте первую. Для каждого артикула можно задать норму выкладки (шт) — система проверит, хватит ли стока к ближайшей поставке (норма + 10% на кросс-выкладки), и подсветит «НУЖЕН ДОЗАКАЗ».</div>';
  } else {
    html += `<div class="zones-grid">${zones.map(z => zoneCardHtml(z, zlog)).join('')}</div>`;
    html += '<div class="hint" style="margin-top:10px">Клик по карточке — аналитика зоны и нормы выкладки. Галочка в углу — выбор для объединения в мега-зону.</div>';
  }
  zonesContent.innerHTML = html;
  zonesTitle.textContent = `🧱 Коммерческие зоны${zones.length ? ` — ${zones.length}` : ''}${megas.length ? ` · мега: ${megas.length}` : ''}`;
}

zonesCard.addEventListener('click', e => {
  if (e.target.closest('[data-zone-pick]')) return;
  const mr = e.target.closest('[data-mega-rename]');
  if (mr) { megaRename(mr.dataset.megaRename); return; }
  const ms = e.target.closest('[data-mega-split]');
  if (ms) { megaSplit(ms.dataset.megaSplit); return; }

  if (e.target.closest('#addZoneBtn')) { zoneFormOpen = !zoneFormOpen; renderZones(); return; }
  if (e.target.closest('#cancelZoneBtn')) { zoneFormOpen = false; renderZones(); return; }
  if (e.target.closest('#createZoneBtn')) {
    const name = (document.getElementById('newZoneName')?.value || '').trim() || `Зона ${zones.length + 1}`;
    const codes = [...new Set((document.getElementById('newZoneCodes')?.value || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
    if (!codes.length) { showStatus('⚠️ Укажите хотя бы один артикул.', 'error'); return; }
    zones.push({ id: genId('z'), name, codes, refill: {} });
    persistZones(); zoneFormOpen = false; renderZones();
    showStatus(`✅ Зона «${name}» создана: ${codes.length} артикулов.`, 'success');
    return;
  }
  if (e.target.closest('#megaMergeBtn')) {
    const name = (document.getElementById('megaNameInput')?.value || '').trim() || `Мега-зона ${megas.length + 1}`;
    megas.push({ id: genId('m'), name, zoneIds: [...zoneSel] });
    zoneSel.clear(); persistZones(); renderZones();
    showStatus(`🧩 Мега-зона «${name}» создана.`, 'success');
    return;
  }
  if (e.target.closest('#megaClearBtn')) { zoneSel.clear(); renderZones(); return; }
  if (e.target.closest('#saveZonesBtn')) { downloadZonesFile(); return; }
  if (e.target.closest('#loadZonesBtn')) { zonesFileInput.click(); return; }

  const mo = e.target.closest('[data-mega-open]');
  if (mo) { openMegaModal(mo.dataset.megaOpen); return; }
  const zo = e.target.closest('[data-zone-open]');
  if (zo) openZoneModal(zo.dataset.zoneOpen);
});

zonesCard.addEventListener('change', e => {
  const pick = e.target.closest('[data-zone-pick]');
  if (!pick) return;
  const id = pick.dataset.zonePick;
  if (pick.checked) zoneSel.add(id); else zoneSel.delete(id);
  renderZones();
});

function megaRename(id) {
  const m = megas.find(x => x.id === id); if (!m) return;
  const name = prompt('Новое название мега-зоны:', m.name);
  if (name && name.trim()) { m.name = name.trim(); persistZones(); renderZones(); if (!modalOverlay.classList.contains('hidden')) openMegaModal(id); }
}
function megaSplit(id) {
  const m = megas.find(x => x.id === id); if (!m) return;
  if (!confirm(`Разделить мега-зону «${m.name}»? Зоны останутся, объединение исчезнет.`)) return;
  megas = megas.filter(x => x.id !== id);
  persistZones(); closeModal(); renderZones();
  showStatus('Мега-зона разделена.', 'success');
}

function downloadZonesFile() {
  const data = { app: 'galamart-zones', version: 2, savedAt: new Date().toISOString(), zones, megas };
  const filename = `galamart_zones_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.json`;
  // Android-приложение сохраняет файл через системный диалог, а не через blob URL WebView.
  if (window.AndroidBridge?.saveText) {
    window.AndroidBridge.saveText(filename, JSON.stringify(data, null, 2));
    showStatus(`💾 Сохранено: зон ${zones.length}, мега-зон ${megas.length}.`, 'success');
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
  showStatus(`💾 Сохранено: зон ${zones.length}, мега-зон ${megas.length}.`, 'success');
}

zonesFileInput.addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (!d || !Array.isArray(d.zones)) throw new Error('неверный формат файла');
      zones = d.zones.map(z => ({ id: z.id || genId('z'), name: String(z.name || 'Зона'), codes: (z.codes || []).map(String), refill: z.refill || {} }));
      megas = (d.megas || []).map(m => ({ id: m.id || genId('m'), name: String(m.name || 'Мега-зона'), zoneIds: (m.zoneIds || []).map(String) }));
      persistZones(); zoneSel.clear(); renderZones();
      showStatus(`📂 Загружено зон: ${zones.length}, мега-зон: ${megas.length}.`, 'success');
    } catch (err) { showStatus('❌ Не удалось загрузить зоны: ' + err.message, 'error'); }
  };
  rd.readAsText(f);
  e.target.value = '';
});

// ── Оверлей зоны ──
function openZoneModal(id) {
  const z = zones.find(x => x.id === id); if (!z) return;
  openZoneId = id; trialCodes = []; trialGroupVal = '';
  const hasData = rawData.length > 0;
  const st = hasData ? zoneStats(z.codes) : null;
  const zlog = getLogistics(cfg);
  const parentMega = megas.find(m => m.zoneIds.includes(id));
  const rows = st ? [...st.rows] : [];

  const enriched = rows.map(r => {
    const code = String(r['код'] ?? '').trim();
    const norm = (z.refill || {})[code] || 0;
    return { r, code, norm, chk: zoneItemStatus(r, norm, zlog) };
  });
  const rank = s => s === 'order' ? 0 : s === 'nonorm' ? 1 : 2;
  enriched.sort((a, b) => rank(a.chk.st) - rank(b.chk.st) || num(b.r['то, руб']) - num(a.r['то, руб']));

  const orderCount = enriched.filter(e => e.chk.st === 'order').length;
  const orderQty = enriched.reduce((s, e) => s + (e.chk.st === 'order' ? e.chk.qty : 0), 0);
  const gp = st ? st.agg.to - st.agg.toss : 0;
  const margin = st && st.agg.to > 0 ? gp / st.agg.to * 100 : 0;

  const tiles = st ? [
    tileHtml('ТО', fmt(st.agg.to) + ' ₽', 'kpi-accent'),
    tileHtml('Валовая прибыль', fmt(gp) + ' ₽', '', 'маржа ' + margin.toFixed(1) + '%'),
    tileHtml('Продано', fmt(st.agg.sold) + ' шт'),
    tileHtml('Склад', fmt(st.agg.stock) + ' шт', '', fmt(st.agg.stockSum) + ' ₽'),
    tileHtml('Покрытие стока', isFinite(st.cover) ? fmtDays(st.cover) + ' дн.' : '∞', !isFinite(st.cover) ? 'kpi-danger' : st.cover <= 14 ? 'kpi-danger' : st.cover <= 30 ? 'kpi-warn' : ''),
    tileHtml('🔥 Дозаказ', orderCount ? `${orderCount} поз.` : 'нет', orderCount ? 'kpi-danger' : 'kpi-accent', orderCount ? `~${orderQty} шт` : 'выкладка обеспечена')
  ].join('') : '';

  const itemsHtml = enriched.map(e => {
    const rate = dailyRate(e.r);
    const gpI = rowGp(e.r);
    return `<tr>
      <td><span class="link-cell" data-open-product data-code="${escapeHtml(e.code)}">${escapeHtml(e.code)}</span></td>
      <td style="white-space:normal">${escapeHtml(truncateStr(e.r['товар'], 44))}</td>
      <td>${cubeBadge(e.r['кубы'])}</td>
      <td class="${gpI < 0 ? 'fire-text' : ''}">${fmt(gpI)} ₽</td>
      <td>${fmt(num(e.r['склад кол']))}</td>
      <td>${rate.toFixed(2)}</td>
      <td style="${e.chk.st === 'order' ? 'color:#991b1b;font-weight:700' : ''}">${fmt(e.chk.projected)}</td>
      <td><input type="number" min="0" class="refill-input" data-refill-code="${escapeHtml(e.code)}" value="${e.norm}" title="Норма выкладки: сколько штук нужно для красивой выкладки"></td>
      <td data-status-cell="${escapeHtml(e.code)}">${zoneStatusBadgeHtml(e.chk)}</td>
      <td><button class="icon-btn" type="button" data-zone-remove-code="${escapeHtml(e.code)}" title="Убрать из зоны">✖</button></td>
    </tr>`;
  }).join('');

  modalBox.innerHTML = `
    <div class="main-modal-head">
      <div style="min-width:0">
        <div class="breadcrumb">🧱 Коммерческая зона${parentMega ? ` · входит в мега-зону «${escapeHtml(parentMega.name)}»` : ''}</div>
        <h3>${escapeHtml(z.name)}</h3>
        <div class="text-muted">${z.codes.length} артикулов${st && st.missing ? ` · ⚠️ не найдено в отчёте: ${st.missing}` : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn-ghost" data-zone-rename="${z.id}">✎ Переименовать</button>
        <button type="button" class="btn-danger" data-zone-delete="${z.id}">🗑 Удалить</button>
        <button type="button" class="main-modal-close" data-modal-close>✕</button>
      </div>
    </div>
    ${st ? `<div class="alert-item alert-warn" style="margin-bottom:8px">🚚 Ближайшая поставка: <b>${fmtDate(zlog.arrivalDate)}</b> (через ${zlog.arrivalIn} дн.). Правило: к моменту поставки остаток должен быть ≥ <b>норма выкладки + 10%</b> (кросс-выкладки). Иначе — «НУЖЕН ДОЗАКАЗ».</div>
    <div class="kpi-grid">${tiles}</div>` : '<div class="alert-item alert-warn">Загрузите отчёт, чтобы увидеть аналитику зоны.</div>'}
    ${st && rows.length ? '<div class="chart-box"><canvas id="modalCanvas"></canvas></div>' : ''}
    <h4>Состав зоны · нормы выкладки</h4>
    <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
      <textarea id="zoneAddCodes" placeholder="Коды для добавления (через пробел, запятую или с новой строки)…" style="flex:1;min-width:260px;min-height:38px"></textarea>
      <button type="button" data-zone-add-codes="${z.id}">➕ Добавить в зону</button>
    </div>
    ${rows.length ? `
      <div class="zone-scroll">
        <table class="mini-table sortable" style="margin-top:0">
          <thead><tr><th>Код</th><th>Товар</th><th>КУБЫ</th><th>ВП</th><th>Склад</th><th>Шт/дн</th><th>Останется к поставке</th><th>Норма, шт</th><th>Статус выкладки</th><th></th></tr></thead>
          <tbody id="zoneItemsBody">${itemsHtml}</tbody>
        </table>
      </div>
      <div id="zoneOrderSummary" style="margin-top:8px;font-size:.85rem;font-weight:600">${orderCount ? `🔥 Дозаказ: ${orderCount} позиций, ~${orderQty} шт` : '✅ Всё хватает для красивой выкладки до следующей поставки'}</div>
      <div class="hint">Норма — сколько штук нужно для красивой выкладки. Статус пересчитывается сразу при изменении нормы.</div>`
      : '<div class="hint">В зоне пока нет артикулов — добавьте выше или через примерку ниже.</div>'}
    <h4>🔮 Примерка артикулов</h4>
    <div class="hint" style="margin-bottom:6px">Быстрый топ по любой группе. «Примерить» — посмотреть вклад в зону, затем можно добавить в зону.</div>
    <div id="trialSection"></div>
  `;
  modalOverlay.classList.remove('hidden');
  if (st && rows.length) buildZoneChart(rows);
  fillTrialSection();
}

function updateZoneStatuses() {
  const z = zones.find(x => x.id === openZoneId); if (!z) return;
  const body = document.getElementById('zoneItemsBody'); if (!body) return;
  const zlog = getLogistics(cfg);
  let orders = 0, qtySum = 0;
  [...body.rows].forEach(tr => {
    const inp = tr.querySelector('[data-refill-code]'); if (!inp) return;
    const code = inp.dataset.refillCode;
    const norm = Math.max(0, +inp.value || 0);
    const r = codeIndex.get(code); if (!r) return;
    const chk = zoneItemStatus(r, norm, zlog);
    const cell = tr.querySelector('[data-status-cell]');
    if (cell) cell.innerHTML = zoneStatusBadgeHtml(chk);
    const projCell = tr.cells[6];
    if (projCell) { projCell.innerHTML = fmt(chk.projected); projCell.style.cssText = chk.st === 'order' ? 'color:#991b1b;font-weight:700' : ''; }
    if (chk.st === 'order') { orders++; qtySum += chk.qty; }
  });
  const el = document.getElementById('zoneOrderSummary');
  if (el) el.innerHTML = orders ? `🔥 Дозаказ: <b>${orders}</b> позиций, ~<b>${qtySum}</b> шт` : '✅ Всё хватает для красивой выкладки до следующей поставки';
}

function buildZoneChart(rows) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('modalCanvas');
  if (!ctx) return;
  const tops = [...rows].sort((a, b) => num(b['то, руб']) - num(a['то, руб'])).slice(0, 10);
  const labels = tops.map(r => String(r['код'] ?? ''));
  const vals = tops.map(r => num(r['то, руб']));
  const colors = tops.map(r => cubeKind(r['кубы']) ? '#ef4444' : '#2563eb');
  if (modalChart) modalChart.destroy();
  modalChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'ТО, руб.', data: vals, backgroundColor: colors, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
  });
}

function fillTrialSection() {
  const el = document.getElementById('trialSection'); if (!el) return;
  const z = zones.find(x => x.id === openZoneId); if (!z) return;
  if (!rawData.length) { el.innerHTML = '<div class="hint">Примерка доступна после загрузки отчёта.</div>'; return; }

  const groups = [...new Set(rawData.map(r => String(r['группа 1'] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const selHtml = `<select id="trialGroupSel" class="group-select" style="max-width:300px"><option value="">Весь магазин: топ по ТО</option>${groups.map(g => `<option value="${escapeHtml(g)}"${g === trialGroupVal ? ' selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select>`;

  const inZone = new Set(z.codes.map(c => String(c).trim()));
  const pool = rawData
    .filter(r => { const c = String(r['код'] ?? '').trim(); return c && !inZone.has(c) && !trialCodes.includes(c); })
    .filter(r => !trialGroupVal || String(r['группа 1'] ?? '').trim() === trialGroupVal)
    .sort((a, b) => num(b['то, руб']) - num(a['то, руб'])).slice(0, 10);

  const optHtml = pool.length
    ? pool.map(r => {
        const code = String(r['код'] ?? '').trim();
        return `<div class="trial-row">
          <b>${escapeHtml(code)}</b> ${escapeHtml(truncateStr(r['товар'], 44))} ${cubeBadge(r['кубы'])}
          <span class="text-muted" style="margin-left:auto">ТО ${fmt(num(r['то, руб']))} ₽ · ${fmt(num(r['продано (шт)']))} шт · склад ${fmt(num(r['склад кол']))}</span>
          <button type="button" class="icon-btn" data-trial-add="${escapeHtml(code)}" title="Примерить">➕ Примерить</button>
        </div>`;
      }).join('')
    : '<div class="hint">Все топы этой группы уже в зоне 🙂</div>';

  let trialHtml = '';
  if (trialCodes.length) {
    const zTO = zoneStats(z.codes).agg.to;
    let tTO = 0;
    trialHtml = trialCodes.map(c => {
      const r = codeIndex.get(c); if (!r) return '';
      const to = num(r['то, руб']); tTO += to;
      return `<div class="trial-row on">
        <b>${escapeHtml(c)}</b> ${escapeHtml(truncateStr(r['товар'], 44))}
        <span class="text-muted" style="margin-left:auto">ТО ${fmt(to)} ₽ · ${fmt(num(r['продано (шт)']))} шт</span>
        <button type="button" class="icon-btn" data-trial-commit="${escapeHtml(c)}" title="Добавить в зону">✔ В зону</button>
        <button type="button" class="icon-btn" data-trial-remove="${escapeHtml(c)}" title="Снять примерку">✖</button>
      </div>`;
    }).join('');
    trialHtml += `<div class="alert-item alert-ok" style="margin-top:6px">🔮 Зона сейчас: <b>${fmt(zTO)} ₽</b> ТО → с примеркой: <b>${fmt(zTO + tTO)} ₽</b> (+${fmt(tTO)} ₽)</div>`;
  }

  el.innerHTML = selHtml + '<div style="margin-top:8px">' + optHtml + '</div>' + (trialHtml ? '<h4 style="margin:10px 0 6px">Примеряемые</h4>' + trialHtml : '');
}

// ── Оверлей мега-зоны ──
function openMegaModal(id) {
  const m = megas.find(x => x.id === id); if (!m) return;
  const childZones = m.zoneIds.map(zi => zones.find(z => z.id === zi)).filter(Boolean);
  const union = [...new Set(childZones.flatMap(z => z.codes))];
  const st = rawData.length ? zoneStats(union) : null;
  const zlog = getLogistics(cfg);
  const gp = st ? st.agg.to - st.agg.toss : 0;
  const margin = st && st.agg.to > 0 ? gp / st.agg.to * 100 : 0;

  const tiles = st ? [
    tileHtml('ТО (совмещ.)', fmt(st.agg.to) + ' ₽', 'kpi-accent'),
    tileHtml('Валовая прибыль', fmt(gp) + ' ₽', '', 'маржа ' + margin.toFixed(1) + '%'),
    tileHtml('Продано', fmt(st.agg.sold) + ' шт'),
    tileHtml('Склад', fmt(st.agg.stock) + ' шт', '', fmt(st.agg.stockSum) + ' ₽'),
    tileHtml('Покрытие стока', isFinite(st.cover) ? fmtDays(st.cover) + ' дн.' : '∞', !isFinite(st.cover) ? 'kpi-danger' : st.cover <= 14 ? 'kpi-danger' : st.cover <= 30 ? 'kpi-warn' : ''),
    tileHtml('Артикулов (уник.)', fmt(union.length))
  ].join('') : '';

  const breakdown = childZones.map(z => {
    const zs = rawData.length ? zoneStats(z.codes) : null;
    const oi = rawData.length ? zoneOrderInfo(z, zlog) : null;
    return `<tr>
      <td><b>${escapeHtml(z.name)}</b></td>
      <td>${z.codes.length}</td>
      <td>${zs ? fmt(zs.agg.to) + ' ₽' : '—'}</td>
      <td>${zs ? fmt(zs.agg.gp) + ' ₽' : '—'}</td>
      <td>${zs ? fmt(zs.agg.sold) + ' шт' : '—'}</td>
      <td>${zs ? fmt(zs.agg.stock) + ' шт' : '—'}</td>
      <td>${zs ? coverBadge(zs.cover) : '—'}</td>
      <td>${oi ? (oi.orders ? `<span class="fire-text">${oi.orders} поз.</span>` : 'нет') : '—'}</td>
      <td><button type="button" class="icon-btn" data-zone-open-child="${z.id}">открыть →</button></td>
    </tr>`;
  }).join('');

  modalBox.innerHTML = `
    <div class="main-modal-head">
      <div style="min-width:0">
        <div class="breadcrumb">🧩 Мега-зона (объединённая статистика)</div>
        <h3>${escapeHtml(m.name)}</h3>
        <div class="text-muted">${childZones.length} зон · ${union.length} уникальных артикулов</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn-ghost" data-mega-rename="${m.id}">✎ Переименовать</button>
        <button type="button" class="btn-danger" data-mega-split="${m.id}">✖ Разделить</button>
        <button type="button" class="main-modal-close" data-modal-close>✕</button>
      </div>
    </div>
    ${st ? `<div class="kpi-grid">${tiles}</div>` : '<div class="alert-item alert-warn">Загрузите отчёт, чтобы увидеть аналитику.</div>'}
    ${st && st.rows.length ? '<div class="chart-box"><canvas id="modalCanvas"></canvas></div>' : ''}
    <h4>Разбивка по зонам</h4>
    <div class="zone-scroll">
      <table class="mini-table sortable" style="margin-top:0">
        <thead><tr><th>Зона</th><th>Артикулов</th><th>ТО</th><th>ВП</th><th>Продано</th><th>Склад</th><th>Покрытие</th><th>🔥 Дозаказ</th><th></th></tr></thead>
        <tbody>${breakdown || '<tr><td colspan="9" class="hint">зоны удалены</td></tr>'}</tbody>
      </table>
    </div>
  `;
  modalOverlay.classList.remove('hidden');
  if (st && st.rows.length) buildZoneChart(st.rows);
}

// ── Подарки ──
let giftSelectedCodes = new Set();

function giftRebuildOptions() {
  const uniq = (arr, key) => [...new Set(arr.map(r => String(r[key] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const fill = (sel, vals) => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">${sel.dataset.all || 'все'}</option>` +
      vals.map(v => `<option value="${escapeHtml(v)}"${v === cur ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('');
  };
  fill(giftSel1, uniq(rawData, 'группа 1'));
  let pool = rawData;
  if (giftSel1.value) pool = pool.filter(r => String(r['группа 1'] ?? '').trim() === giftSel1.value);
  fill(giftSel2, uniq(pool, 'группа 2'));
  if (giftSel2.value) pool = pool.filter(r => String(r['группа 2'] ?? '').trim() === giftSel2.value);
  fill(giftSel3, uniq(pool, 'группа 3'));
}

function renderGifts() {
  giftsCard.classList.remove('hidden');
  if (!rawData.length) {
    giftsSummary.innerHTML = '';
    giftsContent.innerHTML = '<div class="alert-item alert-warn">Сначала загрузите отчёт — тогда подбор подарков станет доступен.</div>';
    return;
  }
  giftRebuildOptions();
  const limit = +giftLimit.value || 0;
  const g1 = giftSel1.value, g2 = giftSel2.value, g3 = giftSel3.value;
  const onlyStock = giftInStock.checked;

  let items = rawData.filter(r => {
    const cost = num(r['себ, руб.']);
    if (cost <= 0 || cost > limit) return false;
    if (g1 && String(r['группа 1'] ?? '').trim() !== g1) return false;
    if (g2 && String(r['группа 2'] ?? '').trim() !== g2) return false;
    if (g3 && String(r['группа 3'] ?? '').trim() !== g3) return false;
    if (onlyStock && num(r['склад кол']) <= 0) return false;
    return true;
  }).sort((a, b) => num(b['то, руб']) - num(a['то, руб']));

  const total = items.length;
  const shown = items.slice(0, 500);
  const sumCost = items.reduce((s, r) => s + num(r['себ, руб.']), 0);
  const sumRetail = items.reduce((s, r) => s + num(r['цена маг, руб.']), 0);

  giftsTitle.textContent = `🎁 Выбор подарка — себестоимость до ${fmt(limit)} ₽`;
  giftsSummary.innerHTML = `<div class="alert-item alert-ok">Найдено <b>${fmt(total)}</b> позиций с себестоимостью ≤ ${fmt(limit)} ₽. Если взять по 1 шт каждой: по себестоимости ≈ <b>${fmt(sumCost)} ₽</b>, по рознице ≈ <b>${fmt(sumRetail)} ₽</b>. Сначала — самые продаваемые (обычно лучший подарок).</div>`;

  const rows = shown.map(r => {
    const code = String(r['код'] ?? '').trim();
    const cost = num(r['себ, руб.']);
    const mk = itemMarkup(r);
    const isSelected = giftSelectedCodes.has(code);
    return `<tr data-code="${escapeHtml(code)}" class="${isSelected ? 'row-selected' : ''}">
      <td><input type="checkbox" class="gift-check" data-gift-code="${escapeHtml(code)}"${isSelected ? ' checked' : ''}></td>
      <td><span class="link-cell" data-open-product data-code="${escapeHtml(code)}">${escapeHtml(code)}</span></td>
      <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 56))}</td>
      <td>${escapeHtml(String(r['группа 1'] ?? '').trim() || '—')}</td>
      <td>${escapeHtml(String(r['группа 2'] ?? '').trim() || '—')}</td>
      <td>${escapeHtml(String(r['группа 3'] ?? '').trim() || '—')}</td>
      <td>${cubeBadge(r['кубы'])}</td>
      <td><b>${fmt(cost, 2)} ₽</b></td>
      <td>${fmt(num(r['цена маг, руб.']), 2)} ₽</td>
      <td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td>
      <td>${fmt(num(r['склад кол']))}</td>
      <td>${fmt(num(r['продано (шт)']))}</td>
      <td>${fmt(num(r['то, руб']))} ₽</td>
      <td class="${rowGp(r) < 0 ? 'fire-text' : ''}">${fmt(rowGp(r))} ₽</td>
      <td>${daysBadgeR(r)}</td>
    </tr>`;
  }).join('');

  giftsContent.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <button type="button" id="giftSelectAllBtn" class="chip">✅ Выбрать все</button>
      <button type="button" id="giftDeselectAllBtn" class="chip">❌ Снять выбор</button>
      <button type="button" id="giftExportSelectedBtn" class="btn-export">⬇️ Экспорт выбранных</button>
      <span class="hint">Выбрано: <b id="giftSelectedCount">${giftSelectedCodes.size}</b> из ${fmt(total)}</span>
    </div>
    <div class="zone-scroll" style="max-height:62vh">
      <table class="mini-table sortable" style="margin-top:0">
        <thead><tr><th>✓</th><th>Код</th><th>Товар</th><th>Группа 1</th><th>Группа 2</th><th>Группа 3</th><th>КУБЫ</th><th>Себестоимость</th><th>Цена маг</th><th>Наценка</th><th>Склад</th><th>Продано</th><th>ТО</th><th>ВП</th><th>Ост. дней</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="15">Ничего не найдено — поднимите лимит или выберите другую группу.</td></tr>'}</tbody>
      </table>
    </div>
    ${total > 500 ? `<div class="hint">Показаны первые 500 из ${total}.</div>` : ''}
  `;
  
  // Обновить счетчик
  updateGiftSelectedCount();
}

function updateGiftSelectedCount() {
  const el = document.getElementById('giftSelectedCount');
  if (el) el.textContent = giftSelectedCodes.size;
}

function exportSelectedGifts() {
  if (giftSelectedCodes.size === 0) { showStatus('⚠️ Выберите хотя бы один товар', 'error'); return; }
  const rows = [['Код', 'Товар', 'Группа 1', 'Группа 2', 'Группа 3', 'Себестоимость', 'Цена маг', 'Склад']];
  rawData.forEach(r => {
    const code = String(r['код'] ?? '').trim();
    if (giftSelectedCodes.has(code)) {
      rows.push([
        code,
        r['товар'],
        r['группа 1'],
        r['группа 2'],
        r['группа 3'],
        num(r['себ, руб.']),
        num(r['цена маг, руб.']),
        num(r['склад кол'])
      ]);
    }
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Подарки');
  const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
  XLSX.writeFile(wb, `galamart_gifts_selected_${today}.xlsx`);
  showStatus(`✅ Экспортировано ${giftSelectedCodes.size} подарков`, 'success');
}

let giftTimer = null;
giftLimit.addEventListener('input', () => { clearTimeout(giftTimer); giftTimer = setTimeout(() => { if (rawData.length) renderGifts(); }, 200); });
[giftSel1, giftSel2, giftSel3].forEach(s => s.addEventListener('change', () => { if (rawData.length) renderGifts(); }));
giftInStock.addEventListener('change', () => { if (rawData.length) renderGifts(); });

// Обработчики для кнопок выбора подарков
document.addEventListener('click', e => {
  if (e.target.closest('#giftSelectAllBtn')) {
    const visibleCodes = new Set();
    giftsContent.querySelectorAll('.gift-check').forEach(cb => visibleCodes.add(cb.dataset.giftCode));
    visibleCodes.forEach(code => giftSelectedCodes.add(code));
    renderGifts();
    showStatus(`✅ Выбрано ${giftSelectedCodes.size} подарков`, 'success');
    return;
  }
  if (e.target.closest('#giftDeselectAllBtn')) {
    giftSelectedCodes.clear();
    renderGifts();
    showStatus('❌ Выбор снят', 'success');
    return;
  }
  if (e.target.closest('#giftExportSelectedBtn')) {
    exportSelectedGifts();
    return;
  }
});

// Обработчик чекбоксов подарков
giftsContent.addEventListener('change', e => {
  const cb = e.target.closest('.gift-check');
  if (!cb) return;
  const code = cb.dataset.giftCode;
  if (cb.checked) giftSelectedCodes.add(code);
  else giftSelectedCodes.delete(code);
  updateGiftSelectedCount();
  cb.closest('tr')?.classList.toggle('row-selected', cb.checked);
});

giftsContent.addEventListener('click', e => {
  const p = e.target.closest('[data-open-product]');
  if (p) openProduct(p.dataset.code, null);
});
