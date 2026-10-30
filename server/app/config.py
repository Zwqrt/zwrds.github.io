import os
from pathlib import Path


def _load_dotenv() -> None:
    """Простой загрузчик .env рядом с server/ (без зависимостей)."""
    p = Path(__file__).resolve().parent.parent / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
OWNER_ID = os.environ.get("OWNER_ID", "").strip()
SECRET_KEY = os.environ.get("SECRET_KEY", "") or ("k:" + BOT_TOKEN)
DATA_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve()
DB_PATH = DATA_DIR / "kartu.db"
PHOTOS_DIR = DATA_DIR / "photos"
FRONTEND_DIR = Path(os.environ.get("FRONTEND_DIR", "../frontend/dist")).resolve()
INIT_DATA_MAX_AGE = int(os.environ.get("INIT_DATA_MAX_AGE", str(24 * 3600)))
TOKEN_TTL = int(os.environ.get("TOKEN_TTL", str(7 * 24 * 3600)))
FILE_URL_TTL = 3600
MAX_PHOTO_BYTES = 5 * 1024 * 1024
