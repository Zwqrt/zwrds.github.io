#!/usr/bin/env python3
"""Примерные оценки для проверки интерфейса.

    python tools/seed.py                # создаст seed-backup.zip
    python tools/seed.py out.zip

Получившийся архив импортируется кнопкой «Импорт» в профиле (оба режима),
через `python tools/backup.py import seed-backup.zip ...` или `python -m app.cli seed` на сервере.
"""

import io
import json
import random
import sys
import uuid
import zipfile
from datetime import date, datetime, timedelta, timezone

SEMESTER_START = date(2026, 9, 1)

# id предметов из миграции; True — оценки ставят и лектор, и практик
SUBJECTS = {
    "00000000-0000-4000-8000-000000000001": ("История Казахстана", True, 78),
    "00000000-0000-4000-8000-000000000002": ("Казахский (Русский) язык", False, 85),
    "00000000-0000-4000-8000-000000000003": ("ИКТ", True, 88),
    "00000000-0000-4000-8000-000000000004": ("Иностранный язык", False, 82),
    "00000000-0000-4000-8000-000000000005": ("Физическая культура", False, 93),
    "00000000-0000-4000-8000-000000000006": ("Математика", True, 70),
}

KIND_SOURCE = {"lecture": "lecturer", "srop": "lecturer", "practice": "practitioner", "srsp": "practitioner"}


def build_data(until: date | None = None, rnd_seed: int = 42) -> dict:
    rnd = random.Random(rnd_seed)
    until = until or date.today()
    grades = []
    for sid, (_, both, base) in SUBJECTS.items():
        kinds = ["lecture", "practice", "srop", "srsp"] if both else ["practice", "srsp"]
        d = SEMESTER_START + timedelta(days=rnd.randint(0, 3))
        while d <= until:
            kind = rnd.choice(kinds)
            score = max(40, min(100, round(rnd.gauss(base, 9) / 5) * 5))
            ts = datetime(d.year, d.month, d.day, 10, tzinfo=timezone.utc).isoformat()
            grades.append(
                {
                    "id": str(uuid.UUID(int=rnd.getrandbits(128), version=4)),
                    "subject_id": sid,
                    "date": d.isoformat(),
                    "score": score,
                    "kind": kind,
                    "source": KIND_SOURCE[kind],
                    "note": None,
                    "photo_id": None,
                    "created_at": ts,
                    "updated_at": ts,
                }
            )
            d += timedelta(days=rnd.randint(3, 7))
    return {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "subjects": [],  # предметы уже есть после миграции
        "grades": grades,
        "photos": [],
        "settings": None,
    }


def build_zip(until: date | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("data.json", json.dumps(build_data(until), ensure_ascii=False, indent=2))
    return buf.getvalue()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "seed-backup.zip"
    with open(out, "wb") as f:
        f.write(build_zip())
    print(f"Готово: {out} ({len(build_data()['grades'])} оценок)")
