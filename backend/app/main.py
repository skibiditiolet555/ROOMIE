from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, decisions, design, items, products, rooms
from app.services.db import init_db

settings = get_settings()

app = FastAPI(
    title="Roomie AI API",
    description="AI room redesign and item selection for the Roomie frontend.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    init_db()


app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(design.router)
app.include_router(items.router)
app.include_router(decisions.router)
app.include_router(products.router)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {
        "status": "ok",
        "openai_key_configured": bool(settings.openai_api_key),
        "image_model": settings.openai_image_model,
        "text_model": settings.openai_text_model,
    }

