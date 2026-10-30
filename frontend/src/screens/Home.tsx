import { BookOpen, CalendarDays, CloudOff, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { subjectTitle } from '../data/defaults';
import { todayAlmaty } from '../data/util';
import { KIND_LABEL, SOURCE_LABEL, fmt, fmtGpa, phaseOf, weeksLeft } from '../lib/grading';
import { useOverall, useSubjectViews } from '../state/derived';
import { useStore } from '../state/store';
import { AnimatedNumber, EmptyState, LetterChip, Ring, Sparkline } from '../components/ui';

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export function HomeScreen({ onOpenSubject, onAdd }: { onOpenSubject: (id: string) => void; onAdd: (subjectId?: string) => void }) {
  const { settings, grades, subjects, pending, status, sync } = useStore();
  const views = useSubjectViews();
  const total = useOverall();
  const today = todayAlmaty();
  const todays = grades.filter((g) => g.date === today).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const phase = phaseOf(today, settings);
  const rawDate = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Almaty' });
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  let deadline: string;
  if (phase === 'before') deadline = 'семестр ещё не начался';
  else if (phase === 'session') deadline = 'РК закончились — сессия';
  else {
    const rk = phase === 'rk1' ? 1 : 2;
    const n = weeksLeft(today, rk, settings);
    deadline = `до конца РК${rk} — ${n} ${plural(n, 'неделя', 'недели', 'недель')}`;
  }

  return (
    <div className="stack">
      <div className="date-bar glass top">
        <div className="row">
          <CalendarDays size={18} />
          <span className="bold">
            {dateLabel}
          </span>
        </div>
        <span className="badge">{settings.period} академ. период</span>
      </div>

      {(pending > 0 || status === 'offline') && (
        <button className="glass card row" onClick={() => sync()} style={{ textAlign: 'left' }}>
          <CloudOff size={20} color="var(--warn)" />
          <div className="grow">
            <div className="bold">{status === 'offline' ? 'Нет связи — показаны сохранённые данные' : 'Есть несинхронизированные оценки'}</div>
            {pending > 0 && (
              <div className="small muted">
                Не синхронизировано: {pending}. Отправим автоматически, когда появится сеть.
              </div>
            )}
          </div>
          <RefreshCw size={18} />
        </button>
      )}

      <div className="glass card hero">
        <Ring value={total.rating} size={128}>
          <span className="num" style={{ fontSize: 28, fontWeight: 700 }}>
            <AnimatedNumber value={total.rating} />
          </span>
          <span className="tiny muted bold">рейтинг</span>
        </Ring>
        <div className="hero-stats">
          <div className="row">
            <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>
              <AnimatedNumber value={total.gpa} format={fmtGpa} />
            </span>
            <span className="muted bold small">GPA</span>
            {total.rating != null && <LetterChip score={total.rating} />}
          </div>
          <div className="stat-line">
            <Sparkles size={16} color="var(--accent)" />
            {todays.length ? `+${todays.length} ${plural(todays.length, 'оценка', 'оценки', 'оценок')} сегодня` : 'Сегодня оценок нет'}
          </div>
          <div className="stat-line muted">
            <CalendarDays size={16} />
            {deadline}
          </div>
        </div>
      </div>

      <div className="section-title glass">Сегодня</div>
      {todays.length ? (
        <div className="today-strip">
          {todays.map((g) => {
            const s = subjects.find((x) => x.id === g.subject_id);
            return (
              <button key={g.id} className="today-card glass" onClick={() => onOpenSubject(g.subject_id)}>
                <div className="row between">
                  <span className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                    {g.score}
                  </span>
                  <LetterChip score={g.score} />
                </div>
                <div className="bold ellipsis" style={{ marginTop: 6 }}>
                  {s ? subjectTitle(s) : '—'}
                </div>
                <div className="tiny muted ellipsis">
                  {KIND_LABEL[g.kind]} · {SOURCE_LABEL[g.source].toLowerCase()}
                </div>
                {g._pending && <span className="badge warn" style={{ marginTop: 6 }}>не синхр.</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="glass card row">
          <div className="grow small muted">Сегодня ещё нет оценок. Получили — добавьте сразу, чтобы видеть, как меняется РК.</div>
          <button className="btn sm primary" onClick={() => onAdd()}>
            <Plus size={16} /> Оценка
          </button>
        </div>
      )}

      <div className="section-title glass">Предметы</div>
      {views.length ? (
        <div className="tiles">
          {views.map(({ subject, grades: gs, summary }) => (
            <button key={subject.id} className="tile glass" onClick={() => onOpenSubject(subject.id)}>
              <div className="tile-name">{subjectTitle(subject)}</div>
              <div className="row between">
                <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>
                  {fmt(summary.rating)}
                </span>
                <LetterChip info={summary.letter} />
              </div>
              <Sparkline values={gs.slice(-7).map((g) => g.score)} />
              <div className="tiny muted">{gs.length ? `${gs.length} ${plural(gs.length, 'оценка', 'оценки', 'оценок')}` : 'нет оценок'}</div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon={BookOpen} title="Нет предметов" text="Добавьте предметы в профиле — они появятся здесь плитками." />
      )}
    </div>
  );
}
