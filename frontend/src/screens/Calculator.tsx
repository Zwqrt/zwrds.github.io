import { useEffect, useMemo, useState } from 'react';
import { subjectTitle } from '../data/defaults';
import { todayAlmaty } from '../data/util';
import {
  TARGET_LETTERS,
  admissionRating,
  examNeeded,
  fmt,
  isAdmitted,
  phaseOf,
  rk2NeededForAdmission,
  rk2NeededForTarget,
  type ExamNeed,
  type Rk2Need,
} from '../lib/grading';
import { haptic } from '../lib/telegram';
import { useSubjectViews } from '../state/derived';
import { useStore } from '../state/store';
import { AnimatedNumber, EmptyState, LetterChip, scrollOnFocus } from '../components/ui';
import { Calculator as CalcIcon } from 'lucide-react';

const toStr = (n: number | null) => (n == null ? '' : String(Math.round(n * 10) / 10));
const parse = (s: string): number | null => {
  const t = s.replace(',', '.').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
};

function needText(n: ExamNeed): string {
  switch (n.status) {
    case 'no-admission':
      return 'нет допуска';
    case 'impossible':
      return 'не хватит';
    case 'minimum':
      return '50 (минимум)';
    default:
      return String(n.value);
  }
}
const rk2Text = (n: Rk2Need) => (n.status === 'impossible' ? 'не хватит' : n.status === 'done' ? 'уже есть' : `≥ ${n.value}`);

export function CalculatorScreen({ initialSubject }: { initialSubject?: string }) {
  const { settings } = useStore();
  const views = useSubjectViews();
  const [sid, setSid] = useState(initialSubject ?? views[0]?.subject.id ?? '');
  const view = views.find((v) => v.subject.id === sid) ?? views[0];
  const [rk1, setRk1] = useState('');
  const [rk2, setRk2] = useState('');
  const [target, setTarget] = useState('A-');
  const [exam, setExam] = useState('100');

  useEffect(() => {
    if (initialSubject) setSid(initialSubject);
  }, [initialSubject]);

  // РК подставляются сами при смене предмета, их можно править.
  useEffect(() => {
    if (!view) return;
    setRk1(toStr(view.summary.rk1.value));
    setRk2(toStr(view.summary.rk2.value));
  }, [view?.subject.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const r1 = parse(rk1);
  const r2 = parse(rk2);
  const rd = admissionRating(r1, r2);
  const admitted = isAdmitted(rd);
  const tgt = TARGET_LETTERS.find((l) => l.letter === target) ?? TARGET_LETTERS[1];
  const need = rd != null ? examNeeded(rd, tgt.min) : null;
  const rk2Ongoing = phaseOf(todayAlmaty(), settings) === 'rk2' && view?.subject.rk2_official == null;
  const examAssumed = parse(exam) ?? 100;

  const color = !need ? 'blue' : need.status === 'minimum' ? 'green' : need.status === 'ok' ? 'blue' : 'red';
  const rows = useMemo(
    () => (rd == null ? [] : TARGET_LETTERS.map((l) => ({ l, n: examNeeded(rd, l.min) }))),
    [rd],
  );

  if (!view) return <EmptyState icon={CalcIcon} title="Нет предметов" text="Добавьте предметы в профиле." />;

  return (
    <div className="stack">
      <div className="glass top card">
        <h1 className="h1">Сколько на экзамен</h1>
        <div className="small muted">Итог = 0,6 × рейтинг допуска + 0,4 × экзамен</div>
      </div>

      <div className="chips" role="group" aria-label="Предмет">
        {views.map((v) => (
          <button
            key={v.subject.id}
            className="chip glass"
            aria-pressed={v.subject.id === view.subject.id}
            onClick={() => {
              haptic.select();
              setSid(v.subject.id);
            }}
          >
            {subjectTitle(v.subject)}
          </button>
        ))}
      </div>

      <div className="glass card stack">
        <div className="row">
          <div className="grow">
            <label className="label" htmlFor="c-rk1">
              РК1
            </label>
            <input id="c-rk1" className="field num" inputMode="decimal" value={rk1} onFocus={scrollOnFocus} onChange={(e) => setRk1(e.target.value)} placeholder="0–100" />
          </div>
          <div className="grow">
            <label className="label" htmlFor="c-rk2">
              РК2{rk2Ongoing ? ' (идёт)' : ''}
            </label>
            <input id="c-rk2" className="field num" inputMode="decimal" value={rk2} onFocus={scrollOnFocus} onChange={(e) => setRk2(e.target.value)} placeholder="0–100" />
          </div>
        </div>
        <div className="row between">
          <span className="bold">Рейтинг допуска</span>
          <span className="row">
            <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>
              {fmt(rd)}
            </span>
            {rd != null && <span className={`badge ${admitted ? 'ok' : 'bad'}`}>{admitted ? 'допуск есть' : 'нет допуска'}</span>}
          </span>
        </div>
      </div>

      <div className="glass card" style={{ padding: '12px 12px 10px' }}>
        <span className="label">Цель</span>
        <div className="chips" role="group" aria-label="Цель">
          {TARGET_LETTERS.map((l) => (
            <button
              key={l.letter}
              className="chip"
              aria-pressed={l.letter === target}
              onClick={() => {
                haptic.select();
                setTarget(l.letter);
              }}
            >
              {l.letter} · {l.min}+
            </button>
          ))}
        </div>
      </div>

      <div className={`result-card ${color}`} aria-live="polite">
        <div className="small bold" style={{ opacity: 0.9 }}>
          {subjectTitle(view.subject)} · на {tgt.letter} нужно на экзамене
        </div>
        <div className="num" style={{ margin: '6px 0' }}>
          {!need ? '—' : need.status === 'ok' ? <AnimatedNumber value={need.value} format={(n) => String(Math.round(n))} /> : needText(need)}
        </div>
        <div className="small" style={{ opacity: 0.95 }}>
          {!need && 'Введите РК1 и РК2'}
          {need?.status === 'ok' && `Итог будет ≥ ${tgt.min} — буква ${tgt.letter}`}
          {need?.status === 'minimum' && 'Хватит минимального проходного балла на экзамене'}
          {need?.status === 'impossible' && `Нужно ${need.raw} из 100 — недостижимо. Попробуйте цель ниже`}
          {need?.status === 'no-admission' && 'Рейтинг допуска ниже 50 — к экзамену не допустят'}
        </div>
      </div>

      {rk2Ongoing && r1 != null && (
        <div className="glass card stack">
          <div className="h2">РК2 ещё идёт</div>
          <div className="row between">
            <span>Для допуска нужно на РК2</span>
            <span className="num bold">{rk2Text(rk2NeededForAdmission(r1))}</span>
          </div>
          <div className="row between">
            <span>
              Для {tgt.letter} при экзамене
            </span>
            <input
              aria-label="Ожидаемый балл экзамена"
              className="field num"
              style={{ width: 72, minHeight: 36, padding: '4px 8px', textAlign: 'center' }}
              inputMode="numeric"
              value={exam}
              onFocus={scrollOnFocus}
              onChange={(e) => setExam(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
            />
          </div>
          <div className="row between">
            <span className="muted small">нужно на РК2</span>
            <span className="num bold">{rk2Text(rk2NeededForTarget(r1, tgt.min, examAssumed))}</span>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="glass card">
          <div className="h2" style={{ marginBottom: 6 }}>
            Все варианты
          </div>
          {rows.map(({ l, n }) => {
            const val = n.status === 'ok' || n.status === 'minimum' ? n.value : 100;
            const cls = n.status === 'minimum' ? 'green' : n.status === 'ok' ? '' : 'red';
            return (
              <div className="var-row" key={l.letter}>
                <LetterChip info={l} />
                <div className="var-track" aria-hidden>
                  <div className={`var-fill ${cls}`} style={{ width: `${val}%` }} />
                </div>
                <span className="num small bold" style={{ textAlign: 'right' }}>
                  {needText(n)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
