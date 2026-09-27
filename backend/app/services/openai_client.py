from functools import lru_cache

from fastapi import HTTPException
from openai import AsyncOpenAI

from app.config import get_settings


@lru_cache
def get_client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key.",
        )
    return AsyncOpenAI(api_key=settings.openai_api_key)
