import os
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)
import asyncio

logging.basicConfig(level=logging.INFO)

BOT_TOKEN = os.getenv("BOT_TOKEN")
# URL твоей игры на GitHub Pages (заменить на свой!)
GAME_URL = os.getenv("GAME_URL", "https://USERNAME.github.io/telegram-bot/game/")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Играть!",
                    web_app=WebAppInfo(url=GAME_URL),
                )
            ]
        ]
    )
    await message.answer(
        "⭐ *STAR WARS — Space Shooter* ⭐\n\n"
        "Управляй кораблём и уничтожай врагов!\n\n"
        "🎮 Нажми кнопку чтобы начать:",
        reply_markup=keyboard,
        parse_mode="Markdown",
    )


@dp.message(Command("help"))
async def cmd_help(message: types.Message):
    await message.answer(
        "🎮 *Как играть:*\n\n"
        "📱 *На телефоне:* касание — движение, авто-стрельба\n"
        "💻 *На ПК:* стрелки/WASD — движение, пробел — стрельба\n\n"
        "👾 *Типы врагов:*\n"
        "🔴 Истребитель — быстрый, 1 HP\n"
        "🟠 Бомбер — медленный, 3 HP\n"
        "🟣 Скоростной — очень быстрый, 1 HP\n\n"
        "💚 Зелёный бонус — +1 жизнь\n"
        "💛 Жёлтый бонус — +50 очков\n\n"
        "/start — начать игру",
        parse_mode="Markdown",
    )


@dp.message()
async def on_web_app_data(message: types.Message):
    if message.web_app_data:
        import json
        data = json.loads(message.web_app_data.data)
        score = data.get("score", 0)
        wave = data.get("wave", 1)
        await message.answer(
            f"🏆 *Результат:*\n\n"
            f"Очки: *{score}*\n"
            f"Волна: *{wave}*\n\n"
            f"Попробуй побить свой рекорд! /start",
            parse_mode="Markdown",
        )


async def main():
    logging.info("Бот запущен!")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
