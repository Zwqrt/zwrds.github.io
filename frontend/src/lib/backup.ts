// backup.zip = data.json + photos/<id>.jpg. Один формат для Supabase, своего сервера и CLI.

import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { normalizeSettings } from '../data/defaults';
import type { BackupData, DataProvider } from '../data/types';
import { KIND_LABEL, SOURCE_LABEL } from './grading';

export async function collectBackup(p: DataProvider): Promise<BackupData> {
  const [subjects, grades, photos, settings] = await Promise.all([
    p.listSubjects(),
    p.listGrades(),
    p.listPhotos(),
    p.getSettings(),
  ]);
  return { version: 1, exported_at: new Date().toISOString(), subjects, grades, photos, settings };
}

export async function buildBackupZip(p: DataProvider, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const data = await collectBackup(p);
  const files: Zippable = { 'data.json': strToU8(JSON.stringify(data, null, 2)) };
  const photos: Zippable = {};
  let done = 0;
  for (const ph of data.photos) {
    try {
      const b = await p.photoBlob(ph);
      photos[`${ph.id}.jpg`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }];
    } catch (e) {
      console.warn('Фото не попало в архив', ph.id, e);
    }
    onProgress?.(++done, data.photos.length);
  }
  files.photos = photos;
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

export interface ImportResult {
  subjects: number;
  grades: number;
  photos: number;
}

/** Импорт объединяет данные: записи с тем же id перезаписываются, остальные остаются. */
export async function importBackup(
  p: DataProvider,
  file: Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let data: BackupData;
  let files: Record<string, Uint8Array> = {};
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    files = unzipSync(bytes);
    const json = files['data.json'];
    if (!json) throw new Error('В архиве нет data.json');
    data = JSON.parse(strFromU8(json));
  } else {
    data = JSON.parse(strFromU8(bytes));
  }
  if (!data || !Array.isArray(data.subjects) || !Array.isArray(data.grades)) throw new Error('Неверный формат файла');

  const photosWithFiles = (data.photos ?? []).filter((ph) => files[`photos/${ph.id}.jpg`]);
  const total = data.subjects.length + photosWithFiles.length + data.grades.length + 1;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  if (data.settings) await p.saveSettings(normalizeSettings(data.settings));
  tick();
  for (const s of data.subjects) {
    await p.upsertSubject(s);
    tick();
  }
  // Фото раньше оценок: у оценок внешний ключ photo_id.
  for (const ph of photosWithFiles) {
    await p.savePhoto({ ...ph, path: `${ph.id}.jpg` }, new Blob([files[`photos/${ph.id}.jpg`]], { type: 'image/jpeg' }));
    tick();
  }
  const known = new Set(photosWithFiles.map((x) => x.id));
  for (const g of data.grades) {
    await p.upsertGrade({ ...g, photo_id: g.photo_id && known.has(g.photo_id) ? g.photo_id : null });
    tick();
  }
  return { subjects: data.subjects.length, grades: data.grades.length, photos: photosWithFiles.length };
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV оценок (разделитель «;» — Excel с русской локалью открывает сразу). */
export function gradesCsv(data: BackupData): string {
  const subj = new Map(data.subjects.map((s) => [s.id, s.name]));
  const head = ['Дата', 'Предмет', 'Балл', 'Вид', 'От кого', 'Заметка', 'id'];
  const rows = data.grades
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => [g.date, subj.get(g.subject_id) ?? g.subject_id, g.score, KIND_LABEL[g.kind], SOURCE_LABEL[g.source], g.note, g.id]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

/**
 * Сохранение файла. В Telegram на телефоне ссылка download не работает, поэтому
 * сначала пробуем системное «Поделиться» (можно сохранить в Файлы / отправить себе).
 */
export async function saveFile(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
