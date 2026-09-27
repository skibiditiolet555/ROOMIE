from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# A relative "env_file" resolves against the process's current working
# directory, not this file's location — if uvicorn isn't launched with cwd
# set to backend/ (e.g. `--app-dir backend` from the repo root), it silently
# finds no .env and every setting falls back to its default. Anchoring to
# this file's own directory makes it work regardless of cwd.
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    openai_api_key: str = ""
    openai_image_model: str = "gpt-image-1"
    openai_text_model: str = "gpt-4.1"
    # Decision step: "what furniture did the redesign add?" compares the
    # before/after photos (vision), and per-object scoring is text-only.
    openai_detect_model: str = "gpt-4o"
    openai_score_model: str = "gpt-4o-mini"

    # Local segmentation (Ultralytics YOLOE, runs on this machine's CPU — no
    # API cost). Tried in order; the first that loads is used.
    yoloe_models: str = "yoloe-26n-seg.pt,yoloe-11s-seg.pt"

    # Used for demo item-list generation (see app/services/item_service.py).
    # Groq's OpenAI-compatible endpoint; this account has no vision model,
    # so item suggestions are generated from style/prompt text only.
    groq_api_key: str = ""
    groq_text_model: str = "openai/gpt-oss-120b"

    # "match" = pick the supported size nearest the photo's shape; the photo
    # is padded to fit and cropped back afterwards, so framing is preserved
    # either way. Pin to 1024x1024 / 1024x1536 / 1536x1024 to force a canvas.
    image_size: str = "match"
    image_quality: str = "high"
    # "high" makes gpt-image-1 stick closely to the input photo. The API
    # default ("low") treats it as loose inspiration and invents a new room.
    image_input_fidelity: str = "high"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Basic (non-Supabase) authentication: users, sessions and password
    # resets live in a local SQLite file (see app/services/db.py). Rooms
    # still live in Supabase Postgres, but this backend is the only thing
    # that talks to it (via the service-role key below), so the frontend
    # never needs Supabase credentials or auth.uid() to enforce ownership.
    session_ttl_days: int = 30

    supabase_url: str = ""
    supabase_service_role_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
