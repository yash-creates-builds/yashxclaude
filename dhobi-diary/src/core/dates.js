// Dates are stored as plain 'YYYY-MM-DD' strings (local time) so they never shift across time zones.

const pad = (n) => String(n).padStart(2, '0');

export const toISODate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };
export const monthOf = (iso) => iso.slice(0, 7); // 'YYYY-MM'
export const thisMonth = () => monthOf(today());
export const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d || 1); };

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
