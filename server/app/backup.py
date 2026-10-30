"""backup.zip = data.json + photos/<id>.jpg — общий формат с фронтендом и Supabase."""

import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from . import config, db


def collect() -> dict:
    with db.tx() as con:
        subjects = [db.row("subjects", r) for r in con.execute("select * from subjects order by sort")]
        grades = [db.row("grades", r) for r in con.execute("select * from grades order by date, created_at")]
        photos = [db.row("photos", r) for r in con.execute("select * from photos order by date desc")]
        settings = db.get_settings(con)
    return {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "subjects": subjects,
        "grades": grades,
        "photos": photos,
        "settings": settings,
    }


def export_zip() -> bytes:
    data = collect()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2))
        for p in data["photos"]:
            f = config.PHOTOS_DIR / f"{p['id']}.jpg"
            if f.exists():
                z.write(f, f"photos/{p['id']}.jpg", compress_type=zipfile.ZIP_STORED)
    return buf.getvalue()


def import_bytes(raw: bytes, replace: bool = False) -> dict:
    """Импорт backup.zip или data.json. По умолчанию объединяет (upsert по id)."""
    files: dict[str, bytes] = {}
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            for name in z.namelist():
                if name == "data.json" or (name.startswith("photos/") and name.endswith(".jpg")):
                    files[name] = z.read(name)
        if "data.json" not in files:
            raise ValueError("В архиве нет data.json")
        data = json.loads(files["data.json"])
    else:
        data = json.loads(raw)
    if not isinstance(data.get("subjects"), list) or not isinstance(data.get("grades"), list):
        raise ValueError("Неверный формат")

    config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    photos = [p for p in data.get("photos") or [] if f"photos/{p['id']}.jpg" in files]
    with db.tx() as con:
        if replace:
            for t in ("grades", "photos", "subjects", "settings"):
                con.execute(f"delete from {t}")
        if data.get("settings"):
            db.save_settings(con, data["settings"])
        for s in data["subjects"]:
            db.upsert(con, "subjects", s)
        for p in photos:
            name = f"{p['id']}.jpg"
            (config.PHOTOS_DIR / name).write_bytes(files[f"photos/{name}"])
            db.upsert(con, "photos", {**p, "path": name, "size": len(files[f"photos/{name}"])})
        known = {p["id"] for p in photos} | {r["id"] for r in con.execute("select id from photos")}
        for g in data["grades"]:
            db.upsert(con, "grades", {**g, "photo_id": g.get("photo_id") if g.get("photo_id") in known else None})
    return {"subjects": len(data["subjects"]), "grades": len(data["grades"]), "photos": len(photos)}


def import_file(path: Path, replace: bool = False) -> dict:
    return import_bytes(path.read_bytes(), replace=replace)
