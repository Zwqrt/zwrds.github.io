import { Lock, RefreshCw, Send, ServerCrash } from 'lucide-react';
import { useStore } from '../state/store';
import { Spinner } from '../components/ui';

/** Экран загрузки и ошибок доступа: без валидного initData приложение не работает. */
export function Gate() {
  const { status, error, reload } = useStore();
  if (status === 'loading')
    return (
      <div className="glass card empty" style={{ marginTop: '30vh' }}>
        <Spinner />
        <div className="bold">Проверяю доступ…</div>
      </div>
    );
  const icon =
    error?.code === 'no-telegram' ? <Send size={26} /> : error?.code === 'forbidden' ? <Lock size={26} /> : <ServerCrash size={26} />;
  const title =
    error?.code === 'no-telegram'
      ? 'Откройте через Telegram'
      : error?.code === 'forbidden'
        ? 'Приложение личное'
        : error?.code === 'network'
          ? 'Нет связи'
          : error?.code === 'config'
            ? 'Не настроено'
            : 'Не удалось войти';
  const text =
    error?.code === 'no-telegram'
      ? 'Приложение работает только как Telegram Mini App — откройте его кнопкой в боте.'
      : error?.code === 'forbidden'
        ? 'Доступ есть только у владельца.'
        : error?.code === 'network'
          ? 'Сервер не отвечает. Если это Supabase — проект мог уснуть после недели без активности: зайдите в панель и нажмите Restore.'
          : error?.message ?? '';
  return (
    <div className="glass empty" style={{ marginTop: '22vh' }}>
      <div className="empty-icon">{icon}</div>
      <div className="h2">{title}</div>
      <div className="small muted">{text}</div>
      {error?.code !== 'forbidden' && error?.code !== 'no-telegram' && (
        <button className="btn primary" onClick={() => reload()}>
          <RefreshCw size={18} /> Повторить
        </button>
      )}
    </div>
  );
}
