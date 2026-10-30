import type { Kind, Source, TermSettings } from '../lib/grading';

export type ThemeMode = 'auto' | 'day' | 'night';

/** Схема одинакова в Supabase (Postgres) и в FastAPI (SQLite). */
export interface Subject {
  id: string;
  name: string;
  short_name: string | null;
  period: number;
  hidden: boolean;
  sort: number;
  rk1_official: number | null;
  rk2_official: number | null;
  exam: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Grade {
  id: string;
  subject_id: string;
  date: string;
  score: number;
  kind: Kind;
  source: Source;
  note: string | null;
  photo_id: string | null;
  created_at?: string;
  updated_at?: string;
  /** Только на клиенте: лежит в офлайн-очереди, ещё не отправлена. */
  _pending?: boolean;
}

export interface Photo {
  id: string;
  subject_id: string | null;
  kind: Kind | null;
  date: string;
  path: string;
  width: number | null;
  height: number | null;
  size: number;
  note: string | null;
  created_at?: string;
}

export interface Settings extends TermSettings {
  theme: ThemeMode;
  period: number;
}

export interface Usage {
  db_bytes: number;
  storage_bytes: number;
  db_limit: number | null;
  storage_limit: number | null;
}

export interface BackupData {
  version: 1;
  exported_at: string;
  subjects: Subject[];
  grades: Grade[];
  photos: Photo[];
  settings: Settings | null;
}

/** Ошибка доступа: не открыто из Telegram / чужой аккаунт / неверная подпись. */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: 'no-telegram' | 'forbidden' | 'invalid' | 'config',
  ) {
    super(message);
  }
}

/** Ошибка сети: оценку можно положить в офлайн-очередь. */
export class NetworkError extends Error {}

export interface DataProvider {
  readonly name: 'supabase' | 'server' | 'demo';
  auth(initData: string): Promise<void>;

  listSubjects(): Promise<Subject[]>;
  upsertSubject(s: Subject): Promise<void>;

  listGrades(): Promise<Grade[]>;
  upsertGrade(g: Grade): Promise<void>;
  deleteGrade(id: string): Promise<void>;

  listPhotos(): Promise<Photo[]>;
  /** Сохраняет запись о фото и сам файл (JPEG). */
  savePhoto(p: Photo, file: Blob): Promise<void>;
  deletePhoto(p: Photo): Promise<void>;
  /** Временные ссылки на файлы (signed URL). */
  photoUrls(photos: Photo[]): Promise<Record<string, string>>;
  photoBlob(p: Photo): Promise<Blob>;

  getSettings(): Promise<Settings | null>;
  saveSettings(s: Settings): Promise<void>;

  usage(): Promise<Usage>;
}
