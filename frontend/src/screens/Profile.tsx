import { Archive, ChevronDown, ChevronUp, Download, Eye, EyeOff, FileJson, FileSpreadsheet, HardDrive, Plus, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { subjectTitle } from '../data/defaults';
import type { Settings, Subject, Usage } from '../data/types';
import { uuid } from '../data/util';
import { buildBackupZip, collectBackup, gradesCsv, importBackup, saveFile } from '../lib/backup';
import { KINDS, KIND_LABEL_PLURAL, rkDates } from '../lib/grading';
import { formatBytes } from '../lib/image';
import { confirmAsync, haptic } from '../lib/telegram';
import { useStore } from '../state/store';
import { Segmented, Sheet, scrollOnFocus } from '../components/ui';
import { fmtDate } from '../components/PhotoViewer';

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between small">
        <span className="bold">{label}</span>
        <span className="muted">
          {formatBytes(used)}
          {limit ? ` из ${formatBytes(limit)} (${pct.toFixed(pct < 1 ? 1 : 0).replace('.', ',')}%)` : ''}
        </span>
      </div>
      {limit && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div style={{ width: `${Math.max(pct, 1)}%`, background: pct > 85 ? 'var(--danger)' : undefined }} />
        </div>
      )}
    </div>
  );
}

function SubjectSheet({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const { saveSubject, showToast } = useStore();
  const [name, setName] = useState(subject.name);
  const [short, setShort] = useState(subject.short_name ?? '');
  const [period, setPeriod] = useState(String(subject.period));
  return (
    <Sheet title={subject.name ? 'Предмет' : 'Новый предмет'} onClose={onClose}>
      <div className="stack">
        <div>
          <label className="label" htmlFor="s-name">
            Название
          </label>
          <input id="s-name" className="field" value={name} onFocus={scrollOnFocus} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s-short">
            Короткое имя (для плиток)
          </label>
          <input id="s-short" className="field" value={short} onFocus={scrollOnFocus} onChange={(e) => setShort(e.target.value)} placeholder="необязательно" />
        </div>
        <div>
          <span className="label">Академический период</span>
          <Segmented value={period} onChange={setPeriod} options={[{ value: '1', label: '1 период' }, { value: '2', label: '2 период' }, { value: '3', label: '3 период' }]} />
        </div>
        <button
          className="btn primary block"
          disabled={!name.trim()}
          onClick={async () => {
            await saveSubject({ ...subject, name: name.trim(), short_name: short.trim() || null, period: Number(period) });
            haptic.success();
            showToast('Предмет сохранён');
            onClose();
          }}
        >
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}

export function ProfileScreen() {
  const store = useStore();
  const { settings, subjects, saveSettings, saveSubject, provider, showToast, reload } = store;
  const [draft, setDraft] = useState<Settings>(settings);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    provider?.usage().then(setUsage).catch(() => setUsage(null));
  }, [provider, store.photos.length]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v.replace(/[^\d]/g, '')) || min));

  const periodSubjects = subjects.filter((s) => s.period === draft.period).sort((a, b) => a.sort - b.sort);

  async function move(s: Subject, dir: -1 | 1) {
    const i = periodSubjects.findIndex((x) => x.id === s.id);
    const other = periodSubjects[i + dir];
    if (!other) return;
    haptic.select();
    await saveSubject({ ...s, sort: other.sort });
    await saveSubject({ ...other, sort: s.sort === other.sort ? s.sort + dir : s.sort });
  }

  async function exportJson() {
    setBusy('json');
    try {
      const data = await collectBackup(provider);
      await saveFile(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `kartu-grades-${data.exported_at.slice(0, 10)}.json`);
    } catch (e) {
      showToast(`Ошибка экспорта: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  async function exportCsv() {
    setBusy('csv');
    try {
      const data = await collectBackup(provider);
      await saveFile(new Blob([gradesCsv(data)], { type: 'text/csv;charset=utf-8' }), `kartu-grades-${data.exported_at.slice(0, 10)}.csv`);
    } catch (e) {
      showToast(`Ошибка экспорта: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  async function exportZip() {
    setBusy('zip:0');
    try {
      const blob = await buildBackupZip(provider, (d, t) => setBusy(`zip:${d}/${t}`));
      await saveFile(blob, `backup-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) {
      showToast(`Ошибка бэкапа: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  async function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!(await confirmAsync('Импортировать данные? Записи с теми же id будут перезаписаны, остальные останутся.'))) return;
    setBusy('import');
    try {
      const r = await importBackup(provider, f, (d, t) => setBusy(`import:${d}/${t}`));
      await reload();
      haptic.success();
      showToast(`Импортировано: предметов ${r.subjects}, оценок ${r.grades}, фото ${r.photos}`);
    } catch (err) {
      haptic.error();
      showToast(`Ошибка импорта: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const rk1d = rkDates(1, draft);
  const rk2d = rkDates(2, draft);

  return (
    <div className="stack">
      <div className="glass top card">
        <h1 className="h1">Профиль</h1>
        <div className="small muted">
          КарТУ им. Сагинова · 1 курс · бэкенд: {provider?.name === 'server' ? 'свой сервер' : provider?.name === 'demo' ? 'демо (локально)' : 'Supabase'}
        </div>
      </div>

      <div className="section-title glass">Оформление</div>
      <div className="glass card stack">
        <Segmented
          label="Тема"
          value={draft.theme}
          onChange={(t) => {
            const next = { ...draft, theme: t };
            setDraft(next);
            saveSettings({ ...settings, theme: t });
          }}
          options={[
            { value: 'auto', label: 'Авто' },
            { value: 'day', label: 'День' },
            { value: 'night', label: 'Ночь' },
          ]}
        />
        <div className="tiny muted">Авто: день с 7:00 до 19:00 по времени Алматы.</div>
      </div>

      <div className="section-title glass">Семестр</div>
      <div className="glass card stack">
        <div>
          <span className="label">Академический период</span>
          <Segmented value={String(draft.period)} onChange={(v) => set('period', Number(v))} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
        </div>
        <div>
          <label className="label" htmlFor="sem-start">
            Начало семестра (1-я неделя)
          </label>
          <input id="sem-start" className="field" type="date" value={draft.semester_start} onFocus={scrollOnFocus} onChange={(e) => set('semester_start', e.target.value)} />
        </div>
        {(['rk1', 'rk2'] as const).map((rk) => (
          <div key={rk}>
            <span className="label">
              {rk === 'rk1' ? 'РК1' : 'РК2'}: недели ({fmtDate((rk === 'rk1' ? rk1d : rk2d).from)} — {fmtDate((rk === 'rk1' ? rk1d : rk2d).to)})
            </span>
            <div className="row">
              <input
                aria-label={`${rk} с недели`}
                className="field num"
                inputMode="numeric"
                value={draft[rk].from}
                onFocus={scrollOnFocus}
                onChange={(e) => set(rk, { ...draft[rk], from: num(e.target.value, 1, 30) })}
              />
              <span className="muted">—</span>
              <input
                aria-label={`${rk} по неделю`}
                className="field num"
                inputMode="numeric"
                value={draft[rk].to}
                onFocus={scrollOnFocus}
                onChange={(e) => set(rk, { ...draft[rk], to: num(e.target.value, 1, 30) })}
              />
            </div>
          </div>
        ))}
        <div>
          <span className="label">Веса видов работ (одинаковые = обычное среднее)</span>
          <div className="kind-grid">
            {KINDS.map((k) => (
              <div key={k}>
                <label className="tiny muted bold" htmlFor={`w-${k}`}>
                  {KIND_LABEL_PLURAL[k]}
                </label>
                <input
                  id={`w-${k}`}
                  className="field num"
                  inputMode="decimal"
                  value={draft.weights[k]}
                  onFocus={scrollOnFocus}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''));
                    set('weights', { ...draft.weights, [k]: Number.isFinite(v) ? v : 0 });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <button
          className="btn primary block"
          disabled={!dirty}
          onClick={async () => {
            await saveSettings(draft);
            haptic.success();
            showToast('Настройки сохранены');
          }}
        >
          Сохранить настройки
        </button>
      </div>

      <div className="section-title glass">Предметы · {draft.period} период</div>
      <div className="glass card list" style={{ padding: '4px 14px' }}>
        {periodSubjects.map((s, i) => (
          <div className="list-item" key={s.id}>
            <button className="grow" style={{ textAlign: 'left', minWidth: 0, opacity: s.hidden ? 0.6 : 1 }} onClick={() => setEditing(s)}>
              <div className="bold ellipsis">{subjectTitle(s)}</div>
              <div className="tiny muted ellipsis">{s.hidden ? 'скрыт · ' : ''}{s.name}</div>
            </button>
            <button className="icon-btn" disabled={i === 0} onClick={() => move(s, -1)} aria-label="Выше">
              <ChevronUp size={18} />
            </button>
            <button className="icon-btn" disabled={i === periodSubjects.length - 1} onClick={() => move(s, 1)} aria-label="Ниже">
              <ChevronDown size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => saveSubject({ ...s, hidden: !s.hidden })}
              aria-label={s.hidden ? 'Показать' : 'Скрыть'}
            >
              {s.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        ))}
        <div className="list-item">
          <button
            className="btn ghost"
            onClick={() =>
              setEditing({
                id: uuid(),
                name: '',
                short_name: null,
                period: draft.period,
                hidden: false,
                sort: Math.max(0, ...subjects.map((x) => x.sort)) + 1,
                rk1_official: null,
                rk2_official: null,
                exam: null,
              })
            }
          >
            <Plus size={18} /> Добавить предмет
          </button>
        </div>
      </div>

      <div className="section-title glass">Место</div>
      <div className="glass card stack">
        <div className="row">
          <HardDrive size={18} />
          <span className="bold">Занято на бесплатном тарифе</span>
        </div>
        {usage ? (
          <>
            <UsageBar label="База данных" used={usage.db_bytes} limit={usage.db_limit} />
            <UsageBar label="Фото" used={usage.storage_bytes} limit={usage.storage_limit} />
          </>
        ) : (
          <div className="small muted">Не удалось получить данные</div>
        )}
      </div>

      <div className="section-title glass">Данные</div>
      <div className="glass card stack">
        <button className="btn block" onClick={exportZip} disabled={!!busy}>
          <Archive size={18} /> {busy?.startsWith('zip') ? `Собираю архив… ${busy.slice(4)}` : 'Бэкап: backup.zip (данные + фото)'}
        </button>
        <div className="row">
          <button className="btn grow" onClick={exportJson} disabled={!!busy}>
            <FileJson size={18} /> JSON
          </button>
          <button className="btn grow" onClick={exportCsv} disabled={!!busy}>
            <FileSpreadsheet size={18} /> CSV
          </button>
        </div>
        <label className={`btn block${busy ? ' disabled' : ''}`} style={busy ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
          <Upload size={18} /> {busy?.startsWith('import') ? `Импорт… ${busy.slice(7)}` : 'Импорт из backup.zip или JSON'}
          <input type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={doImport} />
        </label>
        <div className="tiny muted">
          <Download size={12} style={{ verticalAlign: -2 }} /> backup.zip одинаково импортируется и в Supabase, и на свой сервер — так переезжают на VPS.
        </div>
      </div>

      {editing && <SubjectSheet subject={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
