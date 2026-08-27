/* ══════════════════════════════════════════════════════════════
   app.js — модальное ядро, переключение режимов, «Обработать»,
   проверка библиотек, инициализация
   ══════════════════════════════════════════════════════════════ */

// ── Модальное ядро ──
function closeModal() {
  modalOverlay.classList.add('hidden');
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

modalBox.addEventListener('click', e => {
  if (e.target.closest('[data-modal-close]')) return closeModal();

  const jump = e.target.closest('[data-an-page-jump]');
  if (jump) {
    anPage = jump.dataset.anPageJump;
    anCodesInput.value = '';
    closeModal();
    if (currentMode === 'analysis') renderAnalysis(); else switchMode('analysis');
    return;
  }

  const mkb = e.target.closest('[data-mk-bucket]');
  if (mkb) {
    const k = mkb.dataset.mkBucket;
    openProductListDrill(`🏷 Наценка: ${MK_LABELS[k]}`, rawData.filter(r => markupBucketKey(r) === k));
    return;
  }

  const zr = e.target.closest('[data-zone-rename]');
  if (zr) {
    const z = zones.find(x => x.id === zr.dataset.zoneRename);
    if (z) { const name = prompt('Новое название зоны:', z.name); if (name && name.trim()) { z.name = name.trim(); persistZones(); openZoneModal(z.id); } }
    return;
  }
  const zd = e.target.closest('[data-zone-delete]');
  if (zd) {
    const z = zones.find(x => x.id === zd.dataset.zoneDelete);
    if (z && confirm(`Удалить зону «${z.name}»?`)) {
      zones = zones.filter(x => x.id !== z.id);
      megas.forEach(m => m.zoneIds = m.zoneIds.filter(zi => zi !== z.id));
      const before = megas.length;
      megas = megas.filter(m => m.zoneIds.length >= 2);
      zoneSel.delete(z.id);
      persistZones(); closeModal(); renderZones();
      showStatus(`Зона «${z.name}» удалена.${megas.length < before ? ' Мега-зона с <2 зон распущена.' : ''}`, 'success');
    }
    return;
  }
  const zac = e.target.closest('[data-zone-add-codes]');
  if (zac) {
    const z = zones.find(x => x.id === zac.dataset.zoneAddCodes);
    const ta = document.getElementById('zoneAddCodes');
    if (z && ta) {
      const add = [...new Set(ta.value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
      const fresh = add.filter(c => !z.codes.includes(c));
      z.codes.push(...fresh);
      persistZones(); openZoneModal(z.id);
      showStatus(fresh.length ? `➕ Добавлено в зону: ${fresh.length} артикулов.` : 'Все указанные артикулы уже в зоне.', fresh.length ? 'success' : 'error');
    }
    return;
  }
  const zrc = e.target.closest('[data-zone-remove-code]');
  if (zrc) {
    const z = zones.find(x => x.id === openZoneId);
    if (z) {
      const code = zrc.dataset.zoneRemoveCode;
      z.codes = z.codes.filter(c => String(c).trim() !== code);
      if (z.refill) delete z.refill[code];
      persistZones(); openZoneModal(z.id);
    }
    return;
  }
  const ta = e.target.closest('[data-trial-add]');
  if (ta) { trialCodes.push(ta.dataset.trialAdd); fillTrialSection(); return; }
  const tc = e.target.closest('[data-trial-commit]');
  if (tc) {
    const z = zones.find(x => x.id === openZoneId);
    if (z) {
      const code = tc.dataset.trialCommit;
      if (!z.codes.includes(code)) z.codes.push(code);
      trialCodes = trialCodes.filter(c => c !== code);
      persistZones(); openZoneModal(z.id);
    }
    return;
  }
  const trm = e.target.closest('[data-trial-remove]');
  if (trm) { trialCodes = trialCodes.filter(c => c !== trm.dataset.trialRemove); fillTrialSection(); return; }

  const mr = e.target.closest('[data-mega-rename]');
  if (mr) { megaRename(mr.dataset.megaRename); return; }
  const ms = e.target.closest('[data-mega-split]');
  if (ms) { megaSplit(ms.dataset.megaSplit); return; }
  const zoc = e.target.closest('[data-zone-open-child]');
  if (zoc) { openZoneModal(zoc.dataset.zoneOpenChild); return; }

  const back = e.target.closest('[data-back-groups]');
  if (back) { try { return openGroup(...JSON.parse(back.dataset.backGroups)); } catch (_) { return; } }
  const tab = e.target.closest('[data-tab]');
  if (tab) { currentGroupTab = tab.dataset.tab; return renderGroupCard(); }
  const p = e.target.closest('[data-open-product]');
  if (p) return openProduct(p.dataset.code, currentGroupPath);
  const g = e.target.closest('[data-open-group]');
  if (g) return openGroup(g.dataset.g1 || '', g.dataset.g2 || '', g.dataset.g3 || '');
});

modalBox.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'trialGroupSel') { trialGroupVal = t.value; fillTrialSection(); return; }
  if (t.classList.contains('refill-input') && t.dataset.refillCode !== undefined) {
    const z = zones.find(x => x.id === openZoneId);
    if (z) {
      z.refill = z.refill || {};
      z.refill[t.dataset.refillCode] = Math.max(0, +t.value || 0);
      persistZones();
      updateZoneStatuses();
    }
  }
});

// ── Переключение режимов ──
segBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode === currentMode) return;
    currentMode = btn.dataset.mode;
    segBtns.forEach(b => b.classList.toggle('active', b === btn));
    dateGroup.classList.toggle('hidden', !(currentMode === 'kлизма' || currentMode === 'sellto'));
    browsePanel.classList.toggle('hidden', currentMode !== 'browse');
    dateLabel.textContent = currentMode === 'sellto' ? '2. Дата окончания продаж (до)' : '2. Дата ввоза (до)';
    filterDateInput.value = '';
    hideAllPages();
    if (rawData.length) {
      if (currentMode === 'browse' && browseData) { rebuildGroupOptions(); applyBrowse(); }
      if (currentMode === 'top100') renderTop100();
      if (currentMode === 'issues') renderIssues();
      if (currentMode === 'dash') renderDashboard();
      if (currentMode === 'analysis') renderAnalysis();
      if (currentMode === 'gifts') renderGifts();
    }
    if (currentMode === 'zones') renderZones();
    updateBtn();
  });
});

filterDateInput.addEventListener('change', updateBtn);

// ── Кнопка «Обработать» ──
processBtn.addEventListener('click', async () => {
  showStatus('Фильтрация и расчёт...', 'success');
  processBtn.disabled = true;
  await new Promise(r => setTimeout(r, 40));

  if (currentMode === 'browse') {
    browseData = rawData.slice();
    rebuildGroupOptions();
    hideAllPages();
    applyBrowse();
    processBtn.disabled = false;
    return;
  }
  if (currentMode === 'top100')   { hideAllPages(); renderTop100(); processBtn.disabled = false; return; }
  if (currentMode === 'issues')   { hideAllPages(); renderIssues(); processBtn.disabled = false; return; }
  if (currentMode === 'dash')     { hideAllPages(); renderDashboard(); processBtn.disabled = false; return; }
  if (currentMode === 'analysis') { hideAllPages(); renderAnalysis(); processBtn.disabled = false; return; }
  if (currentMode === 'zones')    { hideAllPages(); renderZones(); processBtn.disabled = false; return; }
  if (currentMode === 'gifts')    { hideAllPages(); renderGifts(); processBtn.disabled = false; return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const targetDate = new Date(filterDateInput.value);
  targetDate.setHours(23, 59, 59, 999);

  let daysLeft = 0, filtered = [], modeName = '';

  if (currentMode === 'kлизма') {
    filtered = rawData.filter(row => {
      const importDate = parseDate(row['дата ввоза']);
      if (!importDate || importDate > targetDate) return false;
      const excl = String(row['категория искл. из автоуценки'] ?? '').toLowerCase().trim();
      if (excl.includes('не клизма')) return false;
      return true;
    });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const klizmaDay = cfg.klizmaDay || 15;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const actualDay = Math.min(klizmaDay, daysInMonth);
    let deadline = new Date(today.getFullYear(), today.getMonth(), actualDay);
    if (today > deadline) {
      const nextMonthDays = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
      deadline = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(klizmaDay, nextMonthDays));
    }
    daysLeft = Math.max(0, Math.ceil((deadline - today) / 86400000));
    modeName = 'Клизма';
  } else {
    filtered = rawData.filter(row => {
      const salesEnd = parseDate(row['дата окончания продаж']);
      if (!salesEnd || salesEnd > targetDate) return false;
      return true;
    });
    daysLeft = Math.max(0, Math.ceil((targetDate - today) / 86400000));
    modeName = 'Продать до';
  }

  if (!filtered.length) {
    showStatus('❌ Нет товаров по критериям. Проверьте дату или режим.', 'error');
    hideAllPages(); processBtn.disabled = false; return;
  }

  hideAllPages();
  renderTable(filtered, 'md', daysLeft);
  resultEl.classList.remove('hidden');
  resultTitle.textContent = `${modeName} — ${filtered.length.toLocaleString('ru-RU')} артикулов, дедлайн через ${daysLeft} дн.`;
  showStatus(`✅ Режим: ${modeName}. Найдено: ${filtered.length.toLocaleString('ru-RU')} артикулов.\nДо дедлайна: ${daysLeft} дн.\nВверху — живые итоги: как уценка влияет на валовую прибыль.`, 'success');
  processBtn.disabled = false;
});

// ── Проверка библиотек и старт ──
if (window.__bootErrors?.length) {
  showStatus(`❌ Не все файлы приложения загрузились.\n${window.__bootErrors.join('\n')}\n\nРаспакуйте архив целиком в одну папку и откройте index.html в Chrome или браузере с доступом к файлам.`, 'error');
}
if (typeof XLSX === 'undefined') {
  showStatus('❌ Не найден файл lib/xlsx.full.min.js. Скачайте его с https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js и положите в папку lib/.', 'error');
}
if (typeof Chart === 'undefined') {
  showStatus('⚠️ Не найден файл lib/chart.umd.min.js — графики работать не будут. Скачайте с https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js и положите в папку lib/.', 'error');
}
updateBtn();
