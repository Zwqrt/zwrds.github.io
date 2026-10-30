"""CLI режима server:  python -m app.cli export backup.zip | import backup.zip [--replace] | seed"""

import argparse
import sys
from pathlib import Path

from . import backup, db


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export", help="сделать backup.zip (data.json + photos/)")
    e.add_argument("file", nargs="?", default="backup.zip")
    i = sub.add_parser("import", help="импортировать backup.zip или data.json")
    i.add_argument("file")
    i.add_argument("--replace", action="store_true", help="сначала удалить все текущие данные")
    sub.add_parser("seed", help="добавить примерные оценки (tools/seed.py)")
    a = ap.parse_args()

    db.init()
    if a.cmd == "export":
        Path(a.file).write_bytes(backup.export_zip())
        print(f"Готово: {a.file}")
    elif a.cmd == "import":
        r = backup.import_file(Path(a.file), replace=a.replace)
        print(f"Импортировано: предметов {r['subjects']}, оценок {r['grades']}, фото {r['photos']}")
    elif a.cmd == "seed":
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
        import seed  # type: ignore

        r = backup.import_bytes(seed.build_zip())
        print(f"Добавлены примерные оценки: {r['grades']}")


if __name__ == "__main__":
    main()
