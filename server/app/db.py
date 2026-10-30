"""SQLite с той же схемой, что и в supabase/migrations (subjects, grades, photos, settings)."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from . import config

SCHEMA = """
create table if not exists subjects (
  id text primary key,
  name text not null,
  short_name text,
  period integer not null default 1,
  hidden integer not null default 0,
  sort integer not null default 0,
  rk1_official real check (rk1_official between 0 and 100),
  rk2_official real check (rk2_official between 0 and 100),
  exam real check (exam between 0 and 100),
  created_at text not null,
  updated_at text not null
);
create table if not exists photos (
  id text primary key,
  subject_id text references subjects(id) on delete set null,
  kind text check (kind in ('lecture','practice','srop','srsp')),
  date text not null,
  path text not null,
  width integer,
  height integer,
  size integer not null default 0,
  note text,
  created_at text not null
);
create table if not exists grades (
  id text primary key,
  subject_id text not null references subjects(id) on delete cascade,
  date text not null,
  score real not null check (score between 0 and 100),
  kind text not null check (kind in ('lecture','practice','srop','srsp')),
  source text not null check (source in ('lecturer','practitioner')),
  note text,
  photo_id text references photos(id) on delete set null,
  created_at text not null,
  updated_at text not null
);
create index if not exists grades_subject_date on grades (subject_id, date);
create index if not exists photos_subject_date on photos (subject_id, date);
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at text not null
);
"""

# id совпадают с миграцией Supabase и frontend/src/data/defaults.ts
DEFAULT_SUBJECTS = [
    ("00000000-0000-4000-8000-000000000001", "История Казахстана", "История", 1),
    ("00000000-0000-4000-8000-000000000002", "Казахский (Русский) язык", "Каз/рус язык", 2),
    ("00000000-0000-4000-8000-000000000003", "Информационно-коммуникационные технологии", "ИКТ", 3),
    ("00000000-0000-4000-8000-000000000004", "Иностранный язык", "Ин. язык", 4),
    ("00000000-0000-4000-8000-000000000005", "Физическая культура", "Физкультура", 5),
    ("00000000-0000-4000-8000-000000000006", "Математика", None, 6),
]

DEFAULT_SETTINGS = {
    "semester_start": "2026-09-01",
    "rk1": {"from": 1, "to": 7},
    "rk2": {"from": 8, "to": 15},
    "weights": {"lecture": 1, "practice": 1, "srop": 1, "srsp": 1},
    "theme": "auto",
    "period": 1,
}

COLUMNS = {
    "subjects": ["id", "name", "short_name", "period", "hidden", "sort", "rk1_official", "rk2_official", "exam", "created_at", "updated_at"],
    "grades": ["id", "subject_id", "date", "score", "kind", "source", "note", "photo_id", "created_at", "updated_at"],
    "photos": ["id", "subject_id", "kind", "date", "path", "width", "height", "size", "note", "created_at"],
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(config.DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("pragma foreign_keys = on")
    con.execute("pragma journal_mode = wal")
    return con


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    con = connect()
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init() -> None:
    with tx() as con:
        con.executescript(SCHEMA)
        t = now()
        con.executemany(
            "insert or ignore into subjects (id, name, short_name, period, hidden, sort, created_at, updated_at) values (?, ?, ?, 1, 0, ?, ?, ?)",
            [(i, n, s, o, t, t) for i, n, s, o in DEFAULT_SUBJECTS],
        )
        con.execute(
            "insert or ignore into settings (key, value, updated_at) values ('app', ?, ?)",
            (json.dumps(DEFAULT_SETTINGS), t),
        )


def row(table: str, r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    if table == "subjects":
        d["hidden"] = bool(d["hidden"])
    for k in ("score", "rk1_official", "rk2_official", "exam"):
        v = d.get(k)
        if isinstance(v, float) and v.is_integer():
            d[k] = int(v)
    return d


def list_rows(table: str, order: str) -> list[dict[str, Any]]:
    with tx() as con:
        return [row(table, r) for r in con.execute(f"select * from {table} order by {order}")]


def upsert(con: sqlite3.Connection, table: str, data: dict[str, Any]) -> None:
    cols = COLUMNS[table]
    d = {k: data.get(k) for k in cols}
    t = now()
    if "created_at" in d and not d["created_at"]:
        d["created_at"] = t
    if "updated_at" in d:
        d["updated_at"] = t
    if table == "subjects":
        d["hidden"] = 1 if d.get("hidden") else 0
        d["period"] = d.get("period") or 1
        d["sort"] = d.get("sort") or 0
    if table == "photos":
        d["size"] = d.get("size") or 0
    placeholders = ", ".join("?" for _ in cols)
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c not in ("id", "created_at"))
    con.execute(
        f"insert into {table} ({', '.join(cols)}) values ({placeholders}) on conflict(id) do update set {updates}",
        [d[c] for c in cols],
    )


def get_settings(con: sqlite3.Connection) -> dict | None:
    r = con.execute("select value from settings where key = 'app'").fetchone()
    return json.loads(r["value"]) if r else None


def save_settings(con: sqlite3.Connection, value: dict) -> None:
    con.execute(
        "insert into settings (key, value, updated_at) values ('app', ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
        (json.dumps(value, ensure_ascii=False), now()),
    )
