import { load, save } from './store.js';

export const DEFAULT_DISHES = [
  { id: 'dal', name: 'Dal', emoji: '🟡', count: 3 },
  { id: 'rice', name: 'Rice', emoji: '🍚', count: 2 },
  { id: 'rajma', name: 'Rajma', emoji: '🫘', count: 6 },
  { id: 'chole', name: 'Chole', emoji: '🧆', count: 6 },
  { id: 'aloo', name: 'Aloo', emoji: '🥔', count: 3 },
  { id: 'khichdi', name: 'Khichdi', emoji: '🍲', count: 3 },
  { id: 'custom', name: 'Custom', emoji: '✨', count: 4 },
];

export const MIN_COUNT = 1;
export const MAX_COUNT = 20;

export function getDishes() {
  const saved = load('presets', {});
  return DEFAULT_DISHES.map((d) => ({ ...d, count: saved[d.id] ?? d.count, edited: saved[d.id] != null && saved[d.id] !== d.count }));
}

export function setDishCount(id, count) {
  const saved = load('presets', {});
  saved[id] = Math.max(MIN_COUNT, Math.min(MAX_COUNT, count));
  save('presets', saved);
}

export function resetDishes() {
  save('presets', {});
}
