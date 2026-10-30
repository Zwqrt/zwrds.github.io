import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createProvider } from '../data';
import { defaultSubjects, normalizeSettings } from '../data/defaults';
import { AuthError, type DataProvider, type Grade, type Photo, type Settings, type Subject } from '../data/types';
import { isNetworkError, uuid } from '../data/util';
import { compressImage } from '../lib/image';
import { dequeue, enqueue, loadSnapshot, queued, saveSnapshot, type QueueItem } from '../lib/offline';
import { haptic, initData } from '../lib/telegram';

export type Status = 'loading' | 'ready' | 'offline' | 'error';

export interface AppError {
  code: AuthError['code'] | 'network' | 'unknown';
  message: string;
}

interface Snapshot {
  subjects: Subject[];
  grades: Grade[];
  photos: Photo[];
  settings: Settings;
}

export interface Store {
  provider: DataProvider;
  status: Status;
  error: AppError | null;
  subjects: Subject[];
  grades: Grade[];
  photos: Photo[];
  settings: Settings;
  pending: number;
  urls: Record<string, string>;
  toast: string | null;
  showToast(msg: string): void;
  reload(): Promise<void>;
  sync(): Promise<void>;
  saveGrade(g: Grade, photo?: Blob | null): Promise<'saved' | 'queued'>;
  deleteGrade(id: string): Promise<void>;
  saveSubject(s: Subject): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  addPhotos(files: File[], meta: Pick<Photo, 'subject_id' | 'kind' | 'date'>, onProgress?: (n: number) => void): Promise<void>;
  deletePhoto(p: Photo): Promise<void>;
  ensureUrls(photos: Photo[]): void;
}

const Ctx = createContext<Store | null>(null);

export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

/** Не даём загрузке висеть бесконечно: по таймауту показываем ошибку с кнопкой «Повторить». */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: number | undefined;
  return Promise.race([
    p.finally(() => window.clearTimeout(t)),
    new Promise<T>((_, reject) => {
      t = window.setTimeout(() => reject(new TimeoutError(message)), ms);
    }),
  ]);
}

class TimeoutError extends Error {}

function toAppError(e: unknown): AppError {
  if (e instanceof TimeoutError) return { code: 'unknown', message: e.message };
  if (e instanceof AuthError) return { code: e.code, message: e.message };
  if (isNetworkError(e)) return { code: 'network', message: 'Нет соединения с сервером' };
  return { code: 'unknown', message: e instanceof Error ? e.message : String(e) };
}

function makePhoto(id: string, meta: Pick<Photo, 'subject_id' | 'kind' | 'date'>, blob: Blob, w: number, h: number): Photo {
  return {
    id,
    subject_id: meta.subject_id,
    kind: meta.kind,
    date: meta.date,
    path: `${id}.jpg`,
    width: w,
    height: h,
    size: blob.size,
    note: null,
    created_at: new Date().toISOString(),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const provider = useMemo(() => {
    try {
      return createProvider();
    } catch (e) {
      return e as Error;
    }
  }, []);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<AppError | null>(null);
  const [data, setData] = useState<Snapshot>({
    subjects: [],
    grades: [],
    photos: [],
    settings: normalizeSettings(null),
  });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const syncing = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const p = provider instanceof Error ? null : provider;

  const fetchAll = useCallback(async () => {
    if (!p) return;
    const [subjects, grades, photos, settings] = await Promise.all([
      p.listSubjects(),
      p.listGrades(),
      p.listPhotos(),
      p.getSettings(),
    ]);
    let subs = subjects;
    // Первый запуск в режиме без миграций с предметами (demo) — кладём список из ИУП.
    if (!subs.length) {
      subs = defaultSubjects();
      for (const s of subs) await p.upsertSubject(s);
    }
    const snap: Snapshot = { subjects: subs, grades, photos, settings: normalizeSettings(settings) };
    setData(snap);
    saveSnapshot(snap);
  }, [p]);

  const refreshQueue = useCallback(async () => setQueue(await queued()), []);

  const sync = useCallback(async () => {
    if (!p || syncing.current) return;
    syncing.current = true;
    try {
      const items = await queued();
      let sent = 0;
      for (const it of items) {
        try {
          if (it.photo) await p.savePhoto(it.photo.meta, it.photo.blob);
          await p.upsertGrade({ ...it.grade, _pending: undefined });
          await dequeue(it.id);
          sent++;
        } catch (e) {
          if (isNetworkError(e)) break;
          console.error('Не удалось отправить оценку из очереди', e);
        }
      }
      if (sent) {
        await fetchAll();
        showToast(sent === 1 ? 'Офлайн-оценка отправлена' : `Отправлено офлайн-оценок: ${sent}`);
      }
    } finally {
      syncing.current = false;
      await refreshQueue();
    }
  }, [p, fetchAll, refreshQueue, showToast]);

  const reload = useCallback(async () => {
    if (!p) {
      setError({ code: 'config', message: (provider as Error).message });
      setStatus('error');
      return;
    }
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    await refreshQueue();
    try {
      const init = initData();
      if (!init && p.name !== 'demo') throw new AuthError('Откройте приложение через Telegram-бота', 'no-telegram');
      await withTimeout(p.auth(init), 25_000, 'Сервер входа не ответил за 25 секунд');
      await withTimeout(fetchAll(), 25_000, 'Сервер не отдал данные за 25 секунд');
      setError(null);
      setStatus('ready');
      void sync();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'network') {
        const snap = await loadSnapshot<Snapshot>();
        if (snap) {
          setData({ ...snap, settings: normalizeSettings(snap.settings) });
          setStatus('offline');
          setError(err);
          return;
        }
      }
      setError(err);
      setStatus('error');
    }
  }, [p, provider, fetchAll, refreshQueue, sync]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on = () => {
      if (status === 'offline') void reload();
      else void sync();
    };
    window.addEventListener('online', on);
    const t = window.setInterval(() => queue.length && navigator.onLine && on(), 30_000);
    return () => {
      window.removeEventListener('online', on);
      window.clearInterval(t);
    };
  }, [status, reload, sync, queue.length]);

  const ensureUrls = useCallback(
    (photos: Photo[]) => {
      if (!p) return;
      const missing = photos.filter((ph) => !urls[ph.id]);
      if (!missing.length) return;
      p.photoUrls(missing)
        .then((r) => setUrls((u) => ({ ...u, ...r })))
        .catch((e) => console.warn('signed url', e));
    },
    [p, urls],
  );

  const saveGrade = useCallback(
    async (g: Grade, photo?: Blob | null): Promise<'saved' | 'queued'> => {
      if (!p) throw new Error('Нет бэкенда');
      const now = new Date().toISOString();
      const grade: Grade = { ...g, created_at: g.created_at ?? now, updated_at: now };
      let photoItem: QueueItem['photo'];
      if (photo) {
        const c = await compressImage(photo);
        const id = uuid();
        photoItem = { meta: makePhoto(id, { subject_id: g.subject_id, kind: g.kind, date: g.date }, c.blob, c.width, c.height), blob: c.blob };
        grade.photo_id = id;
      }
      const offline = status === 'offline' || !navigator.onLine;
      if (!offline) {
        try {
          if (photoItem) await p.savePhoto(photoItem.meta, photoItem.blob);
          await p.upsertGrade(grade);
          setData((d) => ({
            ...d,
            grades: [...d.grades.filter((x) => x.id !== grade.id), grade],
            photos: photoItem ? [photoItem.meta, ...d.photos] : d.photos,
          }));
          haptic.success();
          void fetchAll().catch(() => {});
          return 'saved';
        } catch (e) {
          if (!isNetworkError(e)) {
            haptic.error();
            throw e;
          }
        }
      }
      await enqueue({ id: grade.id, grade, photo: photoItem });
      if (photoItem) setUrls((u) => ({ ...u, [photoItem!.meta.id]: URL.createObjectURL(photoItem!.blob) }));
      await refreshQueue();
      haptic.warning();
      return 'queued';
    },
    [p, status, fetchAll, refreshQueue],
  );

  const deleteGrade = useCallback(
    async (id: string) => {
      if (!p) return;
      if (queue.some((q) => q.id === id)) {
        await dequeue(id);
        await refreshQueue();
      } else {
        await p.deleteGrade(id);
      }
      setData((d) => ({ ...d, grades: d.grades.filter((g) => g.id !== id) }));
      haptic.success();
    },
    [p, queue, refreshQueue],
  );

  const saveSubject = useCallback(
    async (s: Subject) => {
      if (!p) return;
      await p.upsertSubject(s);
      setData((d) => ({
        ...d,
        subjects: [...d.subjects.filter((x) => x.id !== s.id), s].sort((a, b) => a.sort - b.sort),
      }));
    },
    [p],
  );

  const saveSettings = useCallback(
    async (s: Settings) => {
      if (!p) return;
      setData((d) => ({ ...d, settings: s }));
      await p.saveSettings(s);
    },
    [p],
  );

  const addPhotos = useCallback(
    async (files: File[], meta: Pick<Photo, 'subject_id' | 'kind' | 'date'>, onProgress?: (n: number) => void) => {
      if (!p) return;
      const added: Photo[] = [];
      let n = 0;
      for (const f of files) {
        const c = await compressImage(f);
        const ph = makePhoto(uuid(), meta, c.blob, c.width, c.height);
        await p.savePhoto(ph, c.blob);
        added.push(ph);
        setUrls((u) => ({ ...u, [ph.id]: URL.createObjectURL(c.blob) }));
        onProgress?.(++n);
      }
      setData((d) => ({ ...d, photos: [...added, ...d.photos] }));
      haptic.success();
    },
    [p],
  );

  const deletePhoto = useCallback(
    async (ph: Photo) => {
      if (!p) return;
      await p.deletePhoto(ph);
      setData((d) => ({
        ...d,
        photos: d.photos.filter((x) => x.id !== ph.id),
        grades: d.grades.map((g) => (g.photo_id === ph.id ? { ...g, photo_id: null } : g)),
      }));
      haptic.success();
    },
    [p],
  );

  // Оценки из очереди показываются сразу, с пометкой «не синхронизировано».
  const grades = useMemo(() => {
    if (!queue.length) return data.grades;
    const q = new Map(queue.map((i) => [i.id, { ...i.grade, _pending: true }]));
    return [...data.grades.filter((g) => !q.has(g.id)), ...q.values()];
  }, [data.grades, queue]);

  const photos = useMemo(() => {
    const qp = queue.flatMap((i) => (i.photo ? [i.photo.meta] : []));
    return qp.length ? [...qp, ...data.photos] : data.photos;
  }, [data.photos, queue]);

  const store: Store = {
    provider: p as DataProvider,
    status,
    error,
    subjects: data.subjects,
    grades,
    photos,
    settings: data.settings,
    pending: queue.length,
    urls,
    toast,
    showToast,
    reload,
    sync,
    saveGrade,
    deleteGrade,
    saveSubject,
    saveSettings,
    addPhotos,
    deletePhoto,
    ensureUrls,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
