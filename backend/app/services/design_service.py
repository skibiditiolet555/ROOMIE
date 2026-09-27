from fastapi import HTTPException
from openai import OpenAIError

from app import prompts
from app.config import get_settings
import io

from app.services.image_utils import (
    build_object_mask,
    decode_image,
    edit_region_mask,
    object_crop_box,
    open_photo,
    paste_region_edit,
    prepare_for_edit,
    restore_framing,
)
from app.services.openai_client import get_client


async def _edit_image(image: str, prompt: str, edit_polygons: list[list[list[float]]] | None = None) -> str:
    settings = get_settings()
    client = get_client()
    raw, _mime, _filename = decode_image(image)

    # Whole-photo edits deliberately use no mask (a border mask made the model
    # invent a different room). Removing/replacing ONE object is different:
    # only a crop around that object is sent (so the model works at high
    # resolution), the mask is the object's own outline, and the result is
    # pasted back through that outline only — so nothing else in the room can
    # change, blur or pick up the model's texture.
    polygons = [polygon for polygon in (edit_polygons or []) if len(polygon) >= 3]
    photo = crop_box = None
    region = None
    if polygons:
        photo = open_photo(raw)
        crop_box = object_crop_box(polygons, photo.width, photo.height)
        crop = photo.crop(crop_box)
        crop_w, crop_h = crop_box[2] - crop_box[0], crop_box[3] - crop_box[1]
        polygons = [
            [[(x / 100 * photo.width - crop_box[0]) / crop_w * 100, (y / 100 * photo.height - crop_box[1]) / crop_h * 100]
             for x, y in polygon]
            for polygon in polygons
        ]
        buf = io.BytesIO()
        crop.save(buf, format="PNG")
        # Pick the canvas from the crop's own shape.
        prepared = prepare_for_edit(buf.getvalue(), "match")
        region = edit_region_mask(prepared, polygons)
    else:
        prepared = prepare_for_edit(raw, settings.image_size)

    mask_bytes = build_object_mask(prepared, polygons) if region is not None else None
    mask = {"mask": ("mask.png", mask_bytes, "image/png")} if mask_bytes else {}

    # No mask on purpose. A border-only mask marks most of the photo as
    # "repaint freely", and in testing the model used that to invent a
    # different room. High input fidelity with no mask kept the real room
    # (walls, windows, lighting, floor, camera angle) and only added
    # furniture.
    fidelity = {"input_fidelity": settings.image_input_fidelity} if settings.image_input_fidelity else {}

    try:
        result = await client.images.edit(
            model=settings.openai_image_model,
            image=("room.png", prepared.png, "image/png"),
            prompt=prompt,
            size=prepared.size,
            quality=settings.image_quality,
            **fidelity,
            **mask,
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=f"Image generation failed: {exc}") from exc

    if not result.data or not result.data[0].b64_json:
        raise HTTPException(status_code=502, detail="Image model returned no image.")

    # For a single-object edit, keep the model's pixels only inside that
    # object's region and the original photo everywhere else — so the model
    # re-rendering (and restyling) the whole canvas can't leak the sketch
    # texture onto the rest of the room. Whole-photo generation has no region,
    # so it uses the model's full output as before.
    if region is not None:
        return paste_region_edit(photo, crop_box, prepared, region, result.data[0].b64_json)
    return restore_framing(result.data[0].b64_json, prepared)


async def generate_design(
    image: str,
    style: str,
    prompt: str,
    budget: float | None,
    categories: list[str] | None = None,
) -> str:
    """Turn the user's original room photo into the finished design."""
    return await _edit_image(image, prompts.generation_prompt(style, prompt, budget, categories))


async def refine_design(
    image: str,
    instruction: str,
    style: str,
    edit_polygons: list[list[list[float]]] | None = None,
) -> str:
    """Apply one targeted change (swap or remove a single item) to the design.
    With edit_polygons, only those regions (the item's outline) can change."""
    return await _edit_image(image, prompts.refine_prompt(style, instruction), edit_polygons)
