import { NetworkError } from './types';

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export const todayAlmaty = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );

export function isNetworkError(e: unknown): boolean {
  if (e instanceof NetworkError) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|network/i.test(msg);
}

/** Убираем служебные поля перед отправкой. */
export function clean<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v;
  return out as T;
}
