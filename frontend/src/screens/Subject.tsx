import { ArrowLeft, Calculator, ClipboardList, Image as ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { subjectTitle } from '../data/defaults';
import type { Grade, Subject } from '../data/types';
import { todayAlmaty } from '../data/util';
import { KINDS, KIND_LABEL, KIND_LABEL_PLURAL, SOURCE_LABEL, average, fmt, phaseOf, type Source } from '../lib/grading';
import { confirmAsync, haptic, inTelegram } from '../lib/telegram';
import { useSubjectViews } from '../state/derived';
import { useStore } from '../state/store';
import { EmptyState, LetterChip, Segmented, Sheet, scrollOnFocus } from '../components/ui';
import { fmtDate } from '../components/PhotoViewer';

type Filter = 'all' | Source;

const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
const KIND_SHORT = { lecture: 'Лек', practice: 'Пр', srop: 'СРОП', srsp: 'СРСП' } as const;

function GradeBars({ grades }: { grades: Grade[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // Новые оценки справа — сразу показываем их.
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [grades]);
  if (!grades.length) return <div className="small muted center" style={{ padding: '24px 0' }}>Нет оценок для этого фильтра</div>;
  return (
    <div className="bars" ref={ref} role="img" aria-label="График текущих оценок">
      {grades.map((g, i) => (
        <div className="bar" key={g.id} title={`${g.score} — ${KIND_LABEL[g.kind]}, ${SOURCE_LABEL[g.source]}, ${g.date}`}>
          <span className="bar-val">{g.score}</span>
          <div
            className={`bar-fill ${g.source}`}
            style={{ height: `${Math.max(4, g.score) * 0.95}px`, animationDelay: `${Math.min(i, 20) * 25}ms` }}
          />
          <span className="bar-cap">
            {KIND_SHORT[g.kind]}
            <br />
            {shortDate(g.date)}
          </span>
        </div>
      ))}
    </div>
  );
}

function OfficialSheet({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const { saveSubject, showToast } = useStore();
  const [v, setV] = useState({
    rk1: subject.rk1_official?.toString() ?? '',
    rk2: subject.rk2_official?.toString() ?? '',
    exam: subject.exam?.toString() ?? '',
  });
  const parse = (s: string) => {
    const t = s.replace(',', '.').trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
  };
  const field = (k: keyof typeof v, label: string, hint: string) => (
    <div>
      <label className="label" htmlFor={`off-${k}`}>
        {label}
      </label>
      <input
        id={`off-${k}`}
        className="field num"
        inputMode="decimal"
        placeholder={hint}
        value={v[k]}
        onFocus={scrollOnFocus}
        onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.,]/g, '') })}
      />
    </div>
  );
  return (
    <Sheet title="Баллы с портала" onClose={onClose}>
      <div className="stack">
        <div className="small muted">Официальный РК важнее расчётного. Оставьте поле пустым, чтобы считать по текущим оценкам.</div>
        {field('rk1', 'РК1 (официальный)', 'пусто — расчётный')}
        {field('rk2', 'РК2 (официальный)', 'пусто — расчётный')}
        {field('exam', 'Экзамен', 'ещё не сдан')}
        <button
          className="btn primary block"
          onClick={async () => {
            await saveSubject({ ...subject, rk1_official: parse(v.rk1), rk2_official: parse(v.rk2), exam: parse(v.exam) });
            haptic.success();
            showToast('Сохранено');
            onClose();
          }}
        >
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}

export function SubjectScreen({
  subjectId,
  onBack,
  onAdd,
  onEdit,
  onCalc,
  onPhoto,
}: {
  subjectId: string;
  onBack: () => void;
  onAdd: (subjectId: string) => void;
  onEdit: (g: Grade) => void;
  onCalc: (subjectId: string) => void;
  onPhoto: (photoId: string) => void;
}) {
  const { settings, deleteGrade, showToast } = useStore();
  const view = useSubjectViews(true).find((v) => v.subject.id === subjectId);
  const [filter, setFilter] = useState<Filter>('all');
  const [official, setOfficial] = useState(false);

  const filtered = useMemo(() => (view ? view.grades.filter((g) => filter === 'all' || g.source === filter) : []), [view, filter]);

  if (!view) return <EmptyState icon={ClipboardList} title="Предмет не найден" text="Возможно, он скрыт или удалён." action={<button className="btn" onClick={onBack}>Назад</button>} />;
  const { subject, grades, summary } = view;
  const phase = phaseOf(todayAlmaty(), settings);
  const avg = (s: Filter) => average(grades.filter((g) => s === 'all' || g.source === s));

  const rkCell = (label: string, value: number | null, isOfficial: boolean, sub?: string) => (
    <button className="rk-cell" onClick={() => setOfficial(true)} aria-label={`${label}: ${fmt(value)}. Изменить`}>
      <span className="tiny muted bold">{label}</span>
      <span className="num">{fmt(value)}</span>
      <span className="tiny muted">{isOfficial ? 'портал' : sub ?? 'расчёт'}</span>
    </button>
  );

  async function remove(g: Grade) {
    if (!(await confirmAsync(`Удалить оценку ${g.score} (${KIND_LABEL[g.kind]}, ${fmtDate(g.date)})?`))) return;
    try {
      await deleteGrade(g.id);
      showToast('Оценка удалена');
    } catch (e) {
      showToast(`Ошибка: ${(e as Error).message}`);
    }
  }

  return (
    <div className="stack">
      <div className="glass top card row" style={{ padding: '10px 12px' }}>
        {!inTelegram() && (
          <button className="icon-btn" onClick={onBack} aria-label="Назад">
            <ArrowLeft size={22} />
          </button>
        )}
        <div className="grow">
          <h1 className="h1" style={{ fontSize: 18 }}>
            {subjectTitle(subject)}
          </h1>
          {subject.short_name && <div className="tiny muted ellipsis">{subject.name}</div>}
        </div>
        <LetterChip info={summary.letter} large />
      </div>

      <div className="glass card stack">
        <div className="rk-grid">
          {rkCell('РК1', summary.rk1.value, summary.rk1.official != null)}
          {rkCell(phase === 'rk2' ? 'РК2 сейчас' : 'РК2', summary.rk2.value, summary.rk2.official != null)}
          {rkCell('Экзамен', summary.exam, false, summary.exam == null ? 'не сдан' : 'портал')}
        </div>
        <div className="row between small">
          <span className="muted bold">Рейтинг допуска</span>
          <span className="row">
            <span className="num bold">{fmt(summary.admission)}</span>
            {summary.admission != null && (
              <span className={`badge ${summary.admitted ? 'ok' : 'bad'}`}>{summary.admitted ? 'допуск есть' : 'нет допуска'}</span>
            )}
          </span>
        </div>
        {summary.final != null && (
          <div className="row between small">
            <span className="muted bold">Итог</span>
            <span className="row">
              <span className="num bold">{fmt(summary.final)}</span>
              <LetterChip score={summary.final} />
            </span>
          </div>
        )}
      </div>

      <div className="glass card stack">
        <Segmented
          label="Кто поставил"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все', sub: fmt(avg('all')) },
            { value: 'lecturer', label: 'Лектор', sub: fmt(avg('lecturer')) },
            { value: 'practitioner', label: 'Практик', sub: fmt(avg('practitioner')) },
          ]}
        />
        <GradeBars grades={filtered} />
        <div className="row small muted" style={{ gap: 14 }}>
          <span className="row" style={{ gap: 6 }}>
            <i className="legend-dot lecturer" /> Лектор
          </span>
          <span className="row" style={{ gap: 6 }}>
            <i className="legend-dot practitioner" /> Практик
          </span>
        </div>
      </div>

      <div className="kind-grid">
        {KINDS.map((k) => {
          const list = grades.filter((g) => g.kind === k);
          return (
            <div key={k} className="kind-cell glass">
              <div className="tiny muted bold">{KIND_LABEL_PLURAL[k]}</div>
              <div className="num">{fmt(average(list))}</div>
              <div className="tiny muted">{list.length} шт.</div>
            </div>
          );
        })}
      </div>

      <div className="row">
        <button className="btn primary grow" onClick={() => onAdd(subject.id)}>
          <Plus size={18} /> Оценка
        </button>
        <button className="btn grow glass" onClick={() => onCalc(subject.id)}>
          <Calculator size={18} /> Сколько на экзамен
        </button>
      </div>

      <div className="section-title glass">Все оценки</div>
      {grades.length ? (
        <div className="glass card list" style={{ padding: '4px 14px' }}>
          {grades
            .slice()
            .reverse()
            .map((g) => (
              <div className="list-item" key={g.id}>
                <div className="score-box">
                  <span className="num">{g.score}</span>
                  <LetterChip score={g.score} />
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="bold">
                    {KIND_LABEL[g.kind]} · {SOURCE_LABEL[g.source].toLowerCase()}
                  </div>
                  <div className="small muted">{fmtDate(g.date)}</div>
                  {g.note && <div className="small ellipsis">{g.note}</div>}
                  <div className="row" style={{ gap: 6, marginTop: 2 }}>
                    {g._pending && <span className="badge warn">не синхронизировано</span>}
                    {g.photo_id && (
                      <button className="badge" onClick={() => onPhoto(g.photo_id!)}>
                        <ImageIcon size={12} /> фото
                      </button>
                    )}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => onEdit(g)} aria-label="Изменить">
                  <Pencil size={18} />
                </button>
                <button className="icon-btn" onClick={() => remove(g)} aria-label="Удалить" style={{ color: 'var(--danger)' }}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
        </div>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Пока нет оценок"
          text="Добавьте первую оценку — сразу увидите, как считается РК."
          action={
            <button className="btn primary" onClick={() => onAdd(subject.id)}>
              <Plus size={18} /> Добавить оценку
            </button>
          }
        />
      )}

      {official && <OfficialSheet subject={subject} onClose={() => setOfficial(false)} />}
    </div>
  );
}
