/* ══════════════════════════════════════════════════════════════
   browse.js — режим «Просмотр»: фильтры, поиск по списку кодов
   ══════════════════════════════════════════════════════════════ */

let searchTimer = null;
searchInput.addEventListener('input', () => {
  if (currentMode !== 'browse' || !browseData) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyBrowse, 150);
});
[groupSel1, groupSel2, groupSel3].forEach(sel => {
  sel.addEventListener('change', () => {
    if (currentMode !== 'browse' || !browseData) return;
    rebuildGroupOptions();
    applyBrowse();
  });
});
cubeSel.addEventListener('change', () => { if (currentMode === 'browse' && browseData) applyBrowse(); });
document.querySelectorAll('.cube-check-input').forEach(cb => {
  cb.addEventListener('change', () => { if (currentMode === 'browse' && browseData) applyBrowse(); });
});
resetFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  groupSel1.value = ''; groupSel2.value = ''; groupSel3.value = '';
  cubeSel.value = '';
  document.querySelectorAll('.cube-check-input').forEach(c => c.checked = false);
  rebuildGroupOptions();
  applyBrowse();
});

function rebuildGroupOptions() {
  if (!browseData) return;
  const uniq = (arr, key) => [...new Set(arr.map(r => String(r[key] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const fillSelect = (sel, vals) => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">${sel.dataset.all || 'все'}</option>` +
      vals.map(v => `<option value="${escapeHtml(v)}"${v === cur ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('');
  };
  fillSelect(groupSel1, uniq(browseData, 'группа 1'));
  let pool = browseData;
  if (groupSel1.value) pool = pool.filter(r => String(r['группа 1'] ?? '').trim() === groupSel1.value);
  fillSelect(groupSel2, uniq(pool, 'группа 2'));
  if (groupSel2.value) pool = pool.filter(r => String(r['группа 2'] ?? '').trim() === groupSel2.value);
  fillSelect(groupSel3, uniq(pool, 'группа 3'));
  fillSelect(cubeSel, uniq(browseData, 'кубы'));
}

function getBrowseFiltered() {
  const tokens = splitTokens(searchInput.value);
  const g1 = groupSel1.value, g2 = groupSel2.value, g3 = groupSel3.value;
  const exactCube = cubeSel.value.trim();
  const checks = new Set([...document.querySelectorAll('.cube-check-input:checked')].map(c => c.value));
  return browseData.filter(r => {
    if (g1 && String(r['группа 1'] ?? '').trim() !== g1) return false;
    if (g2 && String(r['группа 2'] ?? '').trim() !== g2) return false;
    if (g3 && String(r['группа 3'] ?? '').trim() !== g3) return false;
    const cubeVal = String(r['кубы'] ?? '').trim();
    if (exactCube && cubeVal !== exactCube) return false;
    if (checks.size) {
      const k = cubeKind(cubeVal);
      if (!k || !checks.has(CUBE_KEY[k])) return false;
    }
    if (tokens.length) {
      const code = String(r['код'] ?? '').toLowerCase();
      const name = String(r['товар'] ?? '').toLowerCase();
      if (!tokens.some(t => code.includes(t) || name.includes(t))) return false;
    }
    return true;
  });
}

function applyBrowse() {
  if (!browseData) return;
  const filtered = getBrowseFiltered();
  renderTable(filtered.slice(0, BROWSE_LIMIT), 'browse', 0);
  resultEl.classList.remove('hidden');
  const parts = [];
  const checked = [...document.querySelectorAll('.cube-check-input:checked')].map(c => CUBE_LABEL_BY_KEY[c.value]);
  if (checked.length) parts.push('КУБЫ: ' + checked.join(' + '));
  if (cubeSel.value) parts.push('КУБ: ' + cubeSel.value);
  const g = [groupSel1.value, groupSel2.value, groupSel3.value].filter(Boolean);
  if (g.length) parts.push(g.join(' / '));
  const q = searchInput.value.trim();
  if (q) parts.push(`поиск: «${q}»`);
  const suffix = parts.length ? ` (${parts.join(' · ')})` : '';
  const capped = filtered.length > BROWSE_LIMIT ? ` · показаны первые ${BROWSE_LIMIT}` : '';
  resultTitle.textContent = `Просмотр${suffix} — ${filtered.length.toLocaleString('ru-RU')} артикулов${capped}`;
  if (!filtered.length) showStatus('⚠️ Ничего не найдено — ослабьте фильтры.', 'error');
  else showStatus(`✅ Просмотр: ${filtered.length.toLocaleString('ru-RU')} артикулов.`, 'success');
}