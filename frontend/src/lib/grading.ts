// Все расчёты оценок КарТУ. Чистые функции без зависимостей от UI и бэкенда.

export type Kind = 'lecture' | 'practice' | 'srop' | 'srsp';
export type Source = 'lecturer' | 'practitioner';
export type RkNo = 1 | 2;

export const KINDS: Kind[] = ['lecture', 'practice', 'srop', 'srsp'];
export const SOURCES: Source[] = ['lecturer', 'practitioner'];

export const KIND_LABEL: Record<Kind, string> = {
  lecture: 'Лекция',
  practice: 'Практика',
  srop: 'СРОП',
  srsp: 'СРСП',
};
export const KIND_LABEL_PLURAL: Record<Kind, string> = {
  lecture: 'Лекции',
  practice: 'Практики',
  srop: 'СРОП',
  srsp: 'СРСП',
};
export const SOURCE_LABEL: Record<Source, string> = {
  lecturer: 'Лектор',
  practitioner: 'Практик',
};
/** Лекция и СРОП → лектор, Практика и СРСП → практик. */
export const DEFAULT_SOURCE: Record<Kind, Source> = {
  lecture: 'lecturer',
  srop: 'lecturer',
  practice: 'practitioner',
  srsp: 'practitioner',
};

export interface GradeLike {
  date: string; // YYYY-MM-DD
  score: number;
  kind: Kind;
  source: Source;
}

export interface WeekRange {
  from: number;
  to: number;
}

export interface TermSettings {
  semester_start: string; // YYYY-MM-DD, понедельник 1-й недели
  rk1: WeekRange;
  rk2: WeekRange;
  weights: Record<Kind, number>;
}

export const DEFAULT_TERM: TermSettings = {
  semester_start: '2026-09-01',
  rk1: { from: 1, to: 7 },
  rk2: { from: 8, to: 15 },
  weights: { lecture: 1, practice: 1, srop: 1, srsp: 1 },
};

export const ADMISSION_MIN = 50;
export const EXAM_MIN = 50;
export const W_ADMISSION = 0.6;
export const W_EXAM = 0.4;

const DAY = 86_400_000;
const EPS = 1e-9;

/* ---------- даты и недели ---------- */

export function parseDay(s: string): number {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Номер учебной недели (1 — неделя начала семестра). До начала — ≤ 0. */
export function weekNumber(date: string, semesterStart: string): number {
  return Math.floor((parseDay(date) - parseDay(semesterStart)) / (7 * DAY)) + 1;
}

/** К какому рубежному контролю относится дата. null — вне РК (до семестра или сессия). */
export function rkForDate(date: string, t: TermSettings): RkNo | null {
  const w = weekNumber(date, t.semester_start);
  if (w >= t.rk1.from && w <= t.rk1.to) return 1;
  if (w >= t.rk2.from && w <= t.rk2.to) return 2;
  return null;
}

export type Phase = 'before' | 'rk1' | 'rk2' | 'session';

export function phaseOf(today: string, t: TermSettings): Phase {
  const w = weekNumber(today, t.semester_start);
  if (w < t.rk1.from) return 'before';
  if (w <= t.rk1.to) return 'rk1';
  if (w <= t.rk2.to) return 'rk2';
  return 'session';
}

/** Сколько недель осталось до конца РК (включая текущую). */
export function weeksLeft(today: string, rk: RkNo, t: TermSettings): number {
  const w = weekNumber(today, t.semester_start);
  const end = rk === 1 ? t.rk1.to : t.rk2.to;
  return Math.max(0, end - w + 1);
}

/** Первый и последний день РК в формате YYYY-MM-DD. */
export function rkDates(rk: RkNo, t: TermSettings): { from: string; to: string } {
  const r = rk === 1 ? t.rk1 : t.rk2;
  const s = parseDay(t.semester_start);
  return { from: formatDay(s + (r.from - 1) * 7 * DAY), to: formatDay(s + r.to * 7 * DAY - DAY) };
}

/* ---------- средние ---------- */

/**
 * Среднее текущих оценок. Каждая оценка весит столько, сколько её вид работы
 * в настройках. При равных весах (по умолчанию) — обычное среднее.
 */
export function weightedAverage(grades: GradeLike[], weights?: Partial<Record<Kind, number>>): number | null {
  let sum = 0;
  let wsum = 0;
  for (const g of grades) {
    const w = weights?.[g.kind] ?? 1;
    if (!(w > 0)) continue;
    sum += g.score * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : null;
}

export function average(grades: GradeLike[]): number | null {
  return weightedAverage(grades);
}

export function gradesInRk<G extends GradeLike>(grades: G[], rk: RkNo, t: TermSettings): G[] {
  return grades.filter((g) => rkForDate(g.date, t) === rk);
}

export function rkCalculated(grades: GradeLike[], rk: RkNo, t: TermSettings): number | null {
  return weightedAverage(gradesInRk(grades, rk, t), t.weights);
}

/* ---------- буквы и GPA ---------- */

export interface LetterInfo {
  letter: string;
  gpa: number;
  min: number;
  max: number;
  group: 'A' | 'B' | 'C' | 'D';
}

export const LETTERS: LetterInfo[] = [
  { letter: 'A', gpa: 4.0, min: 95, max: 100, group: 'A' },
  { letter: 'A-', gpa: 3.67, min: 90, max: 94, group: 'A' },
  { letter: 'B+', gpa: 3.33, min: 85, max: 89, group: 'B' },
  { letter: 'B', gpa: 3.0, min: 80, max: 84, group: 'B' },
  { letter: 'B-', gpa: 2.67, min: 75, max: 79, group: 'B' },
  { letter: 'C+', gpa: 2.33, min: 70, max: 74, group: 'C' },
  { letter: 'C', gpa: 2.0, min: 65, max: 69, group: 'C' },
  { letter: 'C-', gpa: 1.67, min: 60, max: 64, group: 'C' },
  { letter: 'D+', gpa: 1.33, min: 55, max: 59, group: 'D' },
  { letter: 'D', gpa: 1.0, min: 50, max: 54, group: 'D' },
  { letter: 'F', gpa: 0, min: 0, max: 49, group: 'D' },
];

/** Буква по баллу. Без округления: 89,6 — это ещё B+. */
export function letterFor(score: number): LetterInfo {
  for (const l of LETTERS) if (score >= l.min - EPS) return l;
  return LETTERS[LETTERS.length - 1];
}

/** Цели, которые предлагаются в калькуляторе (C+ … A). */
export const TARGET_LETTERS = LETTERS.filter((l) => l.min >= 70);

/* ---------- рейтинг допуска, итог, экзамен ---------- */

export function admissionRating(rk1: number | null, rk2: number | null): number | null {
  if (rk1 == null || rk2 == null) return null;
  return (rk1 + rk2) / 2;
}

export function isAdmitted(rd: number | null): boolean {
  return rd != null && rd >= ADMISSION_MIN - EPS;
}

export function finalScore(rd: number, exam: number): number {
  return W_ADMISSION * rd + W_EXAM * exam;
}

export type ExamNeed =
  | { status: 'no-admission'; raw: number }
  | { status: 'impossible'; raw: number }
  | { status: 'minimum'; raw: number; value: number }
  | { status: 'ok'; raw: number; value: number };

/**
 * Сколько нужно набрать на экзамене для итогового балла ≥ target:
 * ceil((target − 0,6·РД) / 0,4). Больше 100 — «не хватит», меньше 50 — «50 (минимум)».
 */
export function examNeeded(rd: number, target: number): ExamNeed {
  const raw = Math.ceil((target - W_ADMISSION * rd) / W_EXAM - EPS);
  if (!isAdmitted(rd)) return { status: 'no-admission', raw };
  if (raw > 100) return { status: 'impossible', raw };
  if (raw < EXAM_MIN) return { status: 'minimum', raw, value: EXAM_MIN };
  return { status: 'ok', raw, value: raw };
}

export type Rk2Need =
  | { status: 'impossible'; raw: number }
  | { status: 'done'; raw: number; value: 0 }
  | { status: 'ok'; raw: number; value: number };

function rk2Result(raw: number): Rk2Need {
  if (raw > 100) return { status: 'impossible', raw };
  if (raw <= 0) return { status: 'done', raw: raw + 0, value: 0 };
  return { status: 'ok', raw, value: raw };
}

/** Минимальный РК2 для допуска: (РК1 + РК2)/2 ≥ 50. */
export function rk2NeededForAdmission(rk1: number): Rk2Need {
  return rk2Result(Math.ceil(2 * ADMISSION_MIN - rk1 - EPS));
}

/**
 * Минимальный РК2, чтобы получить букву target при заданном экзамене (по умолчанию 100 —
 * абсолютный минимум). Не меньше, чем нужно для допуска.
 */
export function rk2NeededForTarget(rk1: number, target: number, exam = 100): Rk2Need {
  if (exam < EXAM_MIN) return { status: 'impossible', raw: Infinity };
  const forTarget = Math.ceil((2 * (target - W_EXAM * exam)) / W_ADMISSION - rk1 - EPS);
  const forAdmission = Math.ceil(2 * ADMISSION_MIN - rk1 - EPS);
  return rk2Result(Math.max(forTarget, forAdmission));
}

/* ---------- сводка по предмету ---------- */

export interface SubjectLike {
  rk1_official: number | null;
  rk2_official: number | null;
  exam: number | null;
}

export interface RkInfo {
  calculated: number | null;
  official: number | null;
  /** Официальный важнее расчётного. */
  value: number | null;
  count: number;
}

export interface SubjectSummary {
  rk1: RkInfo;
  rk2: RkInfo;
  /** РД, если есть оба РК (РК2 может быть ещё «сейчас»). */
  admission: number | null;
  admitted: boolean;
  exam: number | null;
  final: number | null;
  /** Главный показатель предмета: итог → РД → единственный известный РК. */
  rating: number | null;
  letter: LetterInfo | null;
}

function rkInfo(grades: GradeLike[], rk: RkNo, t: TermSettings, official: number | null): RkInfo {
  const list = gradesInRk(grades, rk, t);
  const calculated = weightedAverage(list, t.weights);
  return { calculated, official, value: official ?? calculated, count: list.length };
}

export function summarizeSubject(subject: SubjectLike, grades: GradeLike[], t: TermSettings): SubjectSummary {
  const rk1 = rkInfo(grades, 1, t, subject.rk1_official);
  const rk2 = rkInfo(grades, 2, t, subject.rk2_official);
  const admission = admissionRating(rk1.value, rk2.value);
  const admitted = isAdmitted(admission);
  const exam = subject.exam;
  let final: number | null = null;
  if (admission != null && exam != null) {
    final = admitted && exam >= EXAM_MIN - EPS ? finalScore(admission, exam) : Math.min(finalScore(admission, exam), 49);
  }
  const rating = final ?? admission ?? rk1.value ?? rk2.value;
  return { rk1, rk2, admission, admitted, exam, final, rating, letter: rating == null ? null : letterFor(rating) };
}

export interface Overall {
  rating: number | null;
  gpa: number | null;
  count: number;
}

/** Средний рейтинг и GPA по предметам, где уже есть рейтинг. */
export function overall(summaries: SubjectSummary[]): Overall {
  const rated = summaries.filter((s) => s.rating != null);
  if (!rated.length) return { rating: null, gpa: null, count: 0 };
  const rating = rated.reduce((a, s) => a + (s.rating as number), 0) / rated.length;
  const gpa = rated.reduce((a, s) => a + letterFor(s.rating as number).gpa, 0) / rated.length;
  return { rating, gpa, count: rated.length };
}

/**
 * Как изменится расчётный РК (для подсказки в форме): before — оценки предмета до
 * изменения, after — после (новая добавлена / отредактированная заменена).
 */
export function rkPreview(
  before: GradeLike[],
  after: GradeLike[],
  date: string,
  t: TermSettings,
): { rk: RkNo; before: number | null; after: number | null } | null {
  const rk = rkForDate(date, t);
  if (!rk) return null;
  return { rk, before: rkCalculated(before, rk, t), after: rkCalculated(after, rk, t) };
}

/* ---------- форматирование ---------- */

/** 67.5 → «67,5», 69 → «69», 69.04 → «69». */
export function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/ /g, ' ');
}

export function fmtGpa(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2).replace('.', ',');
}
