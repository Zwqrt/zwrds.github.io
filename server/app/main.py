"""FastAPI-бэкенд для режима VPS: REST API + раздача собранного фронтенда."""

import json
import shutil
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import backup, config, db, security

@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    if not config.BOT_TOKEN or not config.OWNER_ID:
        print("ВНИМАНИЕ: BOT_TOKEN или OWNER_ID не заданы — вход невозможен")
    yield


app = FastAPI(title="Оценки КарТУ", docs_url=None, redoc_url=None, lifespan=lifespan)


def owner(authorization: str = Header(default="")) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    sub = security.check_token(token) if token else None
    if not sub or sub != config.OWNER_ID:
        raise HTTPException(401, "Нужна авторизация через Telegram")
    return sub


class AuthIn(BaseModel):
    initData: str


@app.post("/api/auth")
def auth(body: AuthIn) -> dict:
    if not config.BOT_TOKEN or not config.OWNER_ID:
        raise HTTPException(500, "Сервер не настроен: BOT_TOKEN / OWNER_ID")
    user = security.verify_init_data(body.initData, config.BOT_TOKEN)
    if not user:
        raise HTTPException(401, "Подпись Telegram не прошла проверку или устарела")
    if str(user["id"]) != config.OWNER_ID:
        raise HTTPException(403, "Приложение личное: доступ только у владельца")
    return {"token": security.make_token(str(user["id"]))}


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# ---------- предметы ----------
@app.get("/api/subjects", dependencies=[Depends(owner)])
def list_subjects() -> list[dict]:
    return db.list_rows("subjects", "sort, created_at")


@app.put("/api/subjects/{sid}", status_code=204, dependencies=[Depends(owner)])
def put_subject(sid: str, body: dict[str, Any]) -> Response:
    if not str(body.get("name", "")).strip():
        raise HTTPException(422, "Пустое название")
    with db.tx() as con:
        db.upsert(con, "subjects", {**body, "id": sid})
    return Response(status_code=204)


# ---------- оценки ----------
@app.get("/api/grades", dependencies=[Depends(owner)])
def list_grades() -> list[dict]:
    return db.list_rows("grades", "date, created_at")


@app.put("/api/grades/{gid}", status_code=204, dependencies=[Depends(owner)])
def put_grade(gid: str, body: dict[str, Any]) -> Response:
    try:
        score = float(body["score"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(422, "Нужен балл")
    if not 0 <= score <= 100:
        raise HTTPException(422, "Балл 0–100")
    try:
        with db.tx() as con:
            db.upsert(con, "grades", {**body, "id": gid, "score": score})
    except Exception as e:  # sqlite3.IntegrityError и т.п.
        raise HTTPException(422, f"Неверные данные: {e}")
    return Response(status_code=204)


@app.delete("/api/grades/{gid}", status_code=204, dependencies=[Depends(owner)])
def delete_grade(gid: str) -> Response:
    with db.tx() as con:
        con.execute("delete from grades where id = ?", (gid,))
    return Response(status_code=204)


# ---------- фото ----------
@app.get("/api/photos", dependencies=[Depends(owner)])
def list_photos() -> list[dict]:
    return db.list_rows("photos", "date desc, created_at desc")


@app.put("/api/photos/{pid}", status_code=204, dependencies=[Depends(owner)])
async def put_photo(pid: str, meta: str = Form(...), file: UploadFile = File(...)) -> Response:
    data = await file.read()
    if len(data) > config.MAX_PHOTO_BYTES:
        raise HTTPException(413, "Фото больше 5 МБ")
    if data[:3] != b"\xff\xd8\xff":
        raise HTTPException(415, "Ожидается JPEG")
    m = json.loads(meta)
    name = f"{pid}.jpg"
    config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    (config.PHOTOS_DIR / name).write_bytes(data)
    with db.tx() as con:
        db.upsert(con, "photos", {**m, "id": pid, "path": name, "size": len(data)})
    return Response(status_code=204)


@app.delete("/api/photos/{pid}", status_code=204, dependencies=[Depends(owner)])
def delete_photo(pid: str) -> Response:
    with db.tx() as con:
        con.execute("delete from photos where id = ?", (pid,))
    (config.PHOTOS_DIR / f"{pid}.jpg").unlink(missing_ok=True)
    return Response(status_code=204)


class UrlsIn(BaseModel):
    ids: list[str]


@app.post("/api/photos/urls", dependencies=[Depends(owner)])
def photo_urls(body: UrlsIn) -> dict[str, str]:
    """Аналог signed URL Supabase: ссылка с подписью и сроком жизни."""
    return {pid: security.signed_file_url(pid) for pid in body.ids}


@app.get("/api/photos/{pid}/file", dependencies=[Depends(owner)])
def photo_file(pid: str) -> FileResponse:
    f = config.PHOTOS_DIR / f"{pid}.jpg"
    if not f.exists():
        raise HTTPException(404, "Нет файла")
    return FileResponse(f, media_type="image/jpeg")


@app.get("/api/files/{pid}")
def signed_file(pid: str, exp: int, sig: str) -> FileResponse:
    if not security.check_file_sig(pid, exp, sig):
        raise HTTPException(403, "Ссылка устарела")
    f = config.PHOTOS_DIR / f"{pid}.jpg"
    if not f.exists():
        raise HTTPException(404, "Нет файла")
    return FileResponse(f, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


# ---------- настройки, место, бэкап ----------
@app.get("/api/settings", dependencies=[Depends(owner)])
def get_settings() -> Any:
    with db.tx() as con:
        return db.get_settings(con)


@app.put("/api/settings", status_code=204, dependencies=[Depends(owner)])
def put_settings(body: dict[str, Any]) -> Response:
    with db.tx() as con:
        db.save_settings(con, body)
    return Response(status_code=204)


@app.get("/api/usage", dependencies=[Depends(owner)])
def usage() -> dict:
    db_bytes = sum(p.stat().st_size for p in config.DATA_DIR.glob("kartu.db*") if p.is_file())
    storage = sum(p.stat().st_size for p in config.PHOTOS_DIR.glob("*.jpg"))
    disk = shutil.disk_usage(config.DATA_DIR)
    return {"db_bytes": db_bytes, "storage_bytes": storage, "db_limit": None, "storage_limit": disk.free + storage}


@app.get("/api/backup", dependencies=[Depends(owner)])
def get_backup() -> Response:
    return Response(
        backup.export_zip(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="backup.zip"'},
    )


@app.post("/api/backup", dependencies=[Depends(owner)])
async def post_backup(file: UploadFile = File(...)) -> dict:
    try:
        return backup.import_bytes(await file.read())
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.exception_handler(404)
async def spa_fallback(request: Request, exc: Exception) -> Response:
    """SPA: любые не-API пути отдают index.html собранного фронтенда."""
    index = config.FRONTEND_DIR / "index.html"
    if not request.url.path.startswith("/api") and index.exists():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    detail = getattr(exc, "detail", "Not found")
    return JSONResponse({"detail": detail}, status_code=404)


if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
