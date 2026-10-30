import { Camera, ImagePlus, Images } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { subjectTitle } from '../data/defaults';
import type { Photo } from '../data/types';
import { todayAlmaty } from '../data/util';
import { KINDS, KIND_LABEL, type Kind } from '../lib/grading';
import { haptic } from '../lib/telegram';
import { useStore } from '../state/store';
import { EmptyState, Segmented, Sheet, scrollOnFocus } from '../components/ui';
import { fmtDate } from '../components/PhotoViewer';

function UploadSheet({ files, defaultSubject, onClose }: { files: File[]; defaultSubject: string | null; onClose: () => void }) {
  const { subjects, settings, addPhotos, showToast } = useStore();
  const list = subjects.filter((s) => !s.hidden && s.period === settings.period);
  const [sid, setSid] = useState<string | null>(defaultSubject);
  const [kind, setKind] = useState<Kind | 'none'>('none');
  const [date, setDate] = useState(todayAlmaty());
  const [done, setDone] = useState(-1);

  async function upload() {
    setDone(0);
    try {
      await addPhotos(files, { subject_id: sid, kind: kind === 'none' ? null : kind, date }, setDone);
      showToast(files.length === 1 ? 'Фото сохранено' : `Сохранено фото: ${files.length}`);
      onClose();
    } catch (e) {
      haptic.error();
      showToast(`Не удалось загрузить: ${(e as Error).message}`);
      setDone(-1);
    }
  }

  return (
    <Sheet title={`Фото: ${files.length}`} onClose={done >= 0 ? () => {} : onClose}>
      <div className="stack">
        <div>
          <span className="label">Предмет</span>
          <div className="chips">
            <button className="chip" aria-pressed={sid === null} onClick={() => setSid(null)}>
              Без предмета
            </button>
            {list.map((s) => (
              <button key={s.id} className="chip" aria-pressed={sid === s.id} onClick={() => setSid(s.id)}>
                {subjectTitle(s)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Вид занятия</span>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[{ value: 'none' as const, label: '—' }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]}
          />
        </div>
        <div>
          <label className="label" htmlFor="ph-date">
            Дата
          </label>
          <input id="ph-date" className="field" type="date" value={date} onFocus={scrollOnFocus} onChange={(e) => setDate(e.target.value)} />
        </div>
        {done >= 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="progress">
              <div style={{ width: `${(done / files.length) * 100}%` }} />
            </div>
            <div className="small muted">
              Сжимаю и загружаю: {done} из {files.length}
            </div>
          </div>
        )}
        <button className="btn primary block" disabled={done >= 0} onClick={upload}>
          Загрузить
        </button>
        <div className="tiny muted center">Фото сжимаются до 1600 px (JPEG 80%), чтобы экономить место.</div>
      </div>
    </Sheet>
  );
}

export function PhotosScreen({ onOpen }: { onOpen: (photos: Photo[], index: number) => void }) {
  const { photos, subjects, settings, urls, ensureUrls } = useStore();
  const [filter, setFilter] = useState<string>('all');
  const [files, setFiles] = useState<File[] | null>(null);
  const list = subjects.filter((s) => !s.hidden && s.period === settings.period);

  const shown = useMemo(
    () => photos.filter((p) => filter === 'all' || (filter === 'none' ? !p.subject_id : p.subject_id === filter)),
    [photos, filter],
  );

  useEffect(() => {
    ensureUrls(shown);
  }, [shown, ensureUrls]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (f.length) setFiles(f);
  };

  const subjName = (id: string | null) => {
    const s = subjects.find((x) => x.id === id);
    return s ? subjectTitle(s) : 'Без предмета';
  };

  return (
    <div className="stack">
      <div className="glass top card stack" style={{ gap: 10 }}>
        <h1 className="h1">Фото с пар</h1>
        <div className="row">
          <label className="btn primary grow">
            <Camera size={18} /> Снять доску
            <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
          </label>
          <label className="btn grow">
            <ImagePlus size={18} /> Из галереи
            <input type="file" accept="image/*" multiple hidden onChange={pick} />
          </label>
        </div>
      </div>

      <div className="chips" role="group" aria-label="Фильтр по предмету">
        <button className="chip glass" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          Все · {photos.length}
        </button>
        {list.map((s) => {
          const n = photos.filter((p) => p.subject_id === s.id).length;
          return (
            <button key={s.id} className="chip glass" aria-pressed={filter === s.id} onClick={() => setFilter(s.id)}>
              {subjectTitle(s)} · {n}
            </button>
          );
        })}
        {photos.some((p) => !p.subject_id) && (
          <button className="chip glass" aria-pressed={filter === 'none'} onClick={() => setFilter('none')}>
            Без предмета
          </button>
        )}
      </div>

      {shown.length ? (
        <div className="masonry">
          {shown.map((p, i) => (
            <button key={p.id} className="ph glass" onClick={() => onOpen(shown, i)}>
              {urls[p.id] ? (
                <img
                  src={urls[p.id]}
                  alt={`${subjName(p.subject_id)}, ${fmtDate(p.date)}`}
                  loading="lazy"
                  width={p.width ?? undefined}
                  height={p.height ?? undefined}
                />
              ) : (
                <div style={{ aspectRatio: `${p.width ?? 3} / ${p.height ?? 4}` }} />
              )}
              <div className="ph-cap">
                <div className="small bold ellipsis">{subjName(p.subject_id)}</div>
                <div className="tiny muted ellipsis">
                  {[p.kind ? KIND_LABEL[p.kind] : null, fmtDate(p.date)].filter(Boolean).join(' · ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Images}
          title="Фото пока нет"
          text="Снимайте доску и конспекты — фото будут разложены по предметам."
          action={
            <label className="btn primary">
              <Camera size={18} /> Снять доску
              <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
            </label>
          }
        />
      )}

      {files && (
        <UploadSheet files={files} defaultSubject={filter !== 'all' && filter !== 'none' ? filter : null} onClose={() => setFiles(null)} />
      )}
    </div>
  );
}
