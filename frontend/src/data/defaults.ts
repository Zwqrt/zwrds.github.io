import { DEFAULT_TERM } from '../lib/grading';
import type { Settings, Subject } from './types';

export const DEFAULT_SETTINGS: Settings = { ...DEFAULT_TERM, theme: 'auto', period: 1 };

export function normalizeSettings(s: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    rk1: { ...DEFAULT_SETTINGS.rk1, ...(s?.rk1 ?? {}) },
    rk2: { ...DEFAULT_SETTINGS.rk2, ...(s?.rk2 ?? {}) },
    weights: { ...DEFAULT_SETTINGS.weights, ...(s?.weights ?? {}) },
  };
}

/** Предметы 1 академического периода (из ИУП). Те же UUID в SQL-миграции и в SQLite. */
export const DEFAULT_SUBJECTS: Pick<Subject, 'id' | 'name' | 'short_name' | 'sort'>[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'История Казахстана', short_name: 'История', sort: 1 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Казахский (Русский) язык', short_name: 'Каз/рус язык', sort: 2 },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Информационно-коммуникационные технологии', short_name: 'ИКТ', sort: 3 },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Иностранный язык', short_name: 'Ин. язык', sort: 4 },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Физическая культура', short_name: 'Физкультура', sort: 5 },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Математика', short_name: null, sort: 6 },
];

export function defaultSubjects(): Subject[] {
  return DEFAULT_SUBJECTS.map((s) => ({
    ...s,
    period: 1,
    hidden: false,
    rk1_official: null,
    rk2_official: null,
    exam: null,
  }));
}

export const subjectTitle = (s: Pick<Subject, 'name' | 'short_name'>): string => s.short_name || s.name;

/**
 * Дательный падеж для подсказки «РК2 по Математике». Склоняем только последнее слово
 * и только если оно не аббревиатура: История → Истории, Ин. язык → Ин. языку, ИКТ → ИКТ.
 */
export function dative(title: string): string {
  const m = title.match(/^(.*?)([А-ЯЁа-яё]+)$/);
  if (!m) return title;
  const [, head, w] = m;
  if (w === w.toUpperCase()) return title;
  let r = w;
  if (/ия$/.test(w)) r = w.slice(0, -1) + 'и';
  else if (/[ая]$/.test(w)) r = w.slice(0, -1) + 'е';
  else if (/ь$/.test(w)) r = w.slice(0, -1) + 'и';
  else if (/[бвгджзклмнпрстфхцчшщ]$/.test(w)) r = w + 'у';
  return head + r;
}
