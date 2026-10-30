// Офлайн-очередь оценок в IndexedDB: сохраняем локально, отправляем, когда появится сеть.

import type { Grade, Photo } from '../data/types';
import { idbAll, idbDel, idbGet, idbSet } from './idb';

export interface QueueItem {
  id: string; // = grade.id, повторное редактирование перезаписывает элемент
  grade: Grade;
  photo?: { meta: Photo; blob: Blob };
  queued_at: string;
}

export const enqueue = (item: Omit<QueueItem, 'queued_at'>) =>
  idbSet('queue', item.id, { ...item, queued_at: new Date().toISOString() });
export const queued = () => idbAll<QueueItem>('queue').catch(() => [] as QueueItem[]);
export const dequeue = (id: string) => idbDel('queue', id);

export interface Snapshot<S, G, P, T> {
  subjects: S;
  grades: G;
  photos: P;
  settings: T;
  saved_at: string;
}

export const saveSnapshot = (s: object) => idbSet('cache', 'snapshot', { ...s, saved_at: new Date().toISOString() }).catch(() => {});
export const loadSnapshot = <T>() => idbGet<T>('cache', 'snapshot').catch(() => undefined);
