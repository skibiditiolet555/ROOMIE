import base64
import binascii
import io
import math
import re
from dataclasses import dataclass

from fastapi import HTTPException
from PIL import Image, ImageFilter, ImageOps

DATA_URL_RE = re.compile(r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", re.DOTALL)

_EXT_BY_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}


def decode_image(value: str) -> tuple[bytes, str, str]:
    """Accept a data URL or bare base64 and return (bytes, mime, filename)."""
    if not value:
        raise HTTPException(status_code=400, detail="No image provided.")

    match = DATA_URL_RE.match(value.strip())
    if match:
        mime = match.group("mime")
        payload = match.group("data")
    else:
        # Bare base64 — assume PNG, which the images API accepts.
        mime = "image/png"
        payload = value.strip()

    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Image is not valid base64.") from exc

    if not raw:
        raise HTTPException(status_code=400, detail="Decoded image is empty.")

    ext = _EXT_BY_MIME.get(mime, "png")
    return raw, mime, f"room.{ext}"


def to_data_url(b64_payload: str, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{b64_payload}"


def as_data_url(value: str) -> str:
    """Normalise any accepted image input into a data URL (for vision calls)."""
    if value.strip().startswith("data:"):
        return value.strip()
    return to_data_url(value.strip())


# The only output sizes gpt-image-1's edit endpoint accepts.
_SUPPORTED_EDIT_SIZES = ((1024, 1024), (1024, 1536), (1536, 1024))


@dataclass
class PreparedEdit:
    """A photo padded to a size the edit API accepts, plus where the real
    photo sits inside it so the result can be cropped back out exactly."""

    png: bytes
    size: str
    canvas: tuple[int, int]
    photo_box: tuple[int, int, int, int]


def _closest_supported(width: int, height: int) -> tuple[int, int]:
    # Log ratio, so 1.5x too wide and 1.5x too tall count as equally wrong.
    ratio = math.log(width / height)
    return min(_SUPPORTED_EDIT_SIZES, key=lambda s: abs(math.log(s[0] / s[1]) - ratio))


def prepare_for_edit(raw: bytes, pinned_size: str = "") -> PreparedEdit:
    """Fit the photo inside a supported size without changing its shape.

    The API only renders 1:1, 2:3 or 3:2. Sending a 4:3 photo as-is makes
    the model reshape the room to fit, which reads as the camera having
    zoomed or moved. Instead the whole photo is scaled to fit (never
    cropped) and centred on a canvas of the supported size; the leftover
    strips are a blurred copy of the photo so they look like soft
    continuation rather than hard bars. After generation, restore_framing
    cuts exactly the photo's area back out, so the result has the original
    framing and aspect ratio.
    """
    try:
        with Image.open(io.BytesIO(raw)) as img:
            # Phones store rotation in EXIF; browsers apply it when showing
            # the "Before" photo, so the model must see the same orientation.
            photo = ImageOps.exif_transpose(img).convert("RGB")
    except OSError as exc:
        raise HTTPException(status_code=400, detail="Could not read the room photo.") from exc

    if pinned_size in ("", "match", "auto"):
        canvas = _closest_supported(photo.width, photo.height)
    else:
        width, height = (int(part) for part in pinned_size.lower().split("x"))
        canvas = (width, height)

    scale = min(canvas[0] / photo.width, canvas[1] / photo.height)
    fitted_size = (round(photo.width * scale), round(photo.height * scale))
    left = (canvas[0] - fitted_size[0]) // 2
    top = (canvas[1] - fitted_size[1]) // 2

    padded = photo.resize(canvas, Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
    padded.paste(photo.resize(fitted_size, Image.LANCZOS), (left, top))

    buf = io.BytesIO()
    padded.save(buf, format="PNG")
    return PreparedEdit(
        png=buf.getvalue(),
        size=f"{canvas[0]}x{canvas[1]}",
        canvas=canvas,
        photo_box=(left, top, left + fitted_size[0], top + fitted_size[1]),
    )


def edit_region_mask(
    prepared: PreparedEdit,
    polygons: list[list[list[float]]],
    grow_px: int = 12,
    feather_px: int = 6,
) -> "Image.Image | None":
    """An L-mode mask on the prepared canvas: white (255) over the chosen
    object (grown a little so its edges/shadow are included, then feathered so
    the composite seam is soft), black (0) everywhere else. Polygons are
    percent of the ORIGINAL photo, mapped through the same padding
    prepare_for_edit applied. Used both to hint the model and, afterwards, to
    composite: only the white area takes the model's pixels."""
    from PIL import ImageDraw

    left, top, right, bottom = prepared.photo_box
    photo_w, photo_h = right - left, bottom - top
    area = Image.new("L", prepared.canvas, 0)
    draw = ImageDraw.Draw(area)
    drawn = False
    for polygon in polygons:
        if len(polygon) < 3:
            continue
        draw.polygon([(left + x / 100 * photo_w, top + y / 100 * photo_h) for x, y in polygon], fill=255)
        drawn = True
    if not drawn:
        return None

    area = area.filter(ImageFilter.MaxFilter(grow_px * 2 + 1))
    if feather_px:
        area = area.filter(ImageFilter.GaussianBlur(feather_px))
    return area


def build_object_mask(prepared: PreparedEdit, polygons: list[list[list[float]]], grow_px: int = 12) -> bytes | None:
    """An edit mask for gpt-image-1: transparent where the model may repaint
    (the chosen object), opaque everywhere else."""
    region = edit_region_mask(prepared, polygons, grow_px, feather_px=0)
    if region is None:
        return None
    alpha = region.point(lambda value: 0 if value > 127 else 255)  # edit area -> transparent
    mask = Image.new("RGBA", prepared.canvas, (0, 0, 0, 255))
    mask.putalpha(alpha)
    buf = io.BytesIO()
    mask.save(buf, format="PNG")
    return buf.getvalue()


def open_photo(raw: bytes) -> "Image.Image":
    """Decode a photo upright (EXIF rotation applied) as RGB."""
    try:
        with Image.open(io.BytesIO(raw)) as img:
            return ImageOps.exif_transpose(img).convert("RGB")
    except OSError as exc:
        raise HTTPException(status_code=400, detail="Could not read the room photo.") from exc


def object_crop_box(
    polygons: list[list[list[float]]], width: int, height: int, context: float = 1.2, min_side: float = 0.28
) -> tuple[int, int, int, int]:
    """A box around the object (percent polygons) with room around it for the
    model to see what the surroundings look like, shaped like one of the
    edit API's canvases so the crop needs no padding. Editing this crop
    instead of the whole photo means the model paints the object at 2-4x the
    resolution, so the result stays sharp instead of smeared."""
    xs = [x / 100 * width for polygon in polygons for x, _ in polygon]
    ys = [y / 100 * height for polygon in polygons for _, y in polygon]
    x0, x1, y0, y1 = max(0, min(xs)), min(width, max(xs)), max(0, min(ys)), min(height, max(ys))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w = max((x1 - x0) * (1 + 2 * context), min_side * min(width, height))
    h = max((y1 - y0) * (1 + 2 * context), min_side * min(width, height))

    # Match the nearest supported canvas shape (1:1, 2:3, 3:2).
    ratio = min((1.0, 2 / 3, 1.5), key=lambda r: abs(math.log((w / h) / r)))
    if w / h < ratio:
        w = h * ratio
    else:
        h = w / ratio
    w, h = min(w, width), min(h, height)

    left = min(max(0, cx - w / 2), width - w)
    top = min(max(0, cy - h / 2), height - h)
    return (round(left), round(top), round(left + w), round(top + h))


def paste_region_edit(
    photo: "Image.Image",
    box: tuple[int, int, int, int],
    prepared: PreparedEdit,
    region: "Image.Image",
    b64_payload: str,
) -> str:
    """Put the model's edit of the crop back into the full photo — ONLY through
    the object's (feathered) region. Every other pixel of the photo, including
    the rest of the crop, is left exactly as it was, so nothing outside the
    object can pick up the model's texture or resampling blur."""
    with Image.open(io.BytesIO(base64.b64decode(b64_payload))) as img:
        model_out = img.convert("RGB")
    if model_out.size != prepared.canvas:
        model_out = model_out.resize(prepared.canvas, Image.LANCZOS)

    crop_size = (box[2] - box[0], box[3] - box[1])
    edited = model_out.crop(prepared.photo_box).resize(crop_size, Image.LANCZOS)
    alpha = region.crop(prepared.photo_box).resize(crop_size, Image.LANCZOS)

    result = photo.copy()
    result.paste(edited, box[:2], alpha)
    buf = io.BytesIO()
    result.save(buf, format="JPEG", quality=95)
    return to_data_url(base64.b64encode(buf.getvalue()).decode("ascii"), "image/jpeg")


def composite_edit(b64_payload: str, prepared: PreparedEdit, region: "Image.Image") -> str:
    """gpt-image-1 restyles the WHOLE canvas even with a mask, so its
    "untouched" areas drift (the sketch/painterly texture). This takes the
    model's pixels ONLY inside the edited region and keeps the original photo
    everywhere else — so the rest of the room is pixel-identical to the input,
    never restyled — then crops back to the original framing."""
    with Image.open(io.BytesIO(base64.b64decode(b64_payload))) as img:
        model_out = img.convert("RGB")
    if model_out.size != prepared.canvas:
        model_out = model_out.resize(prepared.canvas, Image.LANCZOS)

    with Image.open(io.BytesIO(prepared.png)) as img:
        original = img.convert("RGB")

    combined = Image.composite(model_out, original, region)

    left, top, right, bottom = prepared.photo_box
    cropped = combined.crop((left, top, right, bottom))
    buf = io.BytesIO()
    cropped.save(buf, format="JPEG", quality=92)
    return to_data_url(base64.b64encode(buf.getvalue()).decode("ascii"), "image/jpeg")


def restore_framing(b64_payload: str, prepared: PreparedEdit) -> str:
    """Crop the model's output back to the original photo's area and return
    it as a JPEG data URL (photos compress far smaller than PNG, which
    matters because rooms store images inline)."""
    with Image.open(io.BytesIO(base64.b64decode(b64_payload))) as img:
        result = img.convert("RGB")

    # The output normally matches the requested size; scale the box in case
    # it doesn't, so the crop still lands on the same part of the frame.
    sx = result.width / prepared.canvas[0]
    sy = result.height / prepared.canvas[1]
    left, top, right, bottom = prepared.photo_box
    cropped = result.crop((round(left * sx), round(top * sy), round(right * sx), round(bottom * sy)))

    buf = io.BytesIO()
    cropped.save(buf, format="JPEG", quality=92)
    return to_data_url(base64.b64encode(buf.getvalue()).decode("ascii"), "image/jpeg")
