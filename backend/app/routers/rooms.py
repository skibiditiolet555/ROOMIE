from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.services import auth_service

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def _client() -> httpx.AsyncClient:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in backend/.env.",
        )
    return httpx.AsyncClient(
        base_url=f"{settings.supabase_url.rstrip('/')}/rest/v1",
        headers={
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        },
        timeout=20,
    )


def _unwrap(response: httpx.Response) -> Any:
    if response.is_error:
        raise HTTPException(status_code=502, detail=f"Supabase request failed: {response.text}")
    if not response.content:
        return None
    return response.json()


_OPTIONAL_COLUMNS = {"workflow", "style_overrides", "design_categories"}


async def _send_tolerant(send, payload: dict[str, Any]) -> httpx.Response:
    """Send a write; if the database predates supabase/add_workflow_column.sql,
    drop the not-yet-existing workflow columns and retry so saving still works
    (that data then lives only in the browser until the migration is run)."""
    response = await send(payload)
    for _ in range(len(_OPTIONAL_COLUMNS)):
        if response.status_code != 400 or "PGRST204" not in response.text:
            break
        missing = next((col for col in _OPTIONAL_COLUMNS if f"'{col}'" in response.text and col in payload), None)
        if not missing:
            break
        payload = {key: value for key, value in payload.items() if key != missing}
        response = await send(payload)
    return response


@router.get("")
async def list_rooms(user: dict = Depends(auth_service.get_current_user)) -> list[dict]:
    async with _client() as client:
        response = await client.get(
            "/rooms",
            params={"user_id": f"eq.{user['id']}", "order": "created_at.desc"},
        )
    return _unwrap(response) or []


@router.post("")
async def create_room(payload: dict[str, Any], user: dict = Depends(auth_service.get_current_user)) -> dict:
    row = {**payload, "user_id": user["id"]}
    async with _client() as client:
        response = await _send_tolerant(
            lambda body: client.post("/rooms", json=body, headers={"Prefer": "return=representation"}), row
        )
    data = _unwrap(response)
    return data[0] if isinstance(data, list) else data


@router.patch("/{room_id}")
async def update_room(
    room_id: str, payload: dict[str, Any], user: dict = Depends(auth_service.get_current_user)
) -> dict:
    # user_id is never accepted from the client — ownership is fixed at
    # creation and enforced again here via the eq filter below.
    payload = {key: value for key, value in payload.items() if key != "user_id"}
    async with _client() as client:
        response = await _send_tolerant(
            lambda body: client.patch(
                "/rooms",
                params={"id": f"eq.{room_id}", "user_id": f"eq.{user['id']}"},
                json=body,
                headers={"Prefer": "return=representation"},
            ),
            payload,
        )
    data = _unwrap(response)
    if not data:
        # Nothing to write (e.g. only not-yet-migrated columns): return the row as is.
        async with _client() as client:
            data = _unwrap(await client.get("/rooms", params={"id": f"eq.{room_id}", "user_id": f"eq.{user['id']}"}))
    if not data:
        raise HTTPException(status_code=404, detail="Room not found.")
    return data[0] if isinstance(data, list) else data


@router.delete("/{room_id}")
async def delete_room(room_id: str, user: dict = Depends(auth_service.get_current_user)) -> dict:
    async with _client() as client:
        response = await client.delete(
            "/rooms",
            params={"id": f"eq.{room_id}", "user_id": f"eq.{user['id']}"},
        )
    _unwrap(response)
    return {"ok": True}
