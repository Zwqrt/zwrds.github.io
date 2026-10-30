"""Смоук-тесты API:  cd server && python -m pytest -q  (или python tests/test_api.py)"""

import hashlib
import hmac
import io
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlencode

TMP = tempfile.mkdtemp()
os.environ.update(BOT_TOKEN="123:TEST", OWNER_ID="42", SECRET_KEY="s", DATA_DIR=TMP, FRONTEND_DIR=TMP + "/nofront")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.security import verify_init_data  # noqa: E402


def init_data(user_id: int, token: str = "123:TEST", age: int = 0) -> str:
    fields = {"auth_date": str(int(time.time()) - age), "query_id": "AAA", "user": json.dumps({"id": user_id, "first_name": "Т"})}
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100


def test_verify():
    assert verify_init_data(init_data(42), "123:TEST")["id"] == 42
    assert verify_init_data(init_data(42, token="999:OTHER"), "123:TEST") is None
    assert verify_init_data(init_data(42, age=10**6), "123:TEST") is None
    assert verify_init_data(init_data(42).replace("first_name", "first_nam"), "123:TEST") is None


def test_flow():
    with TestClient(app) as c:
        assert c.get("/api/grades").status_code == 401
        assert c.post("/api/auth", json={"initData": "x=1&hash=bad"}).status_code == 401
        assert c.post("/api/auth", json={"initData": init_data(7)}).status_code == 403
        tok = c.post("/api/auth", json={"initData": init_data(42)}).json()["token"]
        h = {"Authorization": f"Bearer {tok}"}

        subs = c.get("/api/subjects", headers=h).json()
        assert len(subs) == 6 and subs[2]["short_name"] == "ИКТ" and subs[0]["hidden"] is False
        sid = subs[5]["id"]

        g = {"subject_id": sid, "date": "2026-10-30", "score": 85, "kind": "practice", "source": "practitioner", "note": None, "photo_id": None}
        assert c.put("/api/grades/g1", json=g, headers=h).status_code == 204
        assert c.put("/api/grades/g2", json={**g, "score": 120}, headers=h).status_code == 422
        assert c.put("/api/grades/g3", json={**g, "kind": "bad"}, headers=h).status_code == 422
        grades = c.get("/api/grades", headers=h).json()
        assert grades[0]["score"] == 85 and grades[0]["created_at"]

        meta = {"id": "p1", "subject_id": sid, "kind": None, "date": "2026-10-30", "path": "p1.jpg", "width": 10, "height": 10, "size": 0, "note": None}
        r = c.put("/api/photos/p1", data={"meta": json.dumps(meta)}, files={"file": ("p1.jpg", JPEG, "image/jpeg")}, headers=h)
        assert r.status_code == 204, r.text
        urls = c.post("/api/photos/urls", json={"ids": ["p1"]}, headers=h).json()
        assert c.get(urls["p1"]).content == JPEG
        assert c.get(urls["p1"].replace("sig=", "sig=x")).status_code == 403
        assert c.put("/api/grades/g1", json={**g, "photo_id": "p1"}, headers=h).status_code == 204

        s = c.get("/api/settings", headers=h).json()
        assert s["rk1"] == {"from": 1, "to": 7}
        assert c.put("/api/settings", json={**s, "theme": "night"}, headers=h).status_code == 204
        assert c.get("/api/usage", headers=h).json()["storage_bytes"] == len(JPEG)

        z = c.get("/api/backup", headers=h).content
        assert c.delete("/api/photos/p1", headers=h).status_code == 204
        assert c.get("/api/grades", headers=h).json()[0]["photo_id"] is None
        assert c.delete("/api/grades/g1", headers=h).status_code == 204
        r = c.post("/api/backup", files={"file": ("backup.zip", io.BytesIO(z), "application/zip")}, headers=h).json()
        assert r == {"subjects": 6, "grades": 1, "photos": 1}
        assert c.get("/api/grades", headers=h).json()[0]["photo_id"] == "p1"
        assert c.get("/api/settings", headers=h).json()["theme"] == "night"


if __name__ == "__main__":
    test_verify()
    test_flow()
    print("OK")
