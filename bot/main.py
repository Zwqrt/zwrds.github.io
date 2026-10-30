"""Бот «Оценки КарТУ» (aiogram 3). Один файл — одинаково на Altyn.Games и на VPS.

Переменные окружения (или файл .env рядом): BOT_TOKEN, WEBAPP_URL, OWNER_ID.
Необязательно: SUPABASE_URL и SUPABASE_ANON_KEY — раз в сутки бот делает запрос к API,
чтобы бесплатный проект Supabase реже засыпал (засыпает после 7 дней без активности).
Запуск: python main.py  (long polling, без вебхуков — не нужен открытый порт).
"""

import asyncio
import logging
import os
import sys

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip()
OWNER_ID = os.getenv("OWNER_ID", "").strip()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", stream=sys.stdout)
log = logging.getLogger("kartu-bot")

dp = Dispatcher()


def is_owner(message: Message) -> bool:
    return not OWNER_ID or (message.from_user is not None and str(message.from_user.id) == OWNER_ID)


def open_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Открыть оценки", web_app=WebAppInfo(url=WEBAPP_URL))]]
    )


@dp.message(CommandStart())
async def start(message: Message) -> None:
    if not is_owner(message):
        await message.answer("Это личное приложение для учёта оценок. Доступ есть только у владельца.")
        return
    await message.answer(
        "Оценки КарТУ — текущие оценки, РК1/РК2, рейтинг допуска и сколько нужно на экзамене.\n\n"
        "Нажмите кнопку ниже или «Оценки» рядом с полем ввода.",
        reply_markup=open_keyboard(),
    )


@dp.message(F.text)
async def any_text(message: Message) -> None:
    if is_owner(message):
        await message.answer("Откройте приложение:", reply_markup=open_keyboard())


async def keep_supabase_awake() -> None:
    """Раз в сутки — лёгкий запрос к REST API Supabase (RLS всё равно вернёт пустой список)."""
    import aiohttp  # ставится вместе с aiogram

    headers = {"apikey": SUPABASE_ANON_KEY}
    if SUPABASE_ANON_KEY.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {SUPABASE_ANON_KEY}"
    while True:
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"{SUPABASE_URL}/rest/v1/subjects?select=id&limit=1", headers=headers, timeout=30) as r:
                    log.info("Supabase keep-alive: HTTP %s", r.status)
        except Exception as e:  # сеть, DNS — попробуем завтра
            log.warning("Supabase keep-alive не удался: %s", e)
        await asyncio.sleep(24 * 3600)


async def main() -> None:
    if not BOT_TOKEN or not WEBAPP_URL:
        log.error("Задайте BOT_TOKEN и WEBAPP_URL (переменные окружения или файл .env)")
        sys.exit(1)
    if not WEBAPP_URL.startswith("https://"):
        log.error("WEBAPP_URL должен начинаться с https:// — Telegram не откроет http")
        sys.exit(1)
    bot = Bot(BOT_TOKEN)
    # Кнопка меню рядом с полем ввода открывает мини-апп
    await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Оценки", web_app=WebAppInfo(url=WEBAPP_URL)))
    me = await bot.get_me()
    log.info("Бот @%s запущен, мини-апп: %s", me.username, WEBAPP_URL)
    await bot.delete_webhook(drop_pending_updates=True)
    if SUPABASE_URL and SUPABASE_ANON_KEY:
        keep_alive = asyncio.create_task(keep_supabase_awake())  # noqa: F841 — держим ссылку на задачу
    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
