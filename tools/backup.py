#!/usr/bin/env python3
"""Экспорт/импорт backup.zip (data.json + photos/) для обоих режимов. Только стандартная библиотека.

Supabase (ключ service role берётся из Project Settings → API, хранить только у себя):
    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=...
    python tools/backup.py export backup.zip --backend supabase
    python tools/backup.py import backup.zip --backend supabase

Свой сервер (прямо с папкой данных, сервер можно не останавливать):
    python tools/backup.py export backup.zip --backend server --data-dir ./data
    python tools/backup.py import backup.zip --backend server --data-dir ./data [--replace]
"""

import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLES = [("subjects", "sort"), ("photos", "date"), ("grades", "date")]


class Supabase:
    def __init__(self, url: str, key: str):
        if not url or not key:
            sys.exit("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (переменные окружения или --url/--key)")
        self.url = url.rstrip("/")
        self.key = key

    def _headers(self, extra: dict | None = None) -> dict:
        h = {"apikey": self.key}
        if self.key.startswith("eyJ"):  # старый JWT-ключ; новые sb_secret_ идут только в apikey
            h["Authorization"] = f"Bearer {self.key}"
        h.update(extra or {})
        return h

    def _req(self, method: str, path: str, body: bytes | None = None, headers: dict | None = None) -> bytes:
        req = urllib.request.Request(f"{self.url}{path}", data=body, method=method, headers=self._headers(headers))
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path}: {e.code} {e.read().decode(errors='replace')}")

    def select(self, table: str, order: str) -> list[dict]:
        return json.loads(self._req("GET", f"/rest/v1/{table}?select=*&order={order}"))

    def upsert(self, table: str, rows: list[dict], on: str = "id") -> None:
        if not rows:
            return
        self._req(
            "POST",
            f"/rest/v1/{table}?on_conflict={on}",
            json.dumps(rows).encode(),
            {"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def delete_all(self, table: str, col: str = "id") -> None:
        self._req("DELETE", f"/rest/v1/{table}?{col}=not.is.null")

    def download(self, path: str) -> bytes:
        return self._req("GET", f"/storage/v1/object/photos/{urllib.parse.quote(path)}")

    def upload(self, path: str, data: bytes) -> None:
        self._req(
            "POST",
            f"/storage/v1/object/photos/{urllib.parse.quote(path)}",
            data,
            {"Content-Type": "image/jpeg", "x-upsert": "true"},
        )


def supabase_export(sb: Supabase) -> bytes:
    data = {"version": 1, "exported_at": datetime.now(timezone.utc).isoformat()}
    for t, order in TABLES:
        data[t] = sb.select(t, order)
    s = sb.select("settings", "key")
    data["settings"] = next((r["value"] for r in s if r["key"] == "app"), None)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2))
        for p in data["photos"]:
            z.writestr(f"photos/{p['id']}.jpg", sb.download(p["path"]), compress_type=zipfile.ZIP_STORED)
            print(f"  фото {p['id']}")
    return buf.getvalue()


def supabase_import(sb: Supabase, raw: bytes, replace: bool) -> dict:
    files: dict[str, bytes] = {}
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            files = {n: z.read(n) for n in z.namelist()}
        data = json.loads(files["data.json"])
    else:
        data = json.loads(raw)
    if replace:
        for t in ("grades", "photos", "subjects"):
            sb.delete_all(t)
    if data.get("settings"):
        sb.upsert("settings", [{"key": "app", "value": data["settings"]}], on="key")
    sb.upsert("subjects", data["subjects"])
    photos = []
    for p in data.get("photos") or []:
        f = files.get(f"photos/{p['id']}.jpg")
        if f is None:
            continue
        p = {**p, "path": f"{p['id']}.jpg", "size": len(f)}
        sb.upload(p["path"], f)
        photos.append(p)
    sb.upsert("photos", photos)
    known = {p["id"] for p in photos}
    grades = [{**g, "photo_id": g.get("photo_id") if g.get("photo_id") in known else None} for g in data["grades"]]
    for i in range(0, len(grades), 500):
        sb.upsert("grades", grades[i : i + 500])
    return {"subjects": len(data["subjects"]), "grades": len(grades), "photos": len(photos)}


def server_backup(data_dir: str):
    os.environ["DATA_DIR"] = str(Path(data_dir).resolve())
    sys.path.insert(0, str(ROOT / "server"))
    from app import backup, db  # noqa: E402

    db.init()
    return backup


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["export", "import"])
    ap.add_argument("file", nargs="?", default="backup.zip")
    ap.add_argument("--backend", choices=["supabase", "server"], default=os.environ.get("BACKEND", "supabase"))
    ap.add_argument("--url", default=os.environ.get("SUPABASE_URL", ""))
    ap.add_argument("--key", default=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    ap.add_argument("--data-dir", default=os.environ.get("DATA_DIR", "./data"))
    ap.add_argument("--replace", action="store_true", help="перед импортом удалить текущие данные")
    a = ap.parse_args()

    if a.backend == "supabase":
        sb = Supabase(a.url, a.key)
        if a.cmd == "export":
            Path(a.file).write_bytes(supabase_export(sb))
            print(f"Готово: {a.file}")
        else:
            r = supabase_import(sb, Path(a.file).read_bytes(), a.replace)
            print(f"Импортировано: {r}")
    else:
        backup = server_backup(a.data_dir)
        if a.cmd == "export":
            Path(a.file).write_bytes(backup.export_zip())
            print(f"Готово: {a.file}")
        else:
            print(f"Импортировано: {backup.import_file(Path(a.file), replace=a.replace)}")


if __name__ == "__main__":
    main()
