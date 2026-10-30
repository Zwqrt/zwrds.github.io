import { DemoProvider } from './demoProvider';
import { ServerProvider } from './serverProvider';
import { SupabaseProvider } from './supabaseProvider';
import type { DataProvider } from './types';

export type BackendKind = 'supabase' | 'server' | 'demo';

export const BACKEND = (import.meta.env.VITE_BACKEND ?? 'supabase') as BackendKind;

/** Единственное место, где выбирается бэкенд. Компоненты работают только с DataProvider. */
export function createProvider(): DataProvider {
  switch (BACKEND) {
    case 'server':
      return new ServerProvider(import.meta.env.VITE_API_URL ?? '');
    case 'demo':
      return new DemoProvider();
    default:
      return new SupabaseProvider(import.meta.env.VITE_SUPABASE_URL ?? '', import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
  }
}

export * from './types';
