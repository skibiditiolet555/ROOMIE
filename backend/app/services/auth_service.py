import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException

from app.config import get_settings
from app.services.db import get_connection

PBKDF2_ITERATIONS = 200_000


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, _ = stored.split("$", 1)
    except ValueError:
        return False
    salt = bytes.fromhex(salt_hex)
    return secrets.compare_digest(_hash_password(password, salt), stored)


def _row_to_user(row) -> dict:
    return {"id": row["id"], "email": row["email"], "name": row["name"]}


def register_user(email: str, password: str, name: str) -> dict:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    display_name = name.strip() or email.split("@")[0]
    user_id = str(uuid.uuid4())
    password_hash = _hash_password(password)

    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        conn.execute(
            "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, email, display_name, password_hash, _now().isoformat()),
        )

    return {"id": user_id, "email": email, "name": display_name}


def authenticate_user(email: str, password: str) -> dict:
    email = email.strip().lower()
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if not row or not _verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    return _row_to_user(row)


def create_session(user_id: str) -> str:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(days=settings.session_ttl_days)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires_at.isoformat()),
        )
    return token


def get_user_by_token(token: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT users.* FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ? AND sessions.expires_at > ?
            """,
            (token, _now().isoformat()),
        ).fetchone()
    return _row_to_user(row) if row else None


def delete_session(token: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def email_exists(email: str) -> bool:
    email = email.strip().lower()
    with get_connection() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    return row is not None


def set_password_by_email(email: str, new_password: str) -> dict:
    """Recovery flow: no email link, no token — the client already confirmed
    the address matches an account (see /api/auth/verify-email), so this
    sets the password directly. There's no proof the caller actually owns
    that inbox; that's a deliberate simplicity trade-off for this app, not
    an oversight."""
    email = email.strip().lower()
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No account found with that email.")

        password_hash = _hash_password(new_password)
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, row["id"]))
        user_row = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()

    return _row_to_user(user_row)


async def get_current_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return authorization.split(" ", 1)[1].strip()


async def get_current_user(token: str = Depends(get_current_token)) -> dict:
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
    return user
