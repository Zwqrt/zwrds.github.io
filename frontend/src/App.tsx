import { useCallback, useEffect, useRef, useState } from 'react';
import { AddGradeSheet, type AddGradeInit } from './components/AddGradeSheet';
import { BottomNav, type Tab } from './components/BottomNav';
import { PhotoViewer } from './components/PhotoViewer';
import type { Grade, Photo } from './data/types';
import { bindBackButton } from './lib/telegram';
import { useTheme } from './lib/useTheme';
import { CalculatorScreen } from './screens/Calculator';
import { Gate } from './screens/Gate';
import { HomeScreen } from './screens/Home';
import { PhotosScreen } from './screens/Photos';
import { ProfileScreen } from './screens/Profile';
import { SubjectScreen } from './screens/Subject';
import { useStore } from './state/store';

interface Viewer {
  photos: Photo[];
  index: number;
}

export function App() {
  const store = useStore();
  useTheme(store.settings.theme);

  const [tab, setTab] = useState<Tab>('home');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<AddGradeInit | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [calcSubject, setCalcSubject] = useState<string | undefined>();
  const scroller = useRef<HTMLDivElement>(null);

  const ready = store.status === 'ready' || store.status === 'offline';

  // Назад: просмотр фото → лист → предмет → вкладка «Главная».
  const back = useCallback(() => {
    if (viewer) return setViewer(null);
    if (sheet) return setSheet(null);
    if (subjectId) return setSubjectId(null);
    if (tab !== 'home') return setTab('home');
  }, [viewer, sheet, subjectId, tab]);

  const canGoBack = ready && (!!viewer || !!sheet || !!subjectId || tab !== 'home');
  useEffect(() => bindBackButton(canGoBack ? back : null), [canGoBack, back]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [tab, subjectId]);

  const openSubject = (id: string) => {
    setSubjectId(id);
  };
  const openPhotoById = (id: string) => {
    const i = store.photos.findIndex((p) => p.id === id);
    if (i >= 0) setViewer({ photos: store.photos, index: i });
  };

  let content;
  if (!ready) content = <Gate />;
  else if (subjectId)
    content = (
      <SubjectScreen
        subjectId={subjectId}
        onBack={() => setSubjectId(null)}
        onAdd={(id) => setSheet({ subjectId: id })}
        onEdit={(g: Grade) => setSheet({ grade: g })}
        onCalc={(id) => {
          setCalcSubject(id);
          setSubjectId(null);
          setTab('calc');
        }}
        onPhoto={openPhotoById}
      />
    );
  else if (tab === 'home') content = <HomeScreen onOpenSubject={openSubject} onAdd={(id) => setSheet({ subjectId: id })} />;
  else if (tab === 'photos') content = <PhotosScreen onOpen={(photos, index) => setViewer({ photos, index })} />;
  else if (tab === 'calc') content = <CalculatorScreen initialSubject={calcSubject} />;
  else content = <ProfileScreen />;

  return (
    <>
      <div className="bg" aria-hidden />
      <div className="app">
        <main className={`screen${ready ? '' : ' no-nav'}`} ref={scroller}>
          {content}
        </main>
        {ready && (
          <BottomNav
            tab={subjectId ? ('none' as Tab) : tab}
            onTab={(t) => {
              setSubjectId(null);
              setTab(t);
            }}
            onAdd={() => setSheet({ subjectId: subjectId ?? undefined })}
          />
        )}
      </div>
      {sheet && <AddGradeSheet key={sheet.grade?.id ?? sheet.subjectId ?? 'new'} init={sheet} onClose={() => setSheet(null)} />}
      {viewer && <PhotoViewer photos={viewer.photos} start={viewer.index} onClose={() => setViewer(null)} />}
      {store.toast && (
        <div className="toast glass" role="status">
          {store.toast}
        </div>
      )}
    </>
  );
}
