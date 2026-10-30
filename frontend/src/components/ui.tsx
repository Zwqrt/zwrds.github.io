import { X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmt, letterFor, type LetterInfo } from '../lib/grading';
import { haptic } from '../lib/telegram';

export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Чип буквы: цвет + всегда текст буквы. */
export function LetterChip({ score, info, large }: { score?: number | null; info?: LetterInfo | null; large?: boolean }) {
  const l = info ?? (score == null ? null : letterFor(score));
  if (!l)
    return (
      <span className={`chip-letter none${large ? ' lg' : ''}`} aria-label="Нет оценки">
        —
      </span>
    );
  return (
    <span className={`chip-letter g-${l.group}${large ? ' lg' : ''}`} aria-label={`Буква ${l.letter}`}>
      {l.letter}
    </span>
  );
}

/** Анимированное число (отключается при prefers-reduced-motion). */
export function AnimatedNumber({ value, format = (n) => fmt(n) }: { value: number | null; format?: (n: number) => string }) {
  const [shown, setShown] = useState<number | null>(value);
  const from = useRef<number>(value ?? 0);
  useEffect(() => {
    if (value == null) {
      setShown(null);
      return;
    }
    if (reducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    const dur = 900;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown == null ? '—' : format(shown)}</>;
}

export function Ring({ value, size = 128, stroke = 12, children }: { value: number | null; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [v, setV] = useState(reducedMotion() ? value ?? 0 : 0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value ?? 0));
    return () => cancelAnimationFrame(id);
  }, [value]);
  const off = c * (1 - Math.max(0, Math.min(100, v)) / 100);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/** Мини-график последних оценок. */
export function Sparkline({ values, width = 120, height = 34 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2)
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        {values.length === 1 && <circle cx={width / 2} cy={height - (values[0] / 100) * (height - 6) - 3} r={3} fill="var(--accent)" />}
      </svg>
    );
  const min = Math.min(...values, 50);
  const max = Math.max(...values, 100);
  const pts = values.map((v, i) => {
    const x = 3 + (i / (values.length - 1)) * (width - 6);
    const y = 3 + (1 - (v - min) / (max - min || 1)) * (height - 6);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={`${d} L${last[0]},${height} L${pts[0][0]},${height} Z`} fill="var(--accent-soft)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={3} fill="var(--accent)" />
    </svg>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  sub?: ReactNode;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => {
            if (o.value !== value) haptic.select();
            onChange(o.value);
          }}
        >
          {o.label}
          {o.sub != null && <span className="sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <div className="h2">{title}</div>
      <div className="muted small">{text}</div>
      {action}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet glass" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2 className="h2">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={22} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

/** Поле ввода, которое прокручивается в видимую область при открытой клавиатуре. */
export function scrollOnFocus(e: { currentTarget: HTMLElement }) {
  const el = e.currentTarget;
  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }), 300);
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Загрузка" />;
}
