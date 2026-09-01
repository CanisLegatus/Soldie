window.__bootStamp && window.__bootStamp('js/verify.js: выполнение');
/* Быстрая проверка товара на полке: SKU, его группа и КУБ. */
function renderVerify() {
  if (!rawData.length) { showStatus('❌ Сначала загрузите файл.', 'error'); return; }
  verifyCard.classList.remove('hidden');
  const code=String(verifyCodeInput.value || '').trim();
  if (!code) { verifyContent.innerHTML='<div class="alert-item alert-ok">Введите артикул: покажем остаток, продажи, группу и агрегированную карточку КУБА.</div>'; return; }
  const r=codeIndex.get(code);
  if (!r) { verifyContent.innerHTML=`<div class="alert-item alert-warn">Артикул <b>${escapeHtml(code)}</b> не найден в загруженном отчёте.</div>`; return; }
  const g1=String(r['группа 1']||'').trim(), g2=String(r['группа 2']||'').trim(), g3=String(r['группа 3']||'').trim(), cube=String(r['кубы']||'').trim();
  const group=rawData.filter(x=>String(x['группа 1']||'').trim()===g1 && String(x['группа 2']||'').trim()===g2 && String(x['группа 3']||'').trim()===g3), G=aggRows(group), gp=rowGp(r), margin=num(r['то, руб'])>0 ? gp/num(r['то, руб'])*100 : 0;
  verifyContent.innerHTML=`<div class="kpi-grid">${tileHtml('Склад',fmt(num(r['склад кол']))+' шт','kpi-accent',fmt(itemFrozen(r))+' ₽')}${tileHtml('Продано',fmt(num(r['продано (шт)']))+' шт')}${tileHtml('ТО',fmt(num(r['то, руб']))+' ₽')}${tileHtml('ВП',fmt(gp)+' ₽','',`маржа ${margin.toFixed(1)}%`)}${tileHtml('Запас',fmtDays(stockDaysLeft(r).days)+' дн.','',`${dailyRate(r).toFixed(2)} шт/дн`)}</div><div class="problem-card"><div class="problem-head"><span class="problem-name"><b>${escapeHtml(code)}</b> — ${escapeHtml(r['товар'])}</span>${cubeBadge(cube)}</div><div class="breadcrumb">${escapeHtml([g1,g2,g3].filter(Boolean).join(' › ') || 'Без группы')}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn-ghost" data-open-product data-code="${escapeHtml(code)}">Открыть карточку товара</button><button type="button" class="btn-ghost" data-open-group data-g1="${escapeHtml(g1)}" data-g2="${escapeHtml(g2)}" data-g3="${escapeHtml(g3)}">Группа: ${fmt(G.sku)} SKU · ТО ${fmt(G.to)} ₽</button>${cube ? `<button type="button" class="btn-ghost" data-open-cube="${escapeHtml(cube)}">КУБ: ${escapeHtml(cube)} · открыть агрегат</button>` : ''}</div></div>`;
}
verifyCodeBtn.addEventListener('click', renderVerify);
verifyCodeInput.addEventListener('keydown', e=>{ if(e.key==='Enter') renderVerify(); });
verifyContent.addEventListener('click', e=>{ const p=e.target.closest('[data-open-product]'); if(p)return openProduct(p.dataset.code,null); const g=e.target.closest('[data-open-group]'); if(g)return openGroup(g.dataset.g1||'',g.dataset.g2||'',g.dataset.g3||''); const c=e.target.closest('[data-open-cube]'); if(c)openCube(c.dataset.openCube); });
