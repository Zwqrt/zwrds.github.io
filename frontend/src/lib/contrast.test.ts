import { describe, expect, it } from 'vitest';
import { contrastRatio, over } from './contrast';

describe('контраст WCAG', () => {
  it('чёрный на белом = 21:1', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
  });
  it('наложение полупрозрачного', () => {
    expect(over('rgba(255,255,255,0.5)', '#000000')).toBe('rgb(128, 128, 128)');
  });
  it('палитра темы проходит AA даже на минимальной плотности стекла поверх серого', () => {
    const dayGlass = over('rgba(255,255,255,0.72)', '#808080');
    for (const c of ['#0b1324', '#3b475c', '#1748b0', '#9f1d13', '#10602f', '#7a4205'])
      expect(contrastRatio(c, dayGlass)).toBeGreaterThanOrEqual(4.5);
    const nightGlass = over('rgba(14,22,36,0.66)', over('rgba(5,10,24,0.66)', '#ffffff'));
    for (const c of ['#f2f6ff', '#b9c4d8', '#8ab4ff', '#ff9b91', '#6fd99d', '#ffc27a'])
      expect(contrastRatio(c, nightGlass)).toBeGreaterThanOrEqual(4.5);
    for (const chip of ['#17703f', '#1c57c2', '#9a5309', '#b42318']) expect(contrastRatio('#ffffff', chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', '#1f5fe0')).toBeGreaterThanOrEqual(4.5);
  });
});
