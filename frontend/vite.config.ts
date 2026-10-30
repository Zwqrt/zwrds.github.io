/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  // Интеграция Supabase в Vercel добавляет свои имена переменных. Берём из них ТОЛЬКО
  // публичные адрес и anon-ключ — по точному имени. Секретные SUPABASE_SERVICE_ROLE_KEY,
  // SUPABASE_JWT_SECRET, POSTGRES_* в сборку не попадают никогда.
  const pick = (...names: string[]) => names.map((n) => env[n]).find((v) => v) ?? '';
  const supabaseUrl = pick('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
  const supabaseAnon = pick(
    'VITE_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
  );

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnon),
    },
    server: {
      proxy: {
        // режим server при локальной разработке: FastAPI на 8000
        '/api': 'http://localhost:8000',
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
