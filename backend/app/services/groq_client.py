from functools import lru_cache

from fastapi import HTTPException
from openai import AsyncOpenAI

from app.config import get_settings

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


@lru_cache
def get_client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not set. Add it to backend/.env.",
        )
    return AsyncOpenAI(api_key=settings.groq_api_key, base_url=GROQ_BASE_URL)
