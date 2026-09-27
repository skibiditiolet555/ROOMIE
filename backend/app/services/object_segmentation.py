"""Pixel-level object masks, run locally.

YOLOE (Ultralytics) is an open-vocabulary segmentation model: give it category
names ("sofa", "coffee table") and it returns a mask per match. It runs on
this machine's CPU, so segmenting costs nothing per call. OpenCV then reduces
each mask's contour to a compact polygon for the frontend to draw.

Which mask belongs to which item is decided by matching the category name and
the rough position GPT (or the Furnish step) gave, weighted by YOLOE's own
confidence.
"""

import io
import threading
from dataclasses import dataclass

from fastapi import HTTPException
from PIL import Image

from app.config import get_settings
from app.services.image_utils import decode_image

# What to ask YOLOE for, keyed by the words our items use. YOLOE follows
# plain nouns best, so "Wall art" becomes "framed picture", etc.
_PROMPTS = [
    (("nightstand", "bedside"), "nightstand"),
    (("coffee table", "center table"), "coffee table"),
    (("side table", "end table"), "side table"),
    (("dining table",), "dining table"),
    (("desk",), "desk"),
    (("sofa", "couch", "sectional"), "sofa"),
    (("armchair", "lounge chair", "chair", "stool"), "chair"),
    (("bed",), "bed"),
    (("tv stand", "tv bench", "media console", "television"), "tv stand"),
    (("bookshelf", "shelf", "shelving"), "shelf"),
    (("cabinet", "sideboard", "wardrobe", "dresser", "storage"), "cabinet"),
    (("rug", "carpet", "mat"), "rug"),
    (("floor lamp", "lamp", "lighting", "light"), "lamp"),
    (("plant", "tree", "flower"), "potted plant"),
    (("curtain", "drape"), "curtain"),
    (("mirror",), "mirror"),
    (("wall art", "art", "print", "frame", "picture", "poster", "painting"), "framed picture"),
    (("pouf", "pouffe", "ottoman", "cushion", "pillow"), "pouf"),
    (("bench",), "bench"),
]


def prompt_for(category: str, name: str = "") -> str:
    text = f"{category} {name}".lower()
    for keywords, prompt in _PROMPTS:
        if any(word in text for word in keywords):
            return prompt
    return (category or name or "furniture").lower()


@dataclass
class ItemQuery:
    id: str
    label: str
    x: float | None  # rough centre, percent of the photo
    y: float | None


_model = None
_model_classes: tuple[str, ...] = ()
_lock = threading.Lock()  # one CPU inference at a time


def _load_model():
    global _model
    if _model is not None:
        return _model
    try:
        from ultralytics import YOLOE
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Segmentation needs the 'ultralytics' package (pip install ultralytics opencv-python-headless).",
        ) from exc

    errors = []
    for name in (n.strip() for n in get_settings().yoloe_models.split(",") if n.strip()):
        try:
            _model = YOLOE(name)
            return _model
        except Exception as exc:  # noqa: BLE001 - try the next candidate weights
            errors.append(f"{name}: {exc}")
    raise HTTPException(status_code=503, detail="Could not load a YOLOE model. " + " | ".join(errors))


def _simplify(points, width: int, height: int) -> list[list[float]]:
    """Contour -> a few dozen polygon points, as percent of the photo."""
    import cv2
    import numpy as np

    contour = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
    epsilon = 0.004 * cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
    if len(approx) < 4:
        approx = contour.reshape(-1, 2)
    return [[round(float(x) / width * 100, 2), round(float(y) / height * 100, 2)] for x, y in approx]


def _detect(image: Image.Image, labels: list[str]) -> list[dict]:
    global _model_classes
    import cv2
    import numpy as np

    model = _load_model()
    wanted = tuple(sorted(set(labels)))
    with _lock:
        if wanted != _model_classes:
            model.set_classes(list(wanted), model.get_text_pe(list(wanted)))
            _model_classes = wanted
        result = model.predict(image, conf=0.03, verbose=False)[0]

    if result.masks is None or result.boxes is None:
        return []

    width, height = image.size
    detections = []
    for polygon, cls, conf in zip(result.masks.xy, result.boxes.cls.tolist(), result.boxes.conf.tolist()):
        if len(polygon) < 3:
            continue
        points = np.asarray(polygon, dtype=np.float32)
        detections.append({
            "label": list(wanted)[int(cls)],
            "score": float(conf),
            "polygon": _simplify(points, width, height),
            "pixels": points,
        })
    return detections


# Everything worth offering as "select this too" in a furnished room — not
# only what the redesign added. Always searched together with the items'
# own labels, so the class set (and its text embeddings) stays constant.
GENERIC_FURNITURE = [
    "sofa", "chair", "coffee table", "side table", "dining table", "desk", "bed", "nightstand",
    "shelf", "cabinet", "tv stand", "television", "rug", "lamp", "potted plant", "curtain",
    "mirror", "framed picture", "pouf", "bench", "vase", "clock",
]


def _box_iou(a: dict, b: dict) -> float:
    ax2, ay2, bx2, by2 = a["x"] + a["w"], a["y"] + a["h"], b["x"] + b["w"], b["y"] + b["h"]
    iw = max(0.0, min(ax2, bx2) - max(a["x"], b["x"]))
    ih = max(0.0, min(ay2, by2) - max(a["y"], b["y"]))
    inter = iw * ih
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union else 0.0


def _open(image_data: str) -> Image.Image:
    raw, _mime, _name = decode_image(image_data)
    try:
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except OSError as exc:
        raise HTTPException(status_code=400, detail="Could not read the photo.") from exc


def _box_of(polygon: list[list[float]]) -> dict[str, float]:
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    return {"x": min(xs), "y": min(ys), "w": max(xs) - min(xs), "h": max(ys) - min(ys)}


def segment_items(
    image_data: str,
    items: list[ItemQuery],
    min_extra_score: float = 0.2,
    original_data: str | None = None,
) -> tuple[dict[str, dict], list[dict]]:
    """(matched, extras).

    matched: one mask per item where YOLOE found a confident match; items with
    no match are simply absent — the caller shows them without an outline
    rather than drawing a guess.

    extras: every other confident furniture detection in the photo, so
    everything actually visible can be selected — not only what was listed.
    With original_data (the room before the AI redesign), each extra is
    marked existing=True if it was already in that photo, else it's something
    the redesign added."""
    import cv2

    image = _open(image_data)
    width, height = image.size
    labels = [item.label for item in items] + GENERIC_FURNITURE
    detections = _detect(image, labels)

    # Score every (item, detection) pair, then assign best-first so one mask
    # isn't claimed by two items of the same kind.
    pairs = []
    for item in items:
        for index, det in enumerate(detections):
            if det["label"] != item.label:
                continue
            proximity = 0.5
            if item.x is not None and item.y is not None:
                inside = cv2.pointPolygonTest(det["pixels"].reshape(-1, 1, 2), (item.x / 100 * width, item.y / 100 * height), True)
                cx = float(det["pixels"][:, 0].mean()) / width * 100
                cy = float(det["pixels"][:, 1].mean()) / height * 100
                distance = ((cx - item.x) ** 2 + (cy - item.y) ** 2) ** 0.5
                # Positions are often rough guesses, so distance only ranks
                # candidates (the nearest of two lamps wins) rather than
                # ruling a real match out.
                proximity = 1.0 if inside >= 0 else max(0.1, 1 - distance / 50)
            score = det["score"] * proximity
            if score < 0.05:  # too unsure to outline — better no outline than a wrong one
                continue
            pairs.append((score, item.id, index))

    matched: dict[str, dict] = {}
    used: set[int] = set()
    for _score, item_id, index in sorted(pairs, reverse=True):
        if item_id in matched or index in used:
            continue
        det = detections[index]
        xs = [p[0] for p in det["polygon"]]
        ys = [p[1] for p in det["polygon"]]
        matched[item_id] = {
            "polygon": det["polygon"],
            "score": round(det["score"], 3),
            "box": {"x": min(xs), "y": min(ys), "w": max(xs) - min(xs), "h": max(ys) - min(ys)},
        }
        used.add(index)

    # Second pass: an item whose guessed position was too far off to match
    # (plan positions are rough) still takes a confident, unclaimed mask of
    # the same kind — otherwise the real curtains/mirror show up twice: once
    # as "not in the photo" and once as a nameless extra.
    for item in items:
        if item.id in matched:
            continue
        candidates = [
            (det["score"], index)
            for index, det in enumerate(detections)
            if index not in used and det["label"] == item.label and det["score"] >= min_extra_score
        ]
        if not candidates:
            continue
        _score, index = max(candidates)
        det = detections[index]
        matched[item.id] = {"polygon": det["polygon"], "score": round(det["score"], 3), "box": _box_of(det["polygon"])}
        used.add(index)

    # Leftovers become "select this too" candidates — unless they're really
    # the same object as one already matched (a second, overlapping mask).
    taken_boxes = [m["box"] for m in matched.values()]
    extras: list[dict] = []
    for index, det in enumerate(detections):
        if index in used or det["score"] < min_extra_score:
            continue
        xs = [p[0] for p in det["polygon"]]
        ys = [p[1] for p in det["polygon"]]
        box = {"x": min(xs), "y": min(ys), "w": max(xs) - min(xs), "h": max(ys) - min(ys)}
        if box["w"] * box["h"] < 0.4:  # a speck, under ~0.4% of the photo
            continue
        if any(_box_iou(box, other) > 0.45 for other in taken_boxes):
            continue
        taken_boxes.append(box)
        extras.append({"label": det["label"], "score": round(det["score"], 3), "polygon": det["polygon"], "box": box, "existing": False})

    # Was each extra already in the room before the redesign? Look for the same
    # kind of object in about the same place in the original photo (the
    # redesign keeps the camera, so positions line up).
    if original_data and extras:
        try:
            original = _open(original_data)
            before = [
                (det["label"], _box_of(det["polygon"]))
                for det in _detect(original, labels)
                if det["score"] >= min_extra_score
            ]
            for extra in extras:
                extra["existing"] = any(
                    label == extra["label"] and _box_iou(box, extra["box"]) > 0.3 for label, box in before
                )
        except HTTPException:
            pass  # unreadable original: treat everything as added
    return matched, extras
