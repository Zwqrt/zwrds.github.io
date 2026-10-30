import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { subjectTitle } from '../data/defaults';
import type { Photo } from '../data/types';
import { KIND_LABEL } from '../lib/grading';
import { confirmAsync, haptic } from '../lib/telegram';
import { useStore } from '../state/store';

export const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export function PhotoViewer({ photos, start, onClose }: { photos: Photo[]; start: number; onClose: () => void }) {
  const { urls, ensureUrls, subjects, deletePhoto, showToast } = useStore();
  const [i, setI] = useState(start);
  const [dx, setDx] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const ph = photos[i];

  useEffect(() => {
    ensureUrls(photos.slice(Math.max(0, i - 1), i + 2));
  }, [i, photos, ensureUrls]);

  useEffect(() => {
    if (!ph) onClose();
  }, [ph, onClose]);

  const go = (d: number) => {
    const n = i + d;
    if (n < 0 || n >= photos.length) return;
    haptic.select();
    setI(n);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!ph) return null;
  const subj = subjects.find((s) => s.id === ph.subject_id);

  async function remove() {
    if (!(await confirmAsync('Удалить это фото?'))) return;
    try {
      await deletePhoto(ph);
      showToast('Фото удалено');
      if (photos.length <= 1) onClose();
      else setI((x) => Math.min(x, photos.length - 2));
    } catch (e) {
      showToast(`Ошибка: ${(e as Error).message}`);
    }
  }

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Просмотр фото">
      <div className="viewer-top">
        <button className="icon-btn glass" onClick={onClose} aria-label="Закрыть">
          <X size={22} />
        </button>
        <div className="row">
          <button className="icon-btn glass" onClick={() => go(-1)} disabled={i === 0} aria-label="Предыдущее">
            <ChevronLeft size={22} />
          </button>
          <button className="icon-btn glass" onClick={() => go(1)} disabled={i === photos.length - 1} aria-label="Следующее">
            <ChevronRight size={22} />
          </button>
        </div>
      </div>
      <div
        className="viewer-img"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchMove={(e) => {
          if (!touch.current) return;
          const ddx = e.touches[0].clientX - touch.current.x;
          if (Math.abs(ddx) > Math.abs(e.touches[0].clientY - touch.current.y)) setDx(ddx);
        }}
        onTouchEnd={() => {
          if (dx < -60) go(1);
          else if (dx > 60) go(-1);
          setDx(0);
          touch.current = null;
        }}
      >
        {urls[ph.id] ? (
          <img src={urls[ph.id]} alt={`Фото: ${subj ? subjectTitle(subj) : 'без предмета'}, ${fmtDate(ph.date)}`} style={{ transform: `translateX(${dx}px)` }} />
        ) : (
          <div className="spinner" />
        )}
      </div>
      <div className="viewer-bar glass row between">
        <div className="grow">
          <div className="bold ellipsis">{subj ? subjectTitle(subj) : 'Без предмета'}</div>
          <div className="small muted">
            {[ph.kind ? KIND_LABEL[ph.kind] : null, fmtDate(ph.date), `${i + 1} из ${photos.length}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button className="btn sm danger" onClick={remove} aria-label="Удалить фото">
          <Trash2 size={18} /> Удалить
        </button>
      </div>
    </div>
  );
}
