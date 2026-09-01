window.__bootStamp && window.__bootStamp('js/top100.js: выполнение');
/* ══════════════════════════════════════════════════════════════
   top100.js — ТОП-100 магазина
   ══════════════════════════════════════════════════════════════ */

function renderTop100() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  const metricFn = METRIC_FNS[topMetric];
  const sorted = [...rawData].sort((a, b) => metricFn(b) - metricFn(a));
  let tops = sorted.slice(0, 100);

  const tokens = splitTokens(topCodesValue);
  if (tokens.length) {
    tops = tops.filter(r => {
      const code = String(r['код'] ?? '').toLowerCase();
      const name = String(r['товар'] ?? '').toLowerCase();
      return tokens.some(t => code.includes(t) || name.includes(t));
    });
  }

  const totalAll = rawData.reduce((s, r) => s + num(r['то, руб']), 0);
  const totalTop = tops.reduce((s, r) => s + num(r['то, руб']), 0);
  const share = totalAll > 0 ? (totalTop / totalAll * 100).toFixed(1) : '—';
  const unit = topMetric === 'qty' ? ' шт' : ' ₽';

  topTitle.textContent = `🏆 ТОП-100 магазина — ${METRIC_TITLES[topMetric]}`;

  const tabs = ['to', 'qty', 'gp'].map(k =>
    `<button type="button" class="tab-btn ${k === topMetric ? 'active' : ''}" data-top-metric="${k}">${METRIC_TAB_LABELS[k]}</button>`).join('');

  const rowsHtml = tops.map((r, i) => {
    const code = String(r['код'] ?? '').trim();
    const stock = num(r['склад кол']);
    const mk = rowGpMarkup(r);
    const flags = [
      stock <= 0 ? '🚫' : (isFinite(stockDaysLeft(r).days) && stockDaysLeft(r).days <= 14 ? '⏳' : ''),
      cubeKind(r['кубы']) ? '🏷' : ''
    ].filter(Boolean).join(' ');
    return `<tr>
      <td>${i + 1}</td>
      <td><span class="link-cell" data-open-product data-code="${escapeHtml(code)}">${escapeHtml(code)}</span></td>
      <td style="white-space:normal">${escapeHtml(truncateStr(r['товар'], 60))}</td>
      <td>${escapeHtml(String(r['группа 1'] ?? '').trim() || '—')}</td>
      <td>${cubeBadge(r['кубы'])}</td>
      <td>${fmt(stock)}</td>
      <td>${daysBadgeR(r)}</td>
      <td style="font-weight:700">${fmt(metricFn(r))}${unit}</td>
      <td class="${rowGp(r) < 0 ? 'fire-text' : ''}">${fmt(rowGp(r))} ₽</td>
      <td>${mk === null ? '—' : mk.toFixed(1) + '%'}</td>
      <td>${flags || '—'}</td>
    </tr>`;
  }).join('');

  topContent.innerHTML = `
    <div class="tabs">${tabs}</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px">
      <input type="text" id="topCodesFilter" class="search-input" style="max-width:360px" placeholder="🔎 Фильтр по списку кодов (пробел/запятая)" value="${escapeHtml(topCodesValue)}">
      ${tokens.length ? '<span class="hint">фильтр активен — показано ' + tops.length + ' из топ-100</span>' : ''}
    </div>
    <div class="top-summary">ТОП-100 даёт <b>${fmt(totalTop)} ₽</b> ТО — это <b>${share}%</b> всего ТО магазина (${fmt(totalAll)} ₽). 🚫 сток пуст · ⏳ стока ≤ 14 дн. · 🏷 проблемный КУБ.</div>
    <div class="table-wrapper" style="max-height:60vh">
      <table class="sortable">
        <thead><tr><th>№</th><th>Код</th><th>Товар</th><th>Группа 1</th><th>КУБЫ</th><th>Склад</th><th>Ост. дней</th><th>${METRIC_TITLES[topMetric]}</th><th>ВП</th><th>Наценка</th><th>Флаги</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="11">Ничего не найдено по фильтру</td></tr>'}</tbody>
      </table>
    </div>
  `;
  const tf = document.getElementById('topCodesFilter');
  if (tf) {
    tf.addEventListener('input', () => {
      topCodesValue = tf.value;
      clearTimeout(tf._t);
      tf._t = setTimeout(renderTop100, 200);
    });
  }
  topCard.classList.remove('hidden');
  showStatus(`✅ ТОП-100 рассчитан по метрике «${METRIC_TITLES[topMetric]}».`, 'success');
}

topCard.addEventListener('click', e => {
  const t = e.target.closest('[data-top-metric]');
  if (t) { topMetric = t.dataset.topMetric; renderTop100(); return; }
  const p = e.target.closest('[data-open-product]');
  if (p) openProduct(p.dataset.code, null);
});