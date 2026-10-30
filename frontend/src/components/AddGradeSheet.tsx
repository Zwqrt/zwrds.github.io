import { Camera, CloudOff, ImagePlus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { dative, subjectTitle } from '../data/defaults';
import type { Grade } from '../data/types';
import { todayAlmaty, uuid } from '../data/util';
import {
  DEFAULT_SOURCE,
  KINDS,
  KIND_LABEL,
  SOURCE_LABEL,
  fmt,
  rkPreview,
  type Kind,
  type Source,
} from '../lib/grading';
import { haptic } from '../lib/telegram';
import { useSubjectViews } from '../state/derived';
import { useStore } from '../state/store';
import { LetterChip, Segmented, Sheet, scrollOnFocus } from './ui';

const QUICK = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];

export interface AddGradeInit {
  subjectId?: string;
  grade?: Grade;
}

export function AddGradeSheet({ init, onClose }: { init: AddGradeInit; onClose: () => void }) {
  const { settings, saveGrade, showToast, photos, urls } = useStore();
  const views = useSubjectViews();
  const editing = init.grade;

  const [subjectId, setSubjectId] = useState(editing?.subject_id ?? init.subjectId ?? views[0]?.subject.id ?? '');
  const [kind, setKind] = useState<Kind>(editing?.kind ?? 'lecture');
  const [source, setSource] = useState<Source>(editing?.source ?? DEFAULT_SOURCE[editing?.kind ?? 'lecture']);
  const [sourceTouched, setSourceTouched] = useState(!!editing);
  const [score, setScore] = useState<number | null>(editing?.score ?? null);
  const [raw, setRaw] = useState(editing ? String(editing.score) : '');
  const [date, setDate] = useState(editing?.date ?? todayAlmaty());
  const [note, setNote] = useState(editing?.note ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const existingPhoto = editing?.photo_id ? photos.find((p) => p.id === editing.photo_id) : undefined;
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);

  const view = views.find((v) => v.subject.id === subjectId);

  const preview = useMemo(() => {
    if (!view || score == null) return null;
    const draft = { date, score, kind, source };
    const before = view.grades;
    const after = editing ? before.map((g) => (g.id === editing.id ? { ...g, ...draft } : g)) : [...before, draft];
    return rkPreview(before, after, date, settings);
  }, [view, score, date, kind, source, editing, settings]);

  const pickKind = (k: Kind) => {
    setKind(k);
    if (!sourceTouched) setSource(DEFAULT_SOURCE[k]);
  };

  const setScoreText = (v: string) => {
    const clean = v.replace(/[^\d]/g, '').slice(0, 3);
    setRaw(clean);
    if (clean === '') return setScore(null);
    const n = Math.min(100, Number(clean));
    setScore(n);
    if (Number(clean) > 100) setRaw('100');
  };

  const valid = !!subjectId && score != null && score >= 0 && score <= 100 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const g: Grade = {
        id: editing?.id ?? uuid(),
        subject_id: subjectId,
        date,
        score: score!,
        kind,
        source,
        note: note.trim() || null,
        photo_id: editing?.photo_id ?? null,
        created_at: editing?.created_at,
      };
      const r = await saveGrade(g, photo);
      showToast(r === 'queued' ? 'Сохранено на телефоне — отправим, когда будет сеть' : editing ? 'Оценка обновлена' : 'Оценка сохранена');
      onClose();
    } catch (e) {
      showToast(`Не удалось сохранить: ${(e as Error).message}`);
      setSaving(false);
    }
  }

  return (
    <Sheet title={editing ? 'Изменить оценку' : 'Новая оценка'} onClose={onClose}>
      <div className="stack">
        <div>
          <span className="label">Предмет</span>
          <div className="chips" role="group" aria-label="Предмет">
            {views.map((v) => (
              <button
                key={v.subject.id}
                className="chip"
                aria-pressed={v.subject.id === subjectId}
                onClick={() => {
                  haptic.select();
                  setSubjectId(v.subject.id);
                }}
              >
                {subjectTitle(v.subject)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Вид работы</span>
          <Segmented label="Вид работы" value={kind} onChange={pickKind} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </div>

        <div>
          <span className="label">От кого</span>
          <Segmented
            label="От кого"
            value={source}
            onChange={(s) => {
              setSource(s);
              setSourceTouched(true);
            }}
            options={[
              { value: 'lecturer', label: SOURCE_LABEL.lecturer },
              { value: 'practitioner', label: SOURCE_LABEL.practitioner },
            ]}
          />
        </div>

        <div className="big-score" aria-live="polite">
          <span className="num">{score ?? '—'}</span>
          <LetterChip score={score} large />
        </div>

        <div className="quick" role="group" aria-label="Быстрый выбор балла">
          {QUICK.map((q) => (
            <button
              key={q}
              aria-pressed={score === q}
              onClick={() => {
                haptic.select();
                setScore(q);
                setRaw(String(q));
              }}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="row">
          <div className="grow">
            <label className="label" htmlFor="score-in">
              Любой балл 0–100
            </label>
            <input
              id="score-in"
              className="field num"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="например, 87"
              value={raw}
              onFocus={scrollOnFocus}
              onChange={(e) => setScoreText(e.target.value)}
            />
          </div>
          <div className="grow">
            <label className="label" htmlFor="date-in">
              Дата
            </label>
            <input id="date-in" className="field" type="date" value={date} onFocus={scrollOnFocus} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {preview && view && (
          <div className="preview" aria-live="polite">
            РК{preview.rk} по {dative(subjectTitle(view.subject))}: {fmt(preview.before)} → {fmt(preview.after)}
          </div>
        )}
        {!preview && score != null && (
          <div className="preview muted">Дата вне РК1/РК2 — оценка не войдёт в расчёт рубежного контроля</div>
        )}

        <div>
          <span className="label">Фото (необязательно)</span>
          <div className="row">
            <label className="btn sm">
              <Camera size={18} /> Снять
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
            <label className="btn sm">
              <ImagePlus size={18} /> Из галереи
              <input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
            {(photoPreview || (existingPhoto && urls[existingPhoto.id])) && (
              <img
                src={photoPreview ?? urls[existingPhoto!.id]}
                alt="Фото к оценке"
                style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 12 }}
              />
            )}
            {photo && (
              <button className="icon-btn" aria-label="Убрать фото" onClick={() => setPhoto(null)}>
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="note-in">
            Заметка (необязательно)
          </label>
          <textarea id="note-in" className="field" rows={2} value={note} onFocus={scrollOnFocus} onChange={(e) => setNote(e.target.value)} placeholder="Тема, за что оценка…" />
        </div>

        {!navigator.onLine && (
          <div className="row small muted">
            <CloudOff size={16} /> Нет сети — оценка сохранится на телефоне и отправится позже
          </div>
        )}

        <button className="btn primary block" disabled={!valid || saving} onClick={save}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </Sheet>
  );
}
