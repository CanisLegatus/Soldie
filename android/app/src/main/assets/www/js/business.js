/* Business rules shared by the offline UI and regression tests. No DOM or storage. */
(function (root) {
  'use strict';
  function date(value) {
    if (value instanceof Date) {
      if (isNaN(value)) return null;
      const d = new Date(value); d.setHours(0, 0, 0, 0); return d;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const d = new Date(1899, 11, 30); d.setDate(d.getDate() + Math.floor(value)); return d;
    }
    const text = String(value ?? '').trim();
    let m = text.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (m) m = [m[0], m[3], m[2], m[1]];
    else m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (!m) return null;
    const y = +m[1], month = +m[2], day = +m[3];
    const d = new Date(y, month - 1, day);
    return d.getFullYear() === y && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
  }
  function dayNumber(value) {
    const d = date(value);
    return d ? Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 : null;
  }
  function daysBetween(from, to) {
    const a = dayNumber(from), b = dayNumber(to); return a === null || b === null ? null : b - a;
  }
  function roundedPrice(value) {
    const cents = Math.floor((Number(value) + 1e-8) * 100);
    if (!Number.isFinite(cents) || cents < 100) return 1;
    if (cents >= 100000) return Math.max(999.9, Math.floor((cents / 100 - 9) / 10) * 10 + 9);
    if (cents >= 990) return Math.max(1, (Math.floor((cents - 990) / 1000) * 1000 + 990) / 100);
    return Math.max(1, (Math.floor((cents - 90) / 100) * 100 + 90) / 100);
  }
  function isMarkdownDay(d) { return d.getDay() === 2 || d.getDay() === 5; }
  function nextMarkdownDay(value) {
    const d = date(value); while (!isMarkdownDay(d)) d.setDate(d.getDate() + 1); return d;
  }
  function klizmaDeadline(value) {
    const today = date(value), d = new Date(today.getFullYear(), today.getMonth(), 15);
    if (today > d) d.setMonth(d.getMonth() + 1); return d;
  }
  function finalMarkdownDay(deadline, mode) {
    const d = date(deadline);
    if (mode === 'kлизма') while (!isMarkdownDay(d)) d.setDate(d.getDate() - 1);
    return d;
  }
  function markdown(current, stockDays, deadline, mode, value) {
    const today = date(value), end = date(deadline);
    if (!end) return { price: current, reason: 'Нет даты окончания продаж', daysLeft: null };
    const daysLeft = daysBetween(today, end), expired = daysLeft < 0;
    const action = mode === 'kлизма' ? nextMarkdownDay(today) : today;
    const final = finalMarkdownDay(end, mode);
    if (mode === 'kлизма' && !expired && action > end) {
      return { price: current, daysLeft, expired: false, actionDate: final, blocked: true,
        reason: 'Пропущена финальная переоценка ' + final.toLocaleDateString('ru-RU') + '. Вне вторника/пятницы переоценка запрещена.' };
    }
    const wait = daysBetween(today, action);
    let price = current, reason = 'Успеваем продать по текущей цене';
    if (expired) { price = 1; reason = 'Срок прошёл — товара уже не должно быть'; }
    else if (action >= final) { price = 1; reason = 'Финальная переоценка — 1 ₽'; }
    else {
      const sellingDays = Math.max(1, daysBetween(action, end));
      const remainingStockDays = Math.max(0, stockDays - wait);
      if (stockDays >= 9999 || !Number.isFinite(stockDays)) {
        // Reassess at each Tue/Fri step; stronger pressure as the final step approaches.
        const steps = markdownSteps(action, final);
        price = roundedPrice(current * (1 - Math.min(0.7, 0.2 + 0.5 / steps)));
        reason = 'Нет продаж — пробная скидка с пересмотром во вторник/пятницу';
      } else if (remainingStockDays > sellingDays) {
        const ratio = remainingStockDays / sellingDays;
        const next = new Date(action); next.setDate(next.getDate() + 1);
        const untilReview = Math.max(1, daysBetween(action, nextMarkdownDay(next)));
        const discount = Math.min(0.9, Math.max(0.2, 1 - Math.pow(1 / ratio, 0.6), untilReview / sellingDays * 0.2));
        price = roundedPrice(current * (1 - discount));
        reason = 'Темп недостаточен — скидка до следующей переоценки';
      } else if (!(stockDays > 0)) reason = 'Нет данных о скорости — текущая цена';
    }
    return { price: Math.max(1, Math.min(current > 0 ? current : 1, price)), daysLeft, expired,
      actionDate: action, deferred: action > today, reason };
  }
  function markdownSteps(from, to) {
    let count = 0; const d = date(from);
    while (d <= to) { if (isMarkdownDay(d)) count++; d.setDate(d.getDate() + 1); }
    return Math.max(1, count);
  }
  function slow(stock, sold) { return stock > 0 && sold >= 0 && stock + sold > 0 && sold / (stock + sold) < 0.2 * 28 / 21; }
  function payout(accrued, minimum) { return accrued >= minimum ? accrued : 0; }
  const rules = { date, daysBetween, roundedPrice, klizmaDeadline, finalMarkdownDay, nextMarkdownDay, markdown, slow, payout };
  root.SoldieRules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})(typeof window !== 'undefined' ? window : globalThis);
