// Тонкая обёртка над telegram-web-app.js. Вне Telegram все вызовы безопасно ничего не делают.

interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}
interface TgWebApp {
  initData: string;
  version: string;
  platform: string;
  viewportHeight: number;
  viewportStableHeight: number;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  disableVerticalSwipes?(): void;
  onEvent(e: string, cb: () => void): void;
  offEvent(e: string, cb: () => void): void;
  BackButton: TgBackButton;
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(t: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg: TgWebApp | undefined = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

export const initData = (): string => tg?.initData ?? '';
export const inTelegram = (): boolean => !!tg?.initData;

const atLeast = (v: string) => !!tg && tg.isVersionAtLeast?.(v);

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (atLeast('7.7')) tg.disableVerticalSwipes?.();
  const apply = () => {
    const root = document.documentElement.style;
    if (tg.viewportStableHeight) root.setProperty('--tg-stable-h', `${tg.viewportStableHeight}px`);
    if (tg.viewportHeight) root.setProperty('--tg-h', `${tg.viewportHeight}px`);
  };
  apply();
  tg.onEvent('viewportChanged', apply);
}

export function setTelegramColors(bg: string): void {
  if (!tg || !atLeast('6.1')) return;
  try {
    tg.setHeaderColor?.(bg);
    tg.setBackgroundColor?.(bg);
  } catch {
    /* старый клиент */
  }
}

export const haptic = {
  select: () => (atLeast('6.1') ? tg?.HapticFeedback?.selectionChanged() : undefined),
  tap: () => (atLeast('6.1') ? tg?.HapticFeedback?.impactOccurred('light') : undefined),
  success: () => (atLeast('6.1') ? tg?.HapticFeedback?.notificationOccurred('success') : undefined),
  error: () => (atLeast('6.1') ? tg?.HapticFeedback?.notificationOccurred('error') : undefined),
  warning: () => (atLeast('6.1') ? tg?.HapticFeedback?.notificationOccurred('warning') : undefined),
};

/** Привязывает BackButton Telegram к обработчику; null — скрыть. */
export function bindBackButton(handler: (() => void) | null): () => void {
  if (!tg || !atLeast('6.1')) return () => {};
  if (!handler) {
    tg.BackButton.hide();
    return () => {};
  }
  tg.BackButton.onClick(handler);
  tg.BackButton.show();
  return () => tg.BackButton.offClick(handler);
}

/** Подтверждение: нативный диалог Telegram, вне его — window.confirm. */
export function confirmAsync(message: string): Promise<boolean> {
  const w = tg as (TgWebApp & { showConfirm?: (m: string, cb: (ok: boolean) => void) => void }) | undefined;
  if (w?.showConfirm && atLeast('6.2')) return new Promise((res) => w.showConfirm!(message, res));
  return Promise.resolve(window.confirm(message));
}
