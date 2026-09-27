import json
import uuid

from fastapi import HTTPException
from openai import OpenAIError

from app import prompts
from app.config import get_settings
from app.schemas import BoundingBox, Item, OutlinePoint
from app.services.image_utils import as_data_url
from app.services import groq_client
from app.services.openai_client import get_client

# Retailers the model is allowed to name. It picks the store most likely to
# carry a piece like this — the price is an ESTIMATE, not a live listing, so
# every item also carries a search_query the frontend can use to link to the
# retailer's own search results for the real product.
SOURCES = ["IKEA", "HomePro", "Shopee", "TikTok Shop", "Lazada", "Other"]
CATEGORIES = ["furniture", "flooring", "curtains", "lighting", "decor"]

_ITEM_PROPERTIES = {
    "name": {"type": "string", "description": "Short product name, e.g. 'Grey 3-seat fabric sofa'"},
    "category": {"type": "string", "enum": CATEGORIES},
    "description": {"type": "string", "description": "One short line about material/colour/size"},
    "source": {"type": "string", "enum": SOURCES},
    "price_estimate": {"type": "number", "description": "Estimated price in THB"},
    "search_query": {
        "type": "string",
        "description": "Search terms to find this product on the retailer's site",
    },
}

_ITEM_SCHEMA = {
    "type": "object",
    "properties": _ITEM_PROPERTIES,
    "required": list(_ITEM_PROPERTIES),
    "additionalProperties": False,
}

_POINT_SCHEMA = {
    "type": "object",
    "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
    "required": ["x", "y"],
    "additionalProperties": False,
}

_SHAPE_PROPERTIES = {
    "bbox": {
        "description": (
            "Where this item sits in the FIRST photo, as percentages (0-100) "
            "of that photo's width/height. null only if you genuinely cannot "
            "place it."
        ),
        "anyOf": [
            {
                "type": "object",
                "properties": {
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                    "w": {"type": "number"},
                    "h": {"type": "number"},
                },
                "required": ["x", "y", "w", "h"],
                "additionalProperties": False,
            },
            {"type": "null"},
        ],
    },
    "outline": {
        "description": (
            "12-24 points tracing this item's real visible silhouette in the "
            "FIRST photo (see the outline instructions above). null only if "
            "you genuinely cannot estimate one."
        ),
        "anyOf": [
            {"type": "array", "items": _POINT_SCHEMA},
            {"type": "null"},
        ],
    },
}

# Vision calls actually have a photo to place items in, so their item schema
# additionally carries a bbox + outline (see prompts.BBOX_FORMAT). The
# text-only demo schema (_ITEM_SCHEMA above) has no photo to locate anything in.
_VISION_ITEM_SCHEMA = {
    "type": "object",
    "properties": {**_ITEM_PROPERTIES, **_SHAPE_PROPERTIES},
    "required": [*_ITEM_PROPERTIES, "bbox", "outline"],
    "additionalProperties": False,
}

_DETECT_SCHEMA = {
    "name": "room_items",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {"items": {"type": "array", "items": _ITEM_SCHEMA}},
        "required": ["items"],
        "additionalProperties": False,
    },
}

_ALTERNATIVE_SCHEMA = {
    "name": "item_alternative",
    "strict": True,
    "schema": _ITEM_SCHEMA,
}

_VISION_DETECT_SCHEMA = {
    "name": "room_analysis",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "room_condition": {"type": "string", "enum": ["empty", "furnished"]},
            "renovation_plan": {
                "type": "string",
                "description": (
                    "If furnished: a short, specific plan for developing the room "
                    "toward the client's brief. If empty: an empty string."
                ),
            },
            "items": {"type": "array", "items": _VISION_ITEM_SCHEMA},
        },
        "required": ["room_condition", "renovation_plan", "items"],
        "additionalProperties": False,
    },
}


async def _structured_call(messages: list[dict], schema: dict) -> dict:
    settings = get_settings()
    client = get_client()
    try:
        completion = await client.chat.completions.create(
            model=settings.openai_text_model,
            messages=messages,
            response_format={"type": "json_schema", "json_schema": schema},
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI request failed: {exc}") from exc

    return _parse_content(completion)


async def _structured_call_groq(messages: list[dict], schema: dict) -> dict:
    settings = get_settings()
    client = groq_client.get_client()
    try:
        completion = await client.chat.completions.create(
            model=settings.groq_text_model,
            messages=messages,
            response_format={"type": "json_schema", "json_schema": schema},
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=f"Groq request failed: {exc}") from exc

    return _parse_content(completion)


def _parse_content(completion) -> dict:
    content = completion.choices[0].message.content
    if not content:
        raise HTTPException(status_code=502, detail="Model returned an empty response.")
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Model returned malformed JSON.") from exc


def _to_item(payload: dict, currency: str = "THB") -> Item:
    bbox_payload = payload.get("bbox")
    bbox = BoundingBox(**bbox_payload) if bbox_payload else None
    outline_payload = payload.get("outline")
    outline = [OutlinePoint(**p) for p in outline_payload] if outline_payload else None
    return Item(
        id=f"item-{uuid.uuid4().hex[:10]}",
        name=payload["name"],
        category=payload["category"],
        description=payload.get("description", ""),
        source=payload.get("source", "Other"),
        price_estimate=float(payload.get("price_estimate") or 0),
        currency=currency,
        search_query=payload.get("search_query", payload["name"]),
        bbox=bbox,
        outline=outline,
    )


async def detect_items_vision(
    images: list[str],
    budget: float | None,
    currency: str,
    style: str,
    prompt: str,
    room_category: str,
) -> tuple[list[Item], str, str]:
    """Carefully examine every uploaded photo of the room together, then:

    - if it's empty, propose a full furnishing list; or
    - if it's already furnished, write a short renovation plan and suggest
      only the specific items needed to carry it out — following the
      client's brief rather than just re-furnishing from scratch.

    Returns (items, room_condition, renovation_plan). Requires a working
    OpenAI vision call (see app.services.openai_client) — the caller should
    fall back to detect_items_demo if this raises.
    """
    content = [
        {
            "type": "text",
            "text": prompts.vision_detect_user_text(
                len(images), room_category, style, prompt, budget
            ),
        },
        *[{"type": "image_url", "image_url": {"url": as_data_url(image)}} for image in images],
    ]

    messages = [
        {"role": "system", "content": prompts.VISION_DETECT_SYSTEM},
        {"role": "user", "content": content},
    ]

    data = await _structured_call(messages, _VISION_DETECT_SCHEMA)
    items = [_to_item(raw, currency) for raw in data.get("items", [])]
    room_condition = data.get("room_condition", "unknown")
    renovation_plan = data.get("renovation_plan", "")
    return items, room_condition, renovation_plan


async def detect_items_demo(
    budget: float | None,
    currency: str,
    style: str,
    prompt: str,
    room_category: str,
) -> list[Item]:
    """Generate a plausible demo item list for the room from text context alone.

    This does NOT look at any photo — used as a fallback when vision isn't
    available (no OpenAI credits, or no photos were provided). See
    DetectItemsResponse.source, which is "demo" for this path.
    """
    messages = [
        {"role": "system", "content": prompts.DEMO_DETECT_SYSTEM},
        {
            "role": "user",
            "content": prompts.demo_detect_user_text(style, room_category, prompt, budget),
        },
    ]

    data = await _structured_call_groq(messages, _DETECT_SCHEMA)
    return [_to_item(raw, currency) for raw in data.get("items", [])]


async def suggest_alternative(
    image: str,
    item: Item,
    style: str,
    budget_remaining: float | None,
    exclude: list[str],
) -> Item:
    """Propose a different product for one slot the user rejected."""
    messages = [
        {"role": "system", "content": prompts.ALTERNATIVE_SYSTEM},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": prompts.alternative_user_text(
                        item.name, item.category, style, budget_remaining, exclude
                    ),
                },
                {"type": "image_url", "image_url": {"url": as_data_url(image)}},
            ],
        },
    ]

    data = await _structured_call(messages, _ALTERNATIVE_SCHEMA)
    return _to_item(data, item.currency)

async def locate_items(image: str, items: list[dict]) -> dict:
    """Return geometry only, measured against the exact displayed photo."""
    schema = {
        "name": "visible_item_shapes",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {"items": {"type": "array", "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "visible": {"type": "boolean"},
                    "point": {"anyOf": [_POINT_SCHEMA, {"type": "null"}]},
                    **_SHAPE_PROPERTIES,
                },
                "required": ["id", "visible", "point", "bbox", "outline"],
                "additionalProperties": False,
            }}},
            "required": ["items"],
            "additionalProperties": False,
        },
    }
    return await _structured_call([
        {"role": "system", "content": (
            "Locate objects from the supplied item list in this exact photo. "
            "Match by object kind, even if the suggested product's material or color differs. "
            "Never invent or place missing furniture. Return every supplied id. "
            "For objects absent from the photo set visible=false and all geometry=null. "
            "For visible objects use coordinates as percentages (0-100) of the FULL image. "
            "bbox is the tight enclosing rectangle. point is a point well INSIDE the "
            "object's main solid surface, away from edges, gaps, cushions and occluding objects. "
            "outline is 24-60 ordered vertices around the actual visible outer silhouette. "
            "Carefully trace sofa backs, arms, seats, bottom edges and visible legs. "
            "Trace the outer frame for wall art, not the artwork inside it. "
            "Follow occlusions and concavities. Do not return bounding rectangles as "
            "outlines except for genuinely rectangular objects such as framed artwork."
        )},
        {"role": "user", "content": [
            {"type": "text", "text": json.dumps(items)},
            {"type": "image_url", "image_url": {"url": as_data_url(image)}},
        ]},
    ], schema)
