import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTelegram } from './lib/telegram';
import { resolveTheme } from './lib/theme';
import { StoreProvider } from './state/store';
import './styles/global.css';

initTelegram();
document.documentElement.dataset.theme = resolveTheme('auto');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
