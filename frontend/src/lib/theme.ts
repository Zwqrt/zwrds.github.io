import type { ThemeMode } from '../data/types';

export type Theme = 'day' | 'night';

/** Час по Алматы (0–23). */
export function almatyHour(d = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', hour: '2-digit', hour12: false }).format(d);
  return Number(h) % 24;
}

/** «Авто»: день с 7:00 до 19:00 по Asia/Almaty, иначе ночь. */
export function resolveTheme(mode: ThemeMode, d = new Date()): Theme {
  if (mode === 'day' || mode === 'night') return mode;
  const h = almatyHour(d);
  return h >= 7 && h < 19 ? 'day' : 'night';
}

export const THEME_BG: Record<Theme, string> = { day: '#E9EEF6', night: '#070C18' };
