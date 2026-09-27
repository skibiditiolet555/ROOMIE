import json
import uuid
import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from openai import OpenAIError
from pydantic import BaseModel, Field

from app import prompts
from app.config import get_settings
from app.services import design_service, object_segmentation
from app.services.image_utils import as_data_url
from app.services.openai_client import get_client

router = APIRouter(prefix="/api/decisions", tags=["decisions"])

# Weights match the Decision Score in the product brief:
# Function 30, Space 25, Budget 20, Style 15, Availability 10.
SCORE_MAX = (30, 25, 20, 15, 10)

# How much each kind of object matters to a room working at all (0-1).
_FUNCTION_BY_CATEGORY = {
    "sofa": 0.92, "bed": 0.95, "desk": 0.88, "chair": 0.8, "armchair": 0.8,
    "table": 0.78, "coffee table": 0.72, "dining table": 0.9, "cabinet": 0.8,
    "shelf": 0.75, "furniture": 0.8, "lighting": 0.7, "lamp": 0.7,
    "flooring": 0.65, "rug": 0.6, "curtains": 0.65, "curtain": 0.65,
    "decor": 0.4, "decoration": 0.4, "plant": 0.35,
}


class DetectedObject(BaseModel):
    id: str
    name: str
    category: str = ""
    price: float = 0


class SuggestRequest(BaseModel):
    room_type: str | None = None
    style: str | None = None
    budget: float | None = None
    dimensions: str | None = None
    requirements: list[str] | None = None
    ai_instructions: str | None = None
    detected_objects: list[DetectedObject] = Field(default_factory=list)


class ObjectScore(BaseModel):
    id: str
    score: int
    scores: list[int]
    reason: str
    decision: str


class SuggestResponse(BaseModel):
    objects: list[ObjectScore]
    # "rules": scored by transparent rules from the object's type, price and
    # the budget — no model call, so it costs nothing and is reproducible.
    source: str = "rules"


class RegenerateRequest(BaseModel):
    image_url: str
    object_name: str
    category: str = ""
    outlines: list[list[list[float]]] = Field(default_factory=list)
    # Rough centre (percent of the photo), used to find the object with local
    # segmentation when no traced outline was sent.
    x: float | None = None
    y: float | None = None
    action: str  # "replace" | "remove"
    instruction: str | None = None
    style: str | None = None
    budget: float | None = None


class RegenerateResponse(BaseModel):
    image_url: str


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _score_object(obj: DetectedObject, count: int, budget: float | None, total: float) -> ObjectScore:
    category = (obj.category or "").lower()
    function = _FUNCTION_BY_CATEGORY.get(category, 0.6)

    # Space: big-ticket pieces usually occupy real floor area; tiny decor is
    # nearly always a safe fit.
    space = 0.9 if obj.price < 3000 else 0.8 if obj.price < 15000 else 0.7

    if budget and count:
        fair_share = budget / count
        overshoot = max(0.0, obj.price / fair_share - 1.0) if fair_share else 0.0
        fit = _clamp(1.0 - overshoot * 0.45)
        if total > budget:
            fit = _clamp(fit - 0.15)
    else:
        fit = 0.75

    style = 0.75  # no per-object style signal without a vision call
    availability = 0.9

    parts = [function * SCORE_MAX[0], space * SCORE_MAX[1], fit * SCORE_MAX[2],
             style * SCORE_MAX[3], availability * SCORE_MAX[4]]
    scores = [round(p) for p in parts]
    score = sum(scores)

    if score >= 72:
        decision = "keep"
    elif score >= 55:
        decision = "replace"
    else:
        decision = "remove"

    weakest = min(range(5), key=lambda i: parts[i] / SCORE_MAX[i])
    weak_label = ("การใช้งาน", "พื้นที่", "งบประมาณ", "สไตล์", "การหาซื้อ")[weakest]
    reasons = {
        "keep": f"คะแนนรวมดี เหมาะกับห้องและงบ · จุดที่ควรดูคือ{weak_label}",
        "replace": f"ใช้ได้แต่ยังไม่เหมาะที่สุด · แนะนำหาชิ้นใหม่ที่ดีขึ้นด้าน{weak_label}",
        "remove": f"ไม่คุ้มเมื่อเทียบกับงบ · อ่อนที่สุดด้าน{weak_label}",
    }
    return ObjectScore(id=obj.id, score=score, scores=scores, reason=reasons[decision], decision=decision)


_SCORE_SCHEMA = {
    "name": "object_scores",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "objects": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "function": {"type": "integer", "description": "0-30: how necessary it is for the room to work"},
                        "space": {"type": "integer", "description": "0-25: whether it fits the room's space"},
                        "budget": {"type": "integer", "description": "0-20: value for its price against the total budget"},
                        "style": {"type": "integer", "description": "0-15: fit with the chosen style and brief"},
                        "availability": {"type": "integer", "description": "0-10: how easy it is to buy in Thailand"},
                        "reason": {"type": "string", "description": "One short sentence, in Thai"},
                    },
                    "required": ["id", "function", "space", "budget", "style", "availability", "reason"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["objects"],
        "additionalProperties": False,
    },
}


async def _score_with_llm(payload: SuggestRequest) -> list[ObjectScore]:
    """gpt-4o-mini scores each object against the room's brief and budget."""
    settings = get_settings()
    listing = "\n".join(f"- {o.id}: {o.name} ({o.category}), ~{o.price:,.0f} THB" for o in payload.detected_objects)
    brief = "; ".join(filter(None, [
        f"room: {payload.room_type}" if payload.room_type else "",
        f"style: {payload.style}" if payload.style else "",
        f"budget: {payload.budget:,.0f} THB" if payload.budget else "",
        f"client brief: {payload.ai_instructions}" if payload.ai_instructions else "",
    ]))
    completion = await get_client().with_options(timeout=25.0, max_retries=0).chat.completions.create(
        model=settings.openai_score_model,
        messages=[
            {"role": "system", "content": (
                "You score furniture for a Thai client deciding what to KEEP, REPLACE or REMOVE. "
                "Score each object on Function (0-30), Space (0-25), Budget (0-20), Style (0-15) "
                "and Availability (0-10). Be honest and spread the scores — do not give everything "
                "the same number. Give a one-sentence reason in Thai."
            )},
            {"role": "user", "content": f"{brief}\nObjects:\n{listing}"},
        ],
        response_format={"type": "json_schema", "json_schema": _SCORE_SCHEMA},
    )
    data = json.loads(completion.choices[0].message.content or "{}")
    known = {o.id for o in payload.detected_objects}
    results = []
    for row in data.get("objects", []):
        if row["id"] not in known:
            continue
        scores = [
            max(0, min(limit, int(row[key])))
            for key, limit in zip(("function", "space", "budget", "style", "availability"), SCORE_MAX)
        ]
        score = sum(scores)
        decision = "keep" if score >= 72 else "replace" if score >= 55 else "remove"
        results.append(ObjectScore(id=row["id"], score=score, scores=scores, reason=row["reason"], decision=decision))
    if len(results) != len(known):
        raise ValueError("Model did not score every object.")
    return results


@router.post("/suggest", response_model=SuggestResponse)
async def suggest(payload: SuggestRequest) -> SuggestResponse:
    """Score each detected object and suggest Keep / Replace / Remove."""
    source = "llm"
    try:
        results = await _score_with_llm(payload)
    except (OpenAIError, HTTPException, ValueError, KeyError, json.JSONDecodeError, asyncio.TimeoutError):
        # No credits / no key / a malformed reply: fall back to transparent
        # rules so the step still works and costs nothing.
        source = "rules"
        total = sum(obj.price for obj in payload.detected_objects)
        results = [
            _score_object(obj, len(payload.detected_objects), payload.budget, total)
            for obj in payload.detected_objects
        ]
    # Never suggest stripping the whole room.
    if results and all(item.decision == "remove" for item in results):
        best = max(results, key=lambda item: item.score)
        best.decision = "keep"
    return SuggestResponse(objects=results, source=source)


@router.post("/regenerate", response_model=RegenerateResponse)
async def regenerate(payload: RegenerateRequest) -> RegenerateResponse:
    """Re-render the photo with only this one object removed or replaced."""
    category = payload.category or "item"
    if payload.action == "remove":
        instruction = prompts.removal_instruction(payload.object_name, category)
    else:
        wanted = (payload.instruction or "").strip() or f"a different {category} in the same style"
        if payload.budget:
            wanted += f" (realistic at about {payload.budget:,.0f} THB)"
        instruction = prompts.replacement_instruction(payload.object_name, wanted, category)

    # The object's own outline is the only area the model may repaint. Never
    # run this edit unmasked: with no region, gpt-image-1 repaints the whole
    # room and restyles it (the sketch/painterly texture). If the frontend has
    # no traced outline, find the object here with local segmentation.
    polygons = [polygon for polygon in payload.outlines if len(polygon) >= 3]
    if not polygons:
        query = object_segmentation.ItemQuery(
            id="target",
            label=object_segmentation.prompt_for(payload.category, payload.object_name),
            x=payload.x,
            y=payload.y,
        )
        found, _extras = await run_in_threadpool(object_segmentation.segment_items, payload.image_url, [query])
        if "target" in found:
            polygons = [found["target"]["polygon"]]
    if not polygons:
        raise HTTPException(
            status_code=422,
            detail=f"Couldn't find the exact outline of \"{payload.object_name}\" in the photo, so it wasn't "
                   "edited — changing it without an outline would repaint the whole room.",
        )

    image = await design_service.refine_design(
        image=payload.image_url,
        instruction=instruction,
        style=payload.style or "Modern",
        edit_polygons=polygons,
    )
    return RegenerateResponse(image_url=image)


# ── Segmentation (local YOLOE + OpenCV) ───────────────────────────────────


class SegmentItem(BaseModel):
    id: str
    name: str
    category: str = ""
    # The detector's own class name, when known (objects found by a previous
    # scan) — matches reliably even when name/category don't map to it.
    label: str | None = None
    x: float | None = None  # rough centre, percent of the photo
    y: float | None = None


class SegmentRequest(BaseModel):
    image_url: str
    items: list[SegmentItem]
    # The room before the AI redesign: lets extras be told apart as
    # "already in the room" vs "added by the redesign".
    original_image_url: str | None = None


class SegmentedObject(BaseModel):
    id: str
    matched: bool
    outline: list[list[float]] | None = None
    score: float | None = None
    box: dict[str, float] | None = None


class SegmentExtra(BaseModel):
    """Furniture found in the photo that isn't one of the listed items —
    things already in the room, offered so they can be selected too."""

    label: str
    score: float
    polygon: list[list[float]]
    box: dict[str, float]
    existing: bool = False


class SegmentResponse(BaseModel):
    objects: list[SegmentedObject]
    extras: list[SegmentExtra] = Field(default_factory=list)


@router.post("/segment", response_model=SegmentResponse)
async def segment(payload: SegmentRequest) -> SegmentResponse:
    """Pixel-level outline for each listed item, found by category name on the
    photo. Runs on this machine (no API cost); items YOLOE can't find come
    back unmatched rather than with a guessed shape."""
    queries = [
        object_segmentation.ItemQuery(
            id=item.id,
            label=item.label or object_segmentation.prompt_for(item.category, item.name),
            x=item.x,
            y=item.y,
        )
        for item in payload.items
    ]
    found, extras = await run_in_threadpool(
        object_segmentation.segment_items, payload.image_url, queries, 0.2, payload.original_image_url
    )
    return SegmentResponse(extras=[SegmentExtra(**extra) for extra in extras], objects=[
        SegmentedObject(
            id=item.id,
            matched=item.id in found,
            outline=found[item.id]["polygon"] if item.id in found else None,
            score=found[item.id]["score"] if item.id in found else None,
            box=found[item.id]["box"] if item.id in found else None,
        )
        for item in payload.items
    ])


# ── Detection: what did the redesign add? (GPT) ───────────────────────────

_CATEGORIES = ["sofa", "armchair", "coffee table", "side table", "dining table", "desk", "bed",
               "nightstand", "shelf", "cabinet", "tv stand", "rug", "lamp", "plant", "curtain",
               "mirror", "wall art", "ottoman", "bench", "other"]

_DETECT_SCHEMA = {
    "name": "added_furniture",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Short descriptive name, in Thai"},
                        "category": {"type": "string", "enum": _CATEGORIES},
                        "price_estimate": {"type": "number", "description": "Estimated price in THB"},
                        "x": {"type": "number", "description": "Rough centre, percent of photo width (0-100)"},
                        "y": {"type": "number", "description": "Rough centre, percent of photo height (0-100)"},
                    },
                    "required": ["name", "category", "price_estimate", "x", "y"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["items"],
        "additionalProperties": False,
    },
}


class DetectRequest(BaseModel):
    image_url: str  # the AI-redesigned photo
    original_image_url: str | None = None  # the room before the redesign
    budget: float | None = None
    style: str | None = None


class DetectedItem(BaseModel):
    id: str
    name: str
    category: str
    price: int
    x: float
    y: float
    matched: bool
    outline: list[list[float]] | None = None
    score: float | None = None


class DetectResponse(BaseModel):
    objects: list[DetectedItem]
    source: str = "gpt+yoloe"


@router.post("/detect", response_model=DetectResponse)
async def detect(payload: DetectRequest) -> DetectResponse:
    """GPT compares before/after and lists the furniture the redesign ADDED
    (name, category, price, rough position); YOLOE then cuts each one out."""
    content = [{"type": "text", "text": (
        "The first image is a room before a redesign and the second is the AI redesign of it. "
        "List ONLY the furniture and decor that was ADDED (not what was already there), "
        "each with a short Thai name, its category, a realistic price in THB for a Thai shopper, "
        "and its rough centre in the redesigned photo as percentages. "
        + (f"Style: {payload.style}. " if payload.style else "")
        + (f"Total budget about {payload.budget:,.0f} THB." if payload.budget else "")
    )}]
    if payload.original_image_url:
        content.append({"type": "image_url", "image_url": {"url": as_data_url(payload.original_image_url)}})
    content.append({"type": "image_url", "image_url": {"url": as_data_url(payload.image_url)}})

    try:
        completion = await get_client().chat.completions.create(
            model=get_settings().openai_detect_model,
            messages=[{"role": "user", "content": content}],
            response_format={"type": "json_schema", "json_schema": _DETECT_SCHEMA},
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=f"Detection failed: {exc}") from exc

    rows = json.loads(completion.choices[0].message.content or "{}").get("items", [])
    items = [
        {"id": f"obj-{uuid.uuid4().hex[:8]}", **row} for row in rows
    ]
    queries = [
        object_segmentation.ItemQuery(
            id=row["id"], label=object_segmentation.prompt_for(row["category"], row["name"]), x=row["x"], y=row["y"]
        )
        for row in items
    ]
    found = (await run_in_threadpool(object_segmentation.segment_items, payload.image_url, queries))[0] if queries else {}
    return DetectResponse(objects=[
        DetectedItem(
            id=row["id"],
            name=row["name"],
            category=row["category"],
            price=round(row["price_estimate"]),
            x=row["x"],
            y=row["y"],
            matched=row["id"] in found,
            outline=found[row["id"]]["polygon"] if row["id"] in found else None,
            score=found[row["id"]]["score"] if row["id"] in found else None,
        )
        for row in items
    ])
