import sqlite3
from contextlib import contextmanager
from pathlib import Path

# backend/app/services/db.py -> backend/auth.db, so this works regardless of
# the process's current working directory (unlike a bare relative path).
DB_PATH = Path(__file__).resolve().parent.parent.parent / "auth.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            """
        )


@contextmanager
def get_connection():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
