import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import prompts
from app.config import get_settings
from app.schemas import (
    DeleteItemRequest,
    DeleteItemResponse,
    DetectItemsRequest,
    DetectItemsResponse,
    RegenerateItemRequest,
    RegenerateItemResponse,
)
from fastapi.concurrency import run_in_threadpool

from app.services import design_service, item_service, object_segmentation

router = APIRouter(prefix="/api/items", tags=["items"])
logger = logging.getLogger(__name__)


async def _object_region(image: str, item) -> list[list[list[float]]] | None:
    """Best region to repaint for a single-item edit: the item's real pixel
    silhouette from local YOLOE segmentation (searched near the item's known
    position), falling back to the vision model's rough outline/box."""
    rough = _edit_polygons(item)
    center_x = center_y = None
    if item.bbox:
        center_x, center_y = item.bbox.x + item.bbox.w / 2, item.bbox.y + item.bbox.h / 2
    elif item.outline:
        center_x = sum(point.x for point in item.outline) / len(item.outline)
        center_y = sum(point.y for point in item.outline) / len(item.outline)
    try:
        query = object_segmentation.ItemQuery(
            id="target",
            label=object_segmentation.prompt_for(item.category, item.name),
            x=center_x,
            y=center_y,
        )
        found, _extras = await run_in_threadpool(object_segmentation.segment_items, image, [query])
        if "target" in found:
            return [found["target"]["polygon"]]
    except Exception as exc:  # segmentation unavailable: the rough region still confines the edit
        logger.warning("Segmentation for item edit failed, using rough outline: %s", exc)
    return rough


def _edit_polygons(item) -> list[list[list[float]]] | None:
    """The region gpt-image-1 is allowed to repaint when removing/replacing this
    one item: its own silhouette (preferred) or, failing that, its bounding box.
    Everything outside it is locked, so a single-object edit can't restyle the
    whole room (which is what produced the 'sketch/painterly' corruption when
    these edits ran with no mask). None only when the item has no geometry at
    all — then the caller must NOT do a full-image repaint."""
    if item.outline and len(item.outline) >= 3:
        return [[[point.x, point.y] for point in item.outline]]
    if item.bbox:
        box = item.bbox
        return [[
            [box.x, box.y],
            [box.x + box.w, box.y],
            [box.x + box.w, box.y + box.h],
            [box.x, box.y + box.h],
        ]]
    return None


class LocateItem(BaseModel):
    id: str
    name: str


class LocateRequest(BaseModel):
    image: str
    items: list[LocateItem] = Field(max_length=50)


@router.post("/locate")
async def locate(payload: LocateRequest) -> dict:
    """Locate existing shopping-list entries in the displayed design photo."""
    return await item_service.locate_items(
        payload.image, [item.model_dump() for item in payload.items]
    )


@router.post("/detect", response_model=DetectItemsResponse)
async def detect(payload: DetectItemsRequest) -> DetectItemsResponse:
    """List shoppable items for the room, or a renovation plan if it's
    already furnished. Uses real vision analysis of every uploaded photo
    when possible; falls back to text-only demo suggestions if no photos
    were given or the vision call fails (e.g. no OpenAI credits)."""
    settings = get_settings()

    if payload.images and settings.openai_api_key:
        try:
            items, room_condition, renovation_plan = await item_service.detect_items_vision(
                images=payload.images,
                budget=payload.budget,
                currency=payload.currency,
                style=payload.style,
                prompt=payload.prompt,
                room_category=payload.room_category,
            )
            return DetectItemsResponse(
                items=items,
                total_estimate=sum(item.price_estimate for item in items),
                currency=payload.currency,
                source="ai_vision",
                room_condition=room_condition,
                renovation_plan=renovation_plan,
            )
        except HTTPException as exc:
            logger.warning("Vision item detection failed, falling back to demo: %s", exc.detail)

    items = await item_service.detect_items_demo(
        budget=payload.budget,
        currency=payload.currency,
        style=payload.style,
        prompt=payload.prompt,
        room_category=payload.room_category,
    )
    return DetectItemsResponse(
        items=items,
        total_estimate=sum(item.price_estimate for item in items),
        currency=payload.currency,
        source="demo",
    )


@router.post("/regenerate", response_model=RegenerateItemResponse)
async def regenerate(payload: RegenerateItemRequest) -> RegenerateItemResponse:
    """Swap one item the user rejected for a different product, and re-render it."""
    alternative = await item_service.suggest_alternative(
        image=payload.image,
        item=payload.item,
        style=payload.style,
        budget_remaining=payload.budget_remaining,
        exclude=payload.exclude,
    )

    image = None
    if payload.rerender:
        # Repaint only the item's own region; the outline of the piece being
        # swapped out is where the replacement goes.
        image = await design_service.refine_design(
            image=payload.image,
            instruction=prompts.replacement_instruction(
                old_name=payload.item.name,
                new_name=alternative.name,
                category=alternative.category,
            ),
            style=payload.style,
            edit_polygons=await _object_region(payload.image, payload.item),
        )

    return RegenerateItemResponse(item=alternative, image=image)


@router.post("/delete", response_model=DeleteItemResponse)
async def delete(payload: DeleteItemRequest) -> DeleteItemResponse:
    """Take one item out of the room and re-render the design without it."""
    image = None
    polygons = await _object_region(payload.image, payload.item) if payload.rerender else None
    # Only re-render when we can confine the edit to this item's region. With no
    # geometry, a full-image repaint would restyle the whole room (the texture
    # corruption); better to leave the photo untouched and just drop the item
    # from the list than to wreck the picture.
    if payload.rerender and polygons:
        image = await design_service.refine_design(
            image=payload.image,
            instruction=prompts.removal_instruction(
                item_name=payload.item.name,
                category=payload.item.category,
            ),
            style=payload.style,
            edit_polygons=polygons,
        )

    return DeleteItemResponse(removed_id=payload.item.id, image=image)
