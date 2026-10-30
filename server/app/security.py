"""Проверка Telegram initData (тот же алгоритм, что в Edge Function) и подписанные токены."""

import base64
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from . import config


def verify_init_data(init_data: str, bot_token: str, max_age: int = config.INIT_DATA_MAX_AGE) -> dict | None:
    """https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app"""
    if not init_data or not bot_token:
        return None
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received = pairs.pop("hash", None)
    if not received:
        return None
    check = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received):
        return None
    try:
        auth_date = int(pairs.get("auth_date", "0"))
    except ValueError:
        return None
    if not auth_date or time.time() - auth_date > max_age:
        return None
    try:
        user = json.loads(pairs.get("user", "null"))
    except json.JSONDecodeError:
        return None
    return user if isinstance(user, dict) and isinstance(user.get("id"), int) else None


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(msg: str) -> str:
    return _b64(hmac.new(config.SECRET_KEY.encode(), msg.encode(), hashlib.sha256).digest())


def make_token(sub: str, ttl: int = config.TOKEN_TTL) -> str:
    payload = _b64(json.dumps({"sub": sub, "exp": int(time.time()) + ttl}).encode())
    return f"{payload}.{_sign(payload)}"


def check_token(token: str) -> str | None:
    try:
        payload, sig = token.split(".", 1)
    except ValueError:
        return None
    if not hmac.compare_digest(_sign(payload), sig):
        return None
    try:
        data = json.loads(_unb64(payload))
    except Exception:
        return None
    if data.get("exp", 0) < time.time():
        return None
    return str(data.get("sub"))


def file_sig(photo_id: str, exp: int) -> str:
    return _sign(f"file:{photo_id}:{exp}")


def signed_file_url(photo_id: str, ttl: int = config.FILE_URL_TTL) -> str:
    exp = int(time.time()) + ttl
    return f"/api/files/{photo_id}?exp={exp}&sig={file_sig(photo_id, exp)}"


def check_file_sig(photo_id: str, exp: int, sig: str) -> bool:
    return exp >= time.time() and hmac.compare_digest(file_sig(photo_id, exp), sig)
