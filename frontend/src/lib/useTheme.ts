import { useEffect, useState } from 'react';
import type { ThemeMode } from '../data/types';
import { analyzeImage, applyBgStats, type BgStats } from './bgAnalyze';
import { checkThemeContrast } from './contrast';
import { setTelegramColors } from './telegram';
import { THEME_BG, resolveTheme, type Theme } from './theme';
import bgDay from '../assets/bg-day.jpg';
import bgNight from '../assets/bg-night.jpg';

// Через импорт: Vite добавляет хэш в имя файла, и новый фон не застревает в кэше Telegram.
const BG_URL: Record<Theme, string> = { day: bgDay, night: bgNight };

/** Тема (авто по Алматы), анализ фона и dev-проверка контраста. */
export function useTheme(mode: ThemeMode): Theme {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(mode));
  const [stats, setStats] = useState<BgStats | null>(null);

  useEffect(() => {
    setTheme(resolveTheme(mode));
    if (mode !== 'auto') return;
    const t = window.setInterval(() => setTheme(resolveTheme('auto')), 60_000);
    return () => window.clearInterval(t);
  }, [mode]);

  // Анализируем то фото, которое сейчас на фоне.
  useEffect(() => {
    let alive = true;
    setStats(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => alive && setStats(analyzeImage(img));
    img.onerror = () => alive && setStats(null);
    img.src = BG_URL[theme];
    return () => {
      alive = false;
    };
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    applyBgStats(stats, theme);
    setTelegramColors(THEME_BG[theme]);
    if (import.meta.env.DEV) checkThemeContrast(theme, stats ? [stats.top.lum, stats.mid.lum, stats.bottom.lum] : undefined);
  }, [theme, stats]);

  return theme;
}
