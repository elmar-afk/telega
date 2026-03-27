import os
import logging
import tempfile
import asyncio
import subprocess
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
    FSInputFile,
)
from aiohttp import web

logging.basicConfig(level=logging.INFO)

BOT_TOKEN = os.getenv("BOT_TOKEN")
GAME_URL = os.getenv("GAME_URL", "https://elmar-afk.github.io/telega/game/")
TARGET_CHAT_ID = 1320445115  # @Elmar95
API_PORT = int(os.getenv("API_PORT", "8080"))

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# === TELEGRAM BOT HANDLERS ===

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    logging.info(f"USER: @{message.from_user.username} | chat_id: {message.chat.id}")
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


# === WEB SERVER: приём видео из игры ===

async def handle_upload_video(request):
    """Принимает webm видео, конвертирует в mp4, отправляет в Telegram."""
    try:
        reader = await request.multipart()
        video_data = None
        chat_id = TARGET_CHAT_ID

        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == 'video':
                video_data = await part.read()
            elif part.name == 'chat_id':
                chat_id = int(await part.text())

        if not video_data:
            return web.json_response({'ok': False, 'error': 'no video'}, status=400)

        # Сохраняем webm во временный файл
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
            f.write(video_data)
            webm_path = f.name

        mp4_path = webm_path.replace('.webm', '.mp4')

        # Конвертируем webm -> mp4 через ffmpeg
        proc = await asyncio.create_subprocess_exec(
            os.path.join(os.path.dirname(__file__), 'ffmpeg'), '-y', '-i', webm_path,
            '-c:v', 'libx264', '-preset', 'ultrafast',
            '-crf', '28', '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            '-an',  # без аудио для скорости
            mp4_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

        if proc.returncode == 0 and os.path.exists(mp4_path):
            video_file = FSInputFile(mp4_path)
            await bot.send_video(
                chat_id=chat_id,
                video=video_file,
                caption='🎮 Видео из Star Wars Space Shooter!',
            )
            logging.info(f"Видео отправлено в chat_id={chat_id}")
        else:
            # Если ffmpeg не сработал — отправляем webm как документ
            doc_file = FSInputFile(webm_path)
            await bot.send_document(
                chat_id=chat_id,
                document=doc_file,
                caption='🎮 Видео из Star Wars Space Shooter!',
            )
            logging.warning("ffmpeg не сработал, отправлен webm")

        # Очистка
        try:
            os.unlink(webm_path)
        except OSError:
            pass
        try:
            os.unlink(mp4_path)
        except OSError:
            pass

        return web.json_response({'ok': True})

    except Exception as e:
        logging.error(f"Ошибка upload_video: {e}")
        return web.json_response({'ok': False, 'error': str(e)}, status=500)


async def handle_cors(request):
    """Обработка CORS preflight."""
    return web.Response(headers={
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    })


@web.middleware
async def cors_middleware(request, handler):
    if request.method == 'OPTIONS':
        return await handle_cors(request)
    response = await handler(request)
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response


async def main():
    # Запуск веб-сервера
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_post('/upload-video', handle_upload_video)
    app.router.add_route('OPTIONS', '/upload-video', handle_cors)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', API_PORT)
    await site.start()
    logging.info(f"API сервер запущен на порту {API_PORT}")

    # Запуск бота
    logging.info("Бот запущен!")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
