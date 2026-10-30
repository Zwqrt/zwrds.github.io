// Автоподстройка читаемости: средняя яркость и «пестрота» верха, середины и низа фото фона.

export interface Zone {
  /** Относительная яркость 0..1 (WCAG). */
  lum: number;
  /** Стандартное отклонение яркости 0..~0.5 — насколько участок пёстрый. */
  busy: number;
}
export interface BgStats {
  top: Zone;
  mid: Zone;
  bottom: Zone;
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function analyzeImage(img: HTMLImageElement): BgStats | null {
  try {
    const W = 48;
    const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    const zone = (y0: number, y1: number): Zone => {
      let sum = 0;
      let sq = 0;
      let n = 0;
      for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const l = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
          sum += l;
          sq += l * l;
          n++;
        }
      const lum = sum / n;
      return { lum, busy: Math.sqrt(Math.max(0, sq / n - lum * lum)) };
    };
    return { top: zone(0, 0.25), mid: zone(0.25, 0.75), bottom: zone(0.75, 1) };
  } catch {
    return null; // canvas «испачкан» или нет поддержки
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Переводит статистику фото в CSS-переменные: силу scrim сверху/снизу и
 * плотность стекла по зонам. Чем светлее (ночью) / темнее и пестрее (днём) участок — тем
 * плотнее. Минимумы плотности из ТЗ (0.72 день / 0.66 ночь) никогда не нарушаются.
 */
export function applyBgStats(stats: BgStats | null, theme: 'day' | 'night'): void {
  const root = document.documentElement.style;
  const vals: Record<string, number> = {};
  const set = (k: string, v: number) => {
    vals[k] = v;
    root.setProperty(k, v.toFixed(3));
  };
  const finish = () =>
    set('--glass-a', Math.max(vals['--glass-a-top'], vals['--glass-a-mid'], vals['--glass-a-bottom']));
  if (!stats) {
    for (const z of ['top', 'mid', 'bottom']) set(`--glass-a-${z}`, theme === 'day' ? 0.8 : 0.74);
    set('--scrim-top', theme === 'day' ? 0.55 : 0);
    set('--scrim-bottom', theme === 'day' ? 0.55 : 0);
    set('--scrim-night', 0.3);
    finish();
    return;
  }
  if (theme === 'day') {
    // Тёмный текст на белом стекле: тёмный или пёстрый фон — делаем стекло плотнее.
    const alpha = (z: Zone) => clamp(0.72 + (0.55 - z.lum) * 0.3 + z.busy * 0.6, 0.72, 0.9);
    set('--glass-a-top', alpha(stats.top));
    set('--glass-a-mid', alpha(stats.mid));
    set('--glass-a-bottom', alpha(stats.bottom));
    set('--scrim-top', clamp(0.45 + (0.5 - stats.top.lum) * 0.6 + stats.top.busy, 0.45, 0.85));
    set('--scrim-bottom', clamp(0.45 + (0.5 - stats.bottom.lum) * 0.6 + stats.bottom.busy, 0.45, 0.85));
  } else {
    // Светлый текст на тёмном стекле. Ночное фото уже тёмное, но светлые участки
    // (окна, фонари, луна) — затемняем сильнее.
    const alpha = (z: Zone) => clamp(0.66 + z.lum * 0.3 + z.busy * 0.5, 0.66, 0.88);
    set('--glass-a-top', alpha(stats.top));
    set('--glass-a-mid', alpha(stats.mid));
    set('--glass-a-bottom', alpha(stats.bottom));
    const avg = (stats.top.lum + stats.mid.lum + stats.bottom.lum) / 3;
    set('--scrim-night', clamp(0.2 + avg * 1.5, 0.2, 0.6));
    set('--scrim-top', clamp(stats.top.lum * 0.6, 0, 0.4));
    set('--scrim-bottom', clamp(stats.bottom.lum * 0.6, 0, 0.4));
  }
  finish();
}
