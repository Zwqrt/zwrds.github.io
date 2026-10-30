import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeSettings } from './defaults';
import {
  AuthError,
  NetworkError,
  type DataProvider,
  type Grade,
  type Photo,
  type Settings,
  type Subject,
  type Usage,
} from './types';
import { clean } from './util';

const BUCKET = 'photos';
const URL_TTL = 60 * 60; // секунд

export class SupabaseProvider implements DataProvider {
  readonly name = 'supabase' as const;
  private sb: SupabaseClient;
  private urlCache = new Map<string, { url: string; exp: number }>();

  constructor(url: string, anonKey: string) {
    if (!url || !anonKey) throw new AuthError('Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY', 'config');
    this.sb = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'kartu-auth',
        // Во встроенном браузере Telegram блокировка navigator.locks иногда зависает навсегда,
        // и вместе с ней — любой запрос. Приложение однооконное, блокировка не нужна.
        lock: async (_name, _timeout, fn) => fn(),
      },
    });
  }

  async auth(initData: string): Promise<void> {
    let res;
    try {
      res = await this.sb.functions.invoke('verify-telegram', { body: { initData } });
    } catch (e) {
      throw new NetworkError(String(e));
    }
    if (res.error) {
      let status = 0;
      let message = res.error.message;
      if (res.error instanceof FunctionsHttpError) {
        status = res.error.context.status;
        try {
          message = (await res.error.context.json()).error ?? message;
        } catch {
          /* тело не JSON */
        }
      } else {
        throw new NetworkError(message);
      }
      throw new AuthError(message, status === 403 ? 'forbidden' : 'invalid');
    }
    const { access_token, refresh_token } = res.data as { access_token: string; refresh_token: string };
    const { error } = await this.sb.auth.setSession({ access_token, refresh_token });
    if (error) throw new AuthError(error.message, 'invalid');
  }

  private check<T>(r: { data: T; error: { message: string } | null }): T {
    if (r.error) {
      if (/fetch|network/i.test(r.error.message)) throw new NetworkError(r.error.message);
      throw new Error(r.error.message);
    }
    return r.data;
  }

  async listSubjects(): Promise<Subject[]> {
    return this.check(await this.sb.from('subjects').select('*').order('sort')) as Subject[];
  }
  async upsertSubject(s: Subject): Promise<void> {
    this.check(await this.sb.from('subjects').upsert(clean({ ...s, updated_at: new Date().toISOString() })));
  }

  async listGrades(): Promise<Grade[]> {
    return this.check(await this.sb.from('grades').select('*').order('date').order('created_at')) as Grade[];
  }
  async upsertGrade(g: Grade): Promise<void> {
    this.check(await this.sb.from('grades').upsert(clean({ ...g, updated_at: new Date().toISOString() })));
  }
  async deleteGrade(id: string): Promise<void> {
    this.check(await this.sb.from('grades').delete().eq('id', id));
  }

  async listPhotos(): Promise<Photo[]> {
    return this.check(await this.sb.from('photos').select('*').order('date', { ascending: false })) as Photo[];
  }
  async savePhoto(p: Photo, file: Blob): Promise<void> {
    const up = await this.sb.storage.from(BUCKET).upload(p.path, file, { contentType: 'image/jpeg', upsert: true });
    if (up.error) this.check({ data: null, error: up.error });
    this.check(await this.sb.from('photos').upsert(clean(p)));
  }
  async deletePhoto(p: Photo): Promise<void> {
    this.check(await this.sb.from('photos').delete().eq('id', p.id));
    await this.sb.storage.from(BUCKET).remove([p.path]);
    this.urlCache.delete(p.path);
  }
  async photoUrls(photos: Photo[]): Promise<Record<string, string>> {
    const now = Date.now();
    const out: Record<string, string> = {};
    const missing: Photo[] = [];
    for (const p of photos) {
      const c = this.urlCache.get(p.path);
      if (c && c.exp > now + 60_000) out[p.id] = c.url;
      else missing.push(p);
    }
    if (missing.length) {
      const r = await this.sb.storage.from(BUCKET).createSignedUrls(
        missing.map((p) => p.path),
        URL_TTL,
      );
      const data = this.check(r) ?? [];
      data.forEach((d, i) => {
        if (d.signedUrl) {
          out[missing[i].id] = d.signedUrl;
          this.urlCache.set(missing[i].path, { url: d.signedUrl, exp: now + URL_TTL * 1000 });
        }
      });
    }
    return out;
  }
  async photoBlob(p: Photo): Promise<Blob> {
    const r = await this.sb.storage.from(BUCKET).download(p.path);
    if (r.error || !r.data) throw new Error(r.error?.message ?? 'Не удалось скачать фото');
    return r.data;
  }

  async getSettings(): Promise<Settings | null> {
    const rows = this.check(await this.sb.from('settings').select('value').eq('key', 'app')) as { value: Settings }[];
    return rows.length ? normalizeSettings(rows[0].value) : null;
  }
  async saveSettings(s: Settings): Promise<void> {
    this.check(await this.sb.from('settings').upsert({ key: 'app', value: s, updated_at: new Date().toISOString() }));
  }

  async usage(): Promise<Usage> {
    const r = this.check(await this.sb.rpc('usage_stats')) as { db_bytes: number; storage_bytes: number };
    return { ...r, db_limit: 500 * 1024 * 1024, storage_limit: 1024 * 1024 * 1024 };
  }
}
