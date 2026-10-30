import { Calculator, Home, Images, Plus, User } from 'lucide-react';
import { haptic } from '../lib/telegram';

export type Tab = 'home' | 'photos' | 'calc' | 'profile';

const ITEMS: { tab: Tab; label: string; icon: typeof Home }[] = [
  { tab: 'home', label: 'Главная', icon: Home },
  { tab: 'photos', label: 'Фото', icon: Images },
  { tab: 'calc', label: 'Расчёт', icon: Calculator },
  { tab: 'profile', label: 'Профиль', icon: User },
];

export function BottomNav({ tab, onTab, onAdd }: { tab: Tab; onTab: (t: Tab) => void; onAdd: () => void }) {
  const item = (i: (typeof ITEMS)[number]) => (
    <button
      key={i.tab}
      className="nav-item"
      aria-current={tab === i.tab ? 'page' : undefined}
      onClick={() => {
        haptic.select();
        onTab(i.tab);
      }}
    >
      <i.icon size={22} strokeWidth={tab === i.tab ? 2.4 : 2} />
      {i.label}
    </button>
  );
  return (
    <nav className="nav glass bottom" aria-label="Навигация">
      {ITEMS.slice(0, 2).map(item)}
      <button
        className="nav-plus"
        aria-label="Добавить оценку"
        onClick={() => {
          haptic.tap();
          onAdd();
        }}
      >
        <Plus size={30} strokeWidth={2.6} />
      </button>
      {ITEMS.slice(2).map(item)}
    </nav>
  );
}
