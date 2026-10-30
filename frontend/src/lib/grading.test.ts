import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERM,
  admissionRating,
  examNeeded,
  finalScore,
  fmt,
  isAdmitted,
  letterFor,
  overall,
  phaseOf,
  rk2NeededForAdmission,
  rk2NeededForTarget,
  rkCalculated,
  rkDates,
  rkForDate,
  rkPreview,
  summarizeSubject,
  weekNumber,
  weeksLeft,
  weightedAverage,
  type GradeLike,
  type TermSettings,
} from './grading';

const T: TermSettings = { ...DEFAULT_TERM, semester_start: '2026-09-01' };
const g = (date: string, score: number, kind: GradeLike['kind'] = 'lecture'): GradeLike => ({
  date,
  score,
  kind,
  source: 'lecturer',
});

describe('недели и РК', () => {
  it('считает номер недели от начала семестра', () => {
    expect(weekNumber('2026-09-01', T.semester_start)).toBe(1);
    expect(weekNumber('2026-09-07', T.semester_start)).toBe(1);
    expect(weekNumber('2026-09-08', T.semester_start)).toBe(2);
    expect(weekNumber('2026-08-31', T.semester_start)).toBe(0);
  });

  it('относит дату к РК1 (недели 1–7) и РК2 (8–15)', () => {
    expect(rkForDate('2026-09-01', T)).toBe(1);
    expect(rkForDate('2026-10-19', T)).toBe(1); // последний день 7-й недели
    expect(rkForDate('2026-10-20', T)).toBe(2); // первый день 8-й
    expect(rkForDate('2026-12-14', T)).toBe(2); // последний день 15-й
    expect(rkForDate('2026-12-15', T)).toBeNull(); // сессия
    expect(rkForDate('2026-08-20', T)).toBeNull();
  });

  it('уважает границы из настроек', () => {
    const t = { ...T, rk1: { from: 1, to: 8 }, rk2: { from: 9, to: 15 } };
    expect(rkForDate('2026-10-20', t)).toBe(1);
  });

  it('фаза семестра и недели до конца РК', () => {
    expect(phaseOf('2026-08-01', T)).toBe('before');
    expect(phaseOf('2026-09-10', T)).toBe('rk1');
    expect(phaseOf('2026-10-30', T)).toBe('rk2');
    expect(phaseOf('2027-01-10', T)).toBe('session');
    expect(weeksLeft('2026-10-30', 2, T)).toBe(7); // неделя 9 → 9..15
    expect(rkDates(1, T)).toEqual({ from: '2026-09-01', to: '2026-10-19' });
    expect(rkDates(2, T)).toEqual({ from: '2026-10-20', to: '2026-12-14' });
  });
});

describe('средние', () => {
  it('обычное среднее при равных весах', () => {
    expect(weightedAverage([g('2026-09-01', 80), g('2026-09-02', 90, 'practice')], T.weights)).toBe(85);
  });

  it('взвешенное среднее по видам работ', () => {
    const w = { lecture: 1, practice: 3, srop: 1, srsp: 1 };
    expect(weightedAverage([g('2026-09-01', 60), g('2026-09-02', 100, 'practice')], w)).toBe(90);
  });

  it('вид с нулевым весом не учитывается, пустой список — null', () => {
    const w = { lecture: 0, practice: 1, srop: 1, srsp: 1 };
    expect(weightedAverage([g('2026-09-01', 10), g('2026-09-02', 70, 'practice')], w)).toBe(70);
    expect(weightedAverage([])).toBeNull();
  });

  it('РК считается только по оценкам своего периода', () => {
    const list = [g('2026-09-02', 70), g('2026-09-10', 80), g('2026-10-25', 100)];
    expect(rkCalculated(list, 1, T)).toBe(75);
    expect(rkCalculated(list, 2, T)).toBe(100);
  });
});

describe('буквы и GPA', () => {
  it.each([
    [100, 'A', 4.0],
    [95, 'A', 4.0],
    [94, 'A-', 3.67],
    [90, 'A-', 3.67],
    [89.6, 'B+', 3.33],
    [85, 'B+', 3.33],
    [84, 'B', 3.0],
    [80, 'B', 3.0],
    [79, 'B-', 2.67],
    [75, 'B-', 2.67],
    [74, 'C+', 2.33],
    [70, 'C+', 2.33],
    [69, 'C', 2.0],
    [65, 'C', 2.0],
    [64, 'C-', 1.67],
    [60, 'C-', 1.67],
    [59, 'D+', 1.33],
    [55, 'D+', 1.33],
    [54, 'D', 1.0],
    [50, 'D', 1.0],
    [49.9, 'F', 0],
    [0, 'F', 0],
  ])('%s → %s (%s)', (score, letter, gpa) => {
    const l = letterFor(score);
    expect(l.letter).toBe(letter);
    expect(l.gpa).toBe(gpa);
  });
});

describe('допуск и итог', () => {
  it('рейтинг допуска = (РК1 + РК2) / 2', () => {
    expect(admissionRating(70, 81)).toBe(75.5);
    expect(admissionRating(70, null)).toBeNull();
  });

  it('допуск при РД ≥ 50', () => {
    expect(isAdmitted(50)).toBe(true);
    expect(isAdmitted(49.5)).toBe(false);
    expect(isAdmitted(null)).toBe(false);
  });

  it('итог = 0,6·РД + 0,4·экзамен', () => {
    expect(finalScore(80, 90)).toBeCloseTo(84);
    expect(finalScore(100, 100)).toBeCloseTo(100);
  });
});

describe('сколько нужно на экзамене', () => {
  it('обычный случай', () => {
    // (90 − 48) / 0,4 = 105 → не хватит; (85 − 48) / 0,4 = 92,5 → 93
    expect(examNeeded(80, 90)).toEqual({ status: 'impossible', raw: 105 });
    expect(examNeeded(80, 85)).toEqual({ status: 'ok', raw: 93, value: 93 });
  });

  it('если хватает меньше 50 — показываем минимум 50', () => {
    expect(examNeeded(90, 70)).toEqual({ status: 'minimum', raw: 40, value: 50 });
  });

  it('без допуска — статус no-admission', () => {
    expect(examNeeded(45, 70).status).toBe('no-admission');
  });

  it('не ошибается на плавающей точке', () => {
    // (50 − 0,6·50) / 0,4 = 50 ровно
    expect(examNeeded(50, 50)).toEqual({ status: 'ok', raw: 50, value: 50 });
    // (95 − 0,6·95) / 0,4 = 95 ровно
    expect(examNeeded(95, 95)).toEqual({ status: 'ok', raw: 95, value: 95 });
  });
});

describe('сколько нужно на РК2', () => {
  it('для допуска', () => {
    expect(rk2NeededForAdmission(60)).toEqual({ status: 'ok', raw: 40, value: 40 });
    expect(rk2NeededForAdmission(100)).toEqual({ status: 'done', raw: 0, value: 0 });
    expect(rk2NeededForAdmission(-5).status).toBe('impossible');
  });

  it('для цели при экзамене 100', () => {
    // 0,6·(80+x)/2 + 40 ≥ 95 → x ≥ 103,3 → не хватит
    expect(rk2NeededForTarget(80, 95).status).toBe('impossible');
    // 0,6·(80+x)/2 + 40 ≥ 85 → x ≥ 70
    expect(rk2NeededForTarget(80, 85)).toEqual({ status: 'ok', raw: 70, value: 70 });
  });

  it('учитывает ожидаемый экзамен и не опускается ниже допуска', () => {
    // при экзамене 80: 0,6·(70+x)/2 + 32 ≥ 70 → x ≥ 56,67 → 57
    expect(rk2NeededForTarget(70, 70, 80)).toEqual({ status: 'ok', raw: 57, value: 57 });
    // цель низкая, но допуск требует ≥ 40
    expect(rk2NeededForTarget(60, 50, 100)).toEqual({ status: 'ok', raw: 40, value: 40 });
    expect(rk2NeededForTarget(60, 70, 40).status).toBe('impossible');
  });
});

describe('сводка по предмету', () => {
  const grades = [g('2026-09-02', 70), g('2026-09-10', 80, 'practice'), g('2026-10-25', 90)];

  it('расчётные РК, РД и буква', () => {
    const s = summarizeSubject({ rk1_official: null, rk2_official: null, exam: null }, grades, T);
    expect(s.rk1.value).toBe(75);
    expect(s.rk2.value).toBe(90);
    expect(s.admission).toBe(82.5);
    expect(s.admitted).toBe(true);
    expect(s.rating).toBe(82.5);
    expect(s.letter?.letter).toBe('B');
  });

  it('официальный РК важнее расчётного', () => {
    const s = summarizeSubject({ rk1_official: 61, rk2_official: null, exam: null }, grades, T);
    expect(s.rk1.calculated).toBe(75);
    expect(s.rk1.value).toBe(61);
    expect(s.admission).toBe(75.5);
  });

  it('итог с экзаменом', () => {
    const s = summarizeSubject({ rk1_official: 80, rk2_official: 90, exam: 90 }, [], T);
    expect(s.final).toBeCloseTo(87);
    expect(s.letter?.letter).toBe('B+');
  });

  it('экзамен ниже 50 — F', () => {
    const s = summarizeSubject({ rk1_official: 90, rk2_official: 90, exam: 40 }, [], T);
    expect(s.letter?.letter).toBe('F');
  });

  it('только РК1 — рейтинг по РК1', () => {
    const s = summarizeSubject({ rk1_official: null, rk2_official: null, exam: null }, [g('2026-09-02', 66)], T);
    expect(s.admission).toBeNull();
    expect(s.rating).toBe(66);
  });

  it('средний рейтинг и GPA', () => {
    const a = summarizeSubject({ rk1_official: 95, rk2_official: 95, exam: null }, [], T);
    const b = summarizeSubject({ rk1_official: 80, rk2_official: 80, exam: null }, [], T);
    const c = summarizeSubject({ rk1_official: null, rk2_official: null, exam: null }, [], T);
    const o = overall([a, b, c]);
    expect(o.count).toBe(2);
    expect(o.rating).toBe(87.5);
    expect(o.gpa).toBeCloseTo(3.5);
  });
});

describe('подсказка изменения РК', () => {
  it('РК2 по предмету: было → станет', () => {
    const before = [g('2026-10-21', 60), g('2026-10-22', 75)];
    const added = g('2026-10-30', 72);
    expect(rkPreview(before, [...before, added], added.date, T)).toEqual({ rk: 2, before: 67.5, after: 69 });
  });
});

describe('форматирование', () => {
  it('запятая и без лишних нулей', () => {
    expect(fmt(67.5)).toBe('67,5');
    expect(fmt(69)).toBe('69');
    expect(fmt(69.04)).toBe('69');
    expect(fmt(null)).toBe('—');
  });
});
