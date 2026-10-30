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

const TOKEN_KEY = 'kartu-server-token';

/** Свой бэкенд (FastAPI + SQLite) по REST. */
export class ServerProvider implements DataProvider {
  readonly name = 'server' as const;
  private token: string | null = null;

  constructor(private base: string) {
    this.base = base.replace(/\/$/, '');
    try {
      this.token = sessionStorage.getItem(TOKEN_KEY);
    } catch {
      /* нет sessionStorage */
    }
  }

  private async req<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetch(`${this.base}/api${path}`, { method, headers, body: payload });
    } catch (e) {
      throw new NetworkError(String(e));
    }
    if (res.status === 401 || res.status === 403) {
      let msg = 'Нет доступа';
      try {
        msg = (await res.json()).detail ?? msg;
      } catch {
        /* пусто */
      }
      throw new AuthError(msg, res.status === 403 ? 'forbidden' : 'invalid');
    }
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    if (raw) return (await res.blob()) as T;
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async auth(initData: string): Promise<void> {
    const r = await this.req<{ token: string }>('POST', '/auth', { initData });
    this.token = r.token;
    try {
      sessionStorage.setItem(TOKEN_KEY, r.token);
    } catch {
      /* пусто */
    }
  }

  listSubjects = () => this.req<Subject[]>('GET', '/subjects');
  upsertSubject = (s: Subject) => this.req<void>('PUT', `/subjects/${s.id}`, clean(s));

  listGrades = () => this.req<Grade[]>('GET', '/grades');
  upsertGrade = (g: Grade) => this.req<void>('PUT', `/grades/${g.id}`, clean(g));
  deleteGrade = (id: string) => this.req<void>('DELETE', `/grades/${id}`);

  listPhotos = () => this.req<Photo[]>('GET', '/photos');
  async savePhoto(p: Photo, file: Blob): Promise<void> {
    const fd = new FormData();
    fd.append('meta', JSON.stringify(clean(p)));
    fd.append('file', file, `${p.id}.jpg`);
    await this.req<void>('PUT', `/photos/${p.id}`, fd);
  }
  deletePhoto = (p: Photo) => this.req<void>('DELETE', `/photos/${p.id}`);
  async photoUrls(photos: Photo[]): Promise<Record<string, string>> {
    if (!photos.length) return {};
    const r = await this.req<Record<string, string>>('POST', '/photos/urls', { ids: photos.map((p) => p.id) });
    const out: Record<string, string> = {};
    for (const [id, url] of Object.entries(r)) out[id] = url.startsWith('http') ? url : `${this.base}${url}`;
    return out;
  }
  photoBlob = (p: Photo) => this.req<Blob>('GET', `/photos/${p.id}/file`, undefined, true);

  async getSettings(): Promise<Settings | null> {
    const r = await this.req<Settings | null>('GET', '/settings');
    return r ? normalizeSettings(r) : null;
  }
  saveSettings = (s: Settings) => this.req<void>('PUT', '/settings', s);

  usage = () => this.req<Usage>('GET', '/usage');
}
