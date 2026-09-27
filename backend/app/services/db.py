import httpx
from fastapi import HTTPException

from app.config import get_settings

_AUTH_TABLE = "roomie_users"


def _client() -> httpx.Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.",
        )
    return httpx.Client(
        base_url=f"{settings.supabase_url.rstrip('/')}/rest/v1",
        headers={
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        },
        timeout=15,
    )


def request(table: str, method: str = "GET", **kwargs) -> list[dict]:
    try:
        with _client() as client:
            response = client.request(method, f"/{table}", **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Could not reach the Supabase database.") from exc

    if response.is_error:
        if response.status_code == 409:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        raise HTTPException(
            status_code=503,
            detail="Supabase auth tables are unavailable. Apply supabase/add_roomie_auth_tables.sql.",
        )
    if response.status_code == 204 or not response.content:
        return []
    return response.json()


def init_db() -> None:
    """Fail startup early when the Supabase auth migration has not been applied."""
    request(_AUTH_TABLE, params={"select": "id", "limit": "1"})
    request("roomie_sessions", params={"select": "token", "limit": "1"})
