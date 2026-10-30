// Проверка контраста WCAG AA для пар цветов темы. Запускается только в dev-режиме.

type RGBA = [number, number, number, number];

function parse(c: string): RGBA {
  c = c.trim();
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return [0, 0, 0, 1];
}

/** Наложение полупрозрачного цвета на непрозрачный. */
export function over(top: string, bottom: string): string {
  const [r1, g1, b1, a] = parse(top);
  const [r2, g2, b2] = parse(bottom);
  const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a));
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

export function luminance(c: string): number {
  const [r, g, b] = parse(c).map((v, i) => (i < 3 ? v / 255 : v));
  const f = (s: number) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

interface Pair {
  name: string;
  fg: string;
  bg: string;
  large?: boolean;
}

const grayFromLum = (l: number) => {
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  const v = Math.round(Math.max(0, Math.min(1, s)) * 255);
  return `rgb(${v}, ${v}, ${v})`;
};

/**
 * Пары цветов темы на реальном фоне: стекло с текущей плотностью (--glass-a, её задаёт
 * автоподстройка) поверх самого неудобного участка фото (днём — самого тёмного, ночью —
 * самого светлого, уже под ночным затемнением). Без анализа фото берётся средний серый.
 */
export function themePairs(theme: 'day' | 'night', css: CSSStyleDeclaration, zoneLums?: number[]): Pair[] {
  const v = (n: string) => css.getPropertyValue(n).trim();
  const alpha = Number(v('--glass-a')) || (theme === 'day' ? 0.72 : 0.66);
  let under = '#808080';
  if (zoneLums?.length) {
    under = grayFromLum(theme === 'day' ? Math.min(...zoneLums) : Math.max(...zoneLums));
    if (theme === 'night') under = over(`rgba(5,10,24,${v('--scrim-night') || 0.66})`, under);
  } else if (theme === 'night') under = over('rgba(5,10,24,0.66)', under);
  const glass = over(theme === 'day' ? `rgba(255,255,255,${alpha})` : `rgba(14,22,36,${alpha})`, under);
  const solid = theme === 'day' ? over('rgba(255,255,255,0.94)', '#000') : over('rgba(18,26,40,0.94)', '#fff');
  const pairs: Pair[] = [
    { name: 'текст / стекло', fg: v('--text'), bg: glass },
    { name: 'серая подпись / стекло', fg: v('--text-2'), bg: glass },
    { name: 'акцентный текст / стекло', fg: v('--accent-text'), bg: glass },
    { name: 'текст / фолбэк без blur', fg: v('--text'), bg: solid },
    { name: 'серая подпись / фолбэк без blur', fg: v('--text-2'), bg: solid },
    { name: 'текст на синей кнопке', fg: v('--on-accent'), bg: v('--accent-solid') },
    { name: 'ошибка / стекло', fg: v('--danger'), bg: glass },
    { name: 'успех / стекло', fg: v('--success'), bg: glass },
    { name: 'предупреждение / стекло', fg: v('--warn'), bg: glass },
    { name: 'график-кольцо / стекло', fg: v('--accent'), bg: glass, large: true },
  ];
  for (const k of ['a', 'b', 'c', 'd']) pairs.push({ name: `чип буквы ${k.toUpperCase()}`, fg: '#ffffff', bg: v(`--chip-${k}`) });
  return pairs;
}

export function checkThemeContrast(theme: 'day' | 'night', zoneLums?: number[]): void {
  const css = getComputedStyle(document.documentElement);
  const bad = themePairs(theme, css, zoneLums)
    .map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
    .filter((p) => p.ratio < (p.large ? 3 : 4.5));
  for (const p of bad)
    console.warn(`[contrast] ${theme}: «${p.name}» ${p.fg} на ${p.bg} = ${p.ratio.toFixed(2)}:1 (< ${p.large ? 3 : 4.5})`);
  if (!bad.length) console.info(`[contrast] ${theme}: все пары проходят WCAG AA`);
}
