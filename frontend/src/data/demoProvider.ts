import { idbDel, idbGet, idbSet } from '../lib/idb';
import { defaultSubjects } from './defaults';
import type { DataProvider, Grade, Photo, Settings, Subject, Usage } from './types';
import { clean } from './util';

interface DemoDb {
  subjects: Subject[];
  grades: Grade[];
  photos: Photo[];
  settings: Settings | null;
}

/**
 * Локальный режим для разработки интерфейса вне Telegram (VITE_BACKEND=demo).
 * Данные лежат только в IndexedDB этого браузера. В продакшене не используется.
 */
export class DemoProvider implements DataProvider {
  readonly name = 'demo' as const;
  private urls = new Map<string, string>();

  private async load(): Promise<DemoDb> {
    return (
      (await idbGet<DemoDb>('demo', 'db')) ?? { subjects: defaultSubjects(), grades: [], photos: [], settings: null }
    );
  }
  private async mutate(fn: (d: DemoDb) => void): Promise<void> {
    const d = await this.load();
    fn(d);
    await idbSet('demo', 'db', d);
  }
  private static up<T extends { id: string }>(list: T[], row: T) {
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0) list[i] = row;
    else list.push(row);
  }

  async auth(): Promise<void> {}
  listSubjects = async () => (await this.load()).subjects.slice().sort((a, b) => a.sort - b.sort);
  upsertSubject = (s: Subject) => this.mutate((d) => DemoProvider.up(d.subjects, clean(s)));
  listGrades = async () => (await this.load()).grades;
  upsertGrade = (g: Grade) =>
    this.mutate((d) => DemoProvider.up(d.grades, clean({ ...g, created_at: g.created_at ?? new Date().toISOString() })));
  deleteGrade = (id: string) => this.mutate((d) => void (d.grades = d.grades.filter((g) => g.id !== id)));
  listPhotos = async () => (await this.load()).photos.slice().sort((a, b) => b.date.localeCompare(a.date));
  async savePhoto(p: Photo, file: Blob) {
    await idbSet('demo-files', p.path, file);
    await this.mutate((d) => DemoProvider.up(d.photos, clean(p)));
  }
  async deletePhoto(p: Photo) {
    await idbDel('demo-files', p.path);
    await this.mutate((d) => {
      d.photos = d.photos.filter((x) => x.id !== p.id);
      d.grades = d.grades.map((g) => (g.photo_id === p.id ? { ...g, photo_id: null } : g));
    });
  }
  async photoUrls(photos: Photo[]) {
    const out: Record<string, string> = {};
    for (const p of photos) {
      if (!this.urls.has(p.id)) {
        const b = await idbGet<Blob>('demo-files', p.path);
        if (b) this.urls.set(p.id, URL.createObjectURL(b));
      }
      const u = this.urls.get(p.id);
      if (u) out[p.id] = u;
    }
    return out;
  }
  async photoBlob(p: Photo) {
    const b = await idbGet<Blob>('demo-files', p.path);
    if (!b) throw new Error('Файл не найден');
    return b;
  }
  getSettings = async () => (await this.load()).settings;
  saveSettings = (s: Settings) => this.mutate((d) => void (d.settings = s));
  async usage(): Promise<Usage> {
    const d = await this.load();
    return {
      db_bytes: JSON.stringify(d).length,
      storage_bytes: d.photos.reduce((a, p) => a + p.size, 0),
      db_limit: null,
      storage_limit: null,
    };
  }
}
