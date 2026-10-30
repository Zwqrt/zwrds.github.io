#!/bin/sh
# Ежедневный бэкап ./data: копия папки в архив ./backups/data-ГГГГ-ММ-ДД.tar.gz.
# База SQLite копируется командой sqlite3 .backup — так копия целостная даже во время записи.
set -eu
SRC=${SRC:-/data}
DST=${DST:-/backups}
KEEP=${BACKUP_KEEP_DAYS:-14}
STAMP=$(date +%Y-%m-%d)
TMP=$(mktemp -d)
mkdir -p "$DST"
cp -a "$SRC"/. "$TMP"/
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$SRC/kartu.db" ]; then
  rm -f "$TMP"/kartu.db*
  sqlite3 "$SRC/kartu.db" ".backup '$TMP/kartu.db'"
fi
tar -czf "$DST/data-$STAMP.tar.gz" -C "$TMP" .
rm -rf "$TMP"
find "$DST" -name 'data-*.tar.gz' -mtime +"$KEEP" -delete
echo "$(date -Iseconds) backup ok: $DST/data-$STAMP.tar.gz"
