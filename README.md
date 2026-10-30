# Оценки КарТУ — Telegram Mini App

Личное приложение для учёта текущих оценок в КарТУ им. Сагинова: РК1/РК2, рейтинг допуска,
сколько нужно на экзамене, фото с пар. Доступ только у владельца (по Telegram ID).

Работает в двух режимах с **одинаковой схемой данных**:

| Режим | Где | Стоимость |
|---|---|---|
| `supabase` (сейчас) | фронтенд на Vercel + Supabase (Postgres, Storage, Edge Function) + бот на Altyn.Games | бесплатно |
| `server` (потом) | свой VPS: Caddy (HTTPS) + FastAPI/SQLite + бот в docker compose | цена VPS |

Переезд между режимами — один файл `backup.zip` (данные + фото).

## Структура

```
frontend/   React + TypeScript + Vite, чистый CSS, lucide-react
  src/lib/grading.ts        все расчёты (+ grading.test.ts, Vitest)
  src/data/                 интерфейс DataProvider и реализации:
                            supabaseProvider.ts, serverProvider.ts, demoProvider.ts
  src/state/store.tsx       состояние, офлайн-очередь (IndexedDB)
  src/screens/              Главная, Предмет, Расчёт, Фото, Профиль
  public/bg-day.jpg         фон (фото корпуса)
supabase/
  migrations/               таблицы, RLS, приватный bucket, политики Storage, usage_stats()
  functions/verify-telegram Edge Function: проверка initData → сессия Supabase
server/     FastAPI + SQLite (режим VPS): тот же API-набор, фото в data/photos
bot/        main.py (aiogram 3) + requirements.txt — один код для Altyn и VPS
deploy/     docker-compose.yml, Caddyfile, Dockerfile'ы, ежедневный бэкап
tools/      backup.py (экспорт/импорт backup.zip в обоих режимах), seed.py (примерные оценки)
```

Компоненты не знают, какой бэкенд используется: бэкенд выбирает переменная `VITE_BACKEND`
(`supabase` | `server` | `demo`) в `frontend/src/data/index.ts`.

> **Фон.** В репозитории лежит временная заглушка `frontend/public/bg-day.jpg`.
> Замените её своим фото корпуса с тем же именем (лучше вертикальное, ~1080×1920, JPEG до 400 КБ).
> Ночная тема использует то же фото с затемнением, отдельный файл не нужен.

---

## Как считается

- РК1 — недели 1–7, РК2 — недели 8–15 от даты начала семестра (всё меняется в профиле).
- Текущий РК — среднее оценок за период. Если в профиле заданы разные веса видов работ,
  каждая оценка весит столько, сколько её вид (при равных весах — обычное среднее).
- Официальный РК с портала (тап по плитке РК на экране предмета) важнее расчётного.
- Рейтинг допуска = (РК1 + РК2) / 2, допуск при ≥ 50.
- Итог = 0,6 × РД + 0,4 × экзамен, экзамен минимум 50.
- Нужно на экзамене = ceil((цель − 0,6 × РД) / 0,4): > 100 — «не хватит», < 50 — «50 (минимум)».
- Буква ставится по баллу без округления (89,6 — это B+).

Тесты: `cd frontend && npm test`.

---

## Часть 1. Бесплатный запуск (Supabase + Vercel + Altyn.Games)

Вам понадобятся: аккаунты GitHub, [Supabase](https://supabase.com), [Vercel](https://vercel.com),
хостинг бота на Altyn.Games, Node.js 20+ на компьютере (для Supabase CLI).

### 1. Бот в @BotFather и ваш Telegram ID

1. В [@BotFather](https://t.me/BotFather): `/newbot` → имя → username. Сохраните **BOT_TOKEN**.
2. Узнайте свой ID в [@userinfobot](https://t.me/userinfobot) — это **OWNER_ID** (число).

### 2. Проект Supabase

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. Регион ближе
   к Казахстану — например, Frankfurt (eu-central-1). Пароль базы сохраните.
2. **Project Settings → API**: скопируйте **Project URL** и **anon / publishable key** — они
   публичные, пойдут во фронтенд. **service_role / secret key** никому не показывайте
   и не кладите во фронтенд или в git.
3. **Authentication → Sign In / Providers**: выключите **Allow new users to sign up**.
   Единственного пользователя создаёт Edge Function через admin API, ей это не мешает.

### 3. SQL-миграции

**Вариант А — Supabase CLI (рекомендуется):**

```bash
npx supabase login
npx supabase link --project-ref <ref из URL проекта>
npx supabase db push            # применит supabase/migrations/*.sql
```

**Вариант Б — без CLI:** Dashboard → **SQL Editor** → вставьте содержимое
`supabase/migrations/20260901000000_init.sql` → **Run**.

Миграция создаёт таблицы `subjects`, `grades`, `photos`, `settings`, включает RLS
(доступ только при `app_metadata.tg_owner = true` в JWT), создаёт **приватный** bucket `photos`
с такими же политиками и добавляет 6 предметов 1 академического периода.

### 4. Edge Function `verify-telegram` и её секреты

```bash
cp supabase/.env.example supabase/.env     # впишите BOT_TOKEN и OWNER_ID
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy verify-telegram --no-verify-jwt
```

`--no-verify-jwt` обязателен: функцию вызывают ещё без JWT, она сама проверяет подпись Telegram.
`SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет в функцию сам.

Без CLI: Dashboard → **Edge Functions → Deploy a new function → Via Editor**, имя `verify-telegram`,
вставьте `supabase/functions/verify-telegram/index.ts`, в настройках функции выключите **Verify JWT**.
Секреты — **Edge Functions → Secrets**: `BOT_TOKEN`, `OWNER_ID`.

Как работает вход: мини-апп отправляет `initData` → функция проверяет HMAC-SHA256 по `BOT_TOKEN`
(и что данные не старше суток), сверяет `user.id` с `OWNER_ID`, создаёт или находит
пользователя-владельца и возвращает его сессию (access JWT + refresh). Без валидного `initData`
сессии нет, а без сессии RLS ничего не отдаёт.

### 5. Фронтенд на Vercel

1. Запушьте репозиторий на GitHub.
2. Vercel → **Add New → Project** → импортируйте репозиторий.
3. **Root Directory**: `frontend`. Framework Preset: **Vite** (build `npm run build`, output `dist`).
4. **Environment Variables**:

   | Переменная | Значение |
   |---|---|
   | `VITE_BACKEND` | `supabase` |
   | `VITE_SUPABASE_URL` | Project URL из шага 2 |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key из шага 2 |

5. **Deploy**. Получите адрес вида `https://kartu-grades.vercel.app` — это **WEBAPP_URL**.

### 6. Бот на Altyn.Games (Pterodactyl)

1. В панели создайте сервер с Python (egg Python / aiogram), версия Python 3.10+.
2. **Files**: загрузите `bot/main.py` и `bot/requirements.txt` (через файловый менеджер
   или по SFTP — данные SFTP во вкладке **Settings**).
3. **Startup**: файл запуска — `main.py`, файл зависимостей — `requirements.txt`
   (панель сама выполнит `pip install -r requirements.txt` при старте).
4. Переменные: если во вкладке **Startup** есть поля для переменных — впишите туда.
   Если нет, создайте в **Files** файл `.env` рядом с `main.py`:

   ```
   BOT_TOKEN=123456:ABC...
   WEBAPP_URL=https://kartu-grades.vercel.app
   OWNER_ID=123456789
   # необязательно — ежедневный запрос, чтобы Supabase реже засыпал:
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=...
   ```

5. **Start**. В консоли должно появиться `Бот @... запущен`. Бот работает через long polling:
   открытые порты, root и systemd не нужны.

Бот отвечает на `/start` кнопкой «Открыть оценки» и сам ставит кнопку меню «Оценки».

### 7. Мини-апп в @BotFather

1. `/newapp` → выберите бота → название «Оценки КарТУ», описание, картинка 640×360 →
   **Web App URL** = ваш WEBAPP_URL → короткое имя (например, `grades`).
   Получится ссылка `t.me/<бот>/grades`.
2. Кнопка меню (если хотите задать вручную): `/mybots` → бот → **Bot Settings → Menu Button** →
   URL = WEBAPP_URL, текст «Оценки».

Откройте бота → «Открыть оценки». Если открыть адрес Vercel в обычном браузере, приложение
покажет «Откройте через Telegram» — так и должно быть.

### 8. Примерные оценки (seed)

```bash
python tools/seed.py            # создаст seed-backup.zip (~75 оценок с 1 сентября)
```

Затем **Профиль → Импорт** и выберите файл. Или с компьютера:
`python tools/backup.py import seed-backup.zip --backend supabase` (нужны `SUPABASE_URL` и
`SUPABASE_SERVICE_ROLE_KEY` в переменных окружения).

### Лимиты бесплатного Supabase

- База 500 МБ, хранилище файлов 1 ГБ. Сколько занято, видно в **Профиль → Место**.
- Фото сжимаются на телефоне до 1600 px по длинной стороне (JPEG 80%), это ~200–400 КБ.
  Получается примерно 3000+ фото на 1 ГБ.
- **Проект засыпает после 7 дней без активности.** Признак: приложение пишет «Нет связи», а в
  Dashboard проект в статусе *Paused*. Что делать: [supabase.com/dashboard](https://supabase.com/dashboard) →
  проект → **Restore project**, через 1–3 минуты всё снова работает, данные не теряются.
  Чтобы засыпал реже, задайте боту `SUPABASE_URL` и `SUPABASE_ANON_KEY` (см. шаг 6).
  Если проект простоял на паузе очень долго (90+ дней), Restore может стать недоступен,
  поэтому периодически делайте backup.zip.

---

## Часть 2. Переезд на VPS

Нужен VPS с Docker (Ubuntu 22.04+, 1 ГБ RAM достаточно) и домен с A-записью на IP сервера.

1. **Сделайте бэкап**: **Профиль → Бэкап: backup.zip** (или
   `python tools/backup.py export backup.zip --backend supabase`).
2. **Скопируйте папку проекта** на VPS (`git clone` или `scp -r`).
3. **Заполните `.env`:**

   ```bash
   cd deploy
   cp .env.example .env
   nano .env
   ```

   | Переменная | Что вписать |
   |---|---|
   | `BACKEND` | `server` |
   | `DOMAIN` | ваш домен, например `grades.example.kz` |
   | `ACME_EMAIL` | почта для Let's Encrypt |
   | `BOT_TOKEN` | токен бота |
   | `OWNER_ID` | ваш Telegram ID |
   | `SECRET_KEY` | `openssl rand -hex 32` |

4. **Запуск:** `docker compose up -d --build`.
   Поднимутся `caddy` (HTTPS-сертификат получит сам), `server` (FastAPI отдаёт API и собранный
   с `VITE_BACKEND=server` фронтенд), `bot`, `backup` (ежедневно в 03:30 по Алматы архивирует
   `./data` в `./backups`, хранит 14 дней).
5. **Импортируйте backup.zip:** откройте мини-апп по новому адресу → **Профиль → Импорт**, или на сервере:

   ```bash
   docker compose cp ../backup.zip server:/tmp/backup.zip
   docker compose exec server python -m app.cli import /tmp/backup.zip
   ```

6. **Поменяйте адрес мини-аппа:** @BotFather → `/myapps` → приложение → **Edit Web App URL** →
   `https://<DOMAIN>`. Кнопку меню бот обновит сам при старте (берёт `https://${DOMAIN}`).
7. Бота на Altyn.Games остановите, иначе два экземпляра будут конфликтовать за обновления.

Все данные на VPS — это папка `deploy/data` (`kartu.db` + `photos/`). Бэкап — просто её копия.
Восстановление из ежедневного архива:
`docker compose stop server && tar -xzf backups/data-ГГГГ-ММ-ДД.tar.gz -C data && docker compose start server`.

CLI на сервере:

```bash
docker compose exec server python -m app.cli export /data/backup.zip
docker compose exec server python -m app.cli import /data/backup.zip [--replace]
docker compose exec server python -m app.cli seed
```

---

## Разработка

```bash
cd frontend
npm install
npm test                         # Vitest: расчёты, контраст, склонение
VITE_BACKEND=demo npm run dev    # интерфейс без Telegram, данные в IndexedDB браузера
npm run build
```

В dev-режиме утилита `src/lib/contrast.ts` проверяет пары цветов текущей темы (с учётом
плотности стекла и яркости фона) и пишет предупреждения в консоль, если контраст ниже WCAG AA.

Сервер локально:

```bash
cd server
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # BOT_TOKEN, OWNER_ID, SECRET_KEY
uvicorn app.main:app --reload     # фронтенд: VITE_BACKEND=server npm run dev (прокси /api → :8000)
python tests/test_api.py          # смоук-тесты API
```

## Безопасность

- `BOT_TOKEN`, service role key, `SECRET_KEY` хранятся только в секретах Edge Function,
  в переменных окружения хостинга и в `deploy/.env`. Все `.env` в `.gitignore`, в репозитории
  только `.env.example` с пустыми значениями.
- Во фронтенде только публичные URL и anon key: без JWT владельца RLS ничего не отдаёт.
- Фото лежат в приватном bucket, показываются по signed URL на 1 час (на VPS — по подписанной ссылке).
