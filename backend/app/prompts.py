"""Every prompt the AI sees, in one place.

Tune wording here; no other file needs to change.

Image model (gpt-image-1 edit endpoint), used by services/design_service.py:
    LOCK_FRAME, KEEP_EXISTING, generation_prompt, refine_prompt,
    removal_instruction, replacement_instruction

Text/vision models, used by services/item_service.py:
    VISION_DETECT_SYSTEM  + vision_detect_user_text   (OpenAI, looks at photos)
    DEMO_DETECT_SYSTEM    + demo_detect_user_text     (Groq, text only fallback)
    ALTERNATIVE_SYSTEM    + alternative_user_text     (OpenAI, swap one item)

The JSON shape the text models must return is NOT defined here — it lives in
the schemas at the top of services/item_service.py. Prompts that mention
"renovation_plan" or "room_condition" refer to fields in those schemas.
"""

# ---------------------------------------------------------------------------
# Shared building blocks
# ---------------------------------------------------------------------------

PRICE_HONESTY = (
    "Prices are honest ESTIMATES in Thai Baht for a Thai shopper, never exact "
    "quotes. Never invent product URLs or SKUs. Prefer plain descriptive names "
    "(e.g. 'Grey 3-seat fabric sofa'); only use a retailer's own product-line "
    "name if you are confident it really exists."
)

ITEM_FORMAT = (
    "For every item give: a short product name, the retailer most likely to "
    "stock something like it, a realistic price estimate in THB, one short "
    "line on material/colour/size, and search terms that would find it on that "
    "retailer's site."
)

# Only usable when the model actually has a photo in front of it (vision
# calls) — lets the frontend highlight each item directly on the room photo
# instead of guessing a layout.
BBOX_FORMAT = (
    "For every item, also give its bbox: where it sits in the FIRST photo you "
    "were shown, as percentages of that photo's width and height (x = left "
    "edge, y = top edge, w = width, h = height, each 0-100, (0,0) at the "
    "photo's top-left corner). If the item is already visible in that photo, "
    "locate it as precisely as you can. If it's a newly proposed item, "
    "estimate a sensible spot for it in the room shown in that photo (bare "
    "floor, an empty corner, a blank wall) — keep each item's bbox from "
    "needlessly overlapping another item's.\n\n"
    "Also give an outline: 12-24 points tracing the item's real visible "
    "silhouette (not just its bounding box), in order around the shape, each "
    "as {x, y} percentages in that same photo. Follow the actual edge — round "
    "a curved backrest, place points on visible legs rather than boxing them "
    "in, cut in around handles and dipped cushions. Put more points where the "
    "edge turns a corner, fewer along a straight run. For a newly proposed "
    "item, trace an equally careful silhouette for that kind of object at the "
    "spot and scale you chose."
)


def budget_sentence(budget: float | None, *, keep_total_close: bool = False) -> str:
    if not budget:
        return "No budget was given, so keep prices realistic for the Thai market."
    text = f"The client's total budget is about {budget:,.0f} THB."
    if keep_total_close:
        text += " Keep the combined estimate close to it, without going over."
    return text


# ---------------------------------------------------------------------------
# Image model — redesign / edit a room photo
# ---------------------------------------------------------------------------

# Image-edit models weight the opening and closing lines most heavily, so the
# framing rule is stated at both ends of generation_prompt.
#
# NOTE: wording alone cannot hold the framing. If the requested output size
# doesn't match the photo's aspect ratio, the model re-crops the room to fit
# and it reads as a zoom — see image_utils.prepare_for_edit. Fidelity to the
# input photo is mostly controlled by input_fidelity (see config.py), not by
# prompt wording.
LOCK_FRAME = (
    "The result must be the SAME PHOTOGRAPH as the input, edited in place — "
    "not a new photo of a similar room. Match the input "
    "exactly: same camera position, same height, same angle, same lens and "
    "field of view, same distance from every wall, same framing and crop, "
    "same aspect ratio. Do NOT zoom in or out. Do NOT pan, tilt, rotate, or "
    "re-frame. Do NOT crop in or widen the shot. Every fixed part of the room "
    "must stay at the exact same position and size within the frame: walls, "
    "floor, ceiling, corners, windows, doors, and built-in fixtures. If the "
    "result were laid over the original, every edge of the room would line up."
)

KEEP_EXISTING = (
    "Keep everything that is already in the photo. Every piece of furniture "
    "and object already visible stays exactly where it is, at the same size, "
    "in the same colour and material. Do NOT remove, move, resize, replace, "
    "or restyle anything that is already there, and do NOT repaint walls, "
    "floors, or ceilings. You are ADDING to this room, not redecorating it."
)

RETURN_PHOTO = "Return a photorealistic interior photograph. No text, labels, or watermarks."


def generation_prompt(
    style: str,
    brief: str,
    budget: float | None,
    categories: list[str] | None = None,
) -> str:
    guidance = [f"a {style} style"]
    if brief:
        guidance.append(f'the client\'s description: "{brief}"')
    if budget:
        guidance.append(
            f"a budget of about {budget:,.0f} THB (choose pieces that are "
            "realistic at that price)"
        )

    category_labels = {
        "furniture": "furniture",
        "flooring": "flooring and area rugs",
        "curtains": "curtains and window coverings",
        "lighting": "lighting",
        "decor": "decorations and wall art",
    }
    selected_categories = categories or list(category_labels)
    allowed_items = [category_labels.get(category, category) for category in selected_categories]

    return "\n\n".join(
        [
            "You are editing a photo of a REAL, existing room to show how it "
            "will look after a renovation that ADDS new furniture and decor. "
            "The photo is the single source of truth for the room itself.",
            LOCK_FRAME,
            KEEP_EXISTING,
            "Into the empty space that is left — bare floor, bare walls, empty "
            "corners — ADD only these selected types of objects: "
            + ", ".join(allowed_items)
            + ". Do not add any object from an unselected category. Choose them from "
            + ", ".join(guidance)
            + ". Treat that strictly as guidance for WHICH new pieces to add. "
            "It is NOT permission to change the room, the camera, or anything "
            "already in the photo.",
            "Each added piece must rest naturally on the existing floor, sit "
            "in correct perspective for this camera angle, be scaled correctly "
            "against the room and the furniture already there, and be lit by "
            "the room's existing light with matching shadows and reflections. "
            "Do not block or hide windows and doors. Leave sensible walking "
            "space; an uncluttered result is better than an overfilled one.",
            RETURN_PHOTO
            + " IMPORTANT: this is the original photograph with new furniture "
            "added. The camera, framing, zoom, perspective and architecture are "
            "identical to the original, and everything already in the room is "
            "untouched.",
        ]
    )


def refine_prompt(style: str, instruction: str) -> str:
    return "\n\n".join(
        [
            f"Edit this {style} interior photo. {instruction}",
            "Change nothing else. Layout, walls, floor, ceiling, windows, "
            "doors, lighting and every other piece of furniture stay exactly "
            "as they are.",
            LOCK_FRAME,
            RETURN_PHOTO,
        ]
    )


def removal_instruction(item_name: str, category: str) -> str:
    return (
        f"Remove the {item_name} ({category}) completely from the room and fill "
        "the space naturally with the existing floor and background, matching "
        "their texture, colour and lighting."
    )


def replacement_instruction(old_name: str, new_name: str, category: str) -> str:
    return (
        f"Replace the {old_name} with a {new_name} instead. It is the same "
        f"{category} slot in the room, so keep it in the same position, scale "
        "and orientation, and light it consistently with the rest of the room."
    )


# ---------------------------------------------------------------------------
# Vision model — inspect the photos, then list items or plan a renovation
# ---------------------------------------------------------------------------

VISION_DETECT_SYSTEM = (
    "You are an expert interior designer helping a Thai client.\n\n"
    "You will be shown one or more photos of the SAME real room, taken from "
    "different angles. Study EVERY photo before deciding anything: note the "
    "room's size, layout, windows, floor, walls, lighting, and each piece of "
    "furniture you can actually see. Different photos are different views of "
    "one room — never count the same object twice, and never assume anything "
    "that no photo shows.\n\n"
    "Step 1 — judge the room's condition honestly:\n"
    "- \"empty\": there is no substantial furniture (no bed, sofa, table, "
    "wardrobe, desk or similar). Small clutter, boxes or a rug do not count.\n"
    "- \"furnished\": there is at least some substantial furniture in use.\n\n"
    "Step 2 — act on it:\n"
    "- If EMPTY: propose a complete furnishing list for the room in the "
    "target style, following the client's brief and sized for the space you "
    "can see. Cover furniture, flooring and curtains at minimum. Set "
    "renovation_plan to an empty string.\n"
    "- If FURNISHED: act as a renovation consultant. Write a short, specific "
    "renovation_plan (2-4 sentences) that refers to what is really in the "
    "photos and says what to keep, what to change and what to add to move the "
    "room toward the client's brief and target style. Then list ONLY the new "
    "or replacement items needed to carry out that plan. Do not list things "
    "that are already fine, and do not re-furnish the whole room.\n\n"
    "Always follow the client's brief where it is specific, and respect the "
    "budget. Aim for roughly 5-10 well-chosen items rather than a long list.\n\n"
    + ITEM_FORMAT
    + " "
    + BBOX_FORMAT
    + " "
    + PRICE_HONESTY
)


def vision_detect_user_text(
    image_count: int,
    room_category: str,
    style: str,
    brief: str,
    budget: float | None,
) -> str:
    brief_text = f" The client's brief: {brief}." if brief else ""
    return (
        f"These are {image_count} photo(s) of the same {room_category}, taken "
        "from different angles — look at all of them before deciding anything. "
        f"Target style: {style}.{brief_text} {budget_sentence(budget)}"
    )


# ---------------------------------------------------------------------------
# Text-only fallback — no photos, used when vision isn't available
# ---------------------------------------------------------------------------

DEMO_DETECT_SYSTEM = (
    "You generate a plausible DEMO shopping list of interior items for a Thai "
    "client, based only on a style description — you are NOT looking at any "
    "photo, so do not claim to know what the room contains or looks like. "
    "Cover furniture, flooring and curtains at minimum, and aim for roughly "
    "5-10 items. "
    + ITEM_FORMAT
    + " "
    + PRICE_HONESTY
)


def demo_detect_user_text(
    style: str, room_category: str, brief: str, budget: float | None
) -> str:
    brief_text = f" The client asked for: {brief}." if brief else ""
    return (
        f"Suggest items for a {style} {room_category}.{brief_text} "
        f"{budget_sentence(budget, keep_total_close=True)}"
    )


# ---------------------------------------------------------------------------
# Swap one item the client rejected
# ---------------------------------------------------------------------------

ALTERNATIVE_SYSTEM = (
    "You suggest ONE replacement interior product for a Thai client who "
    "rejected an item in their room. Look at the room photo so the new piece "
    "fits its style, colours and scale, and place it in the same spot as the "
    "rejected item. It must be clearly different from the rejected item and "
    "from every name you were told not to repeat. "
    + ITEM_FORMAT
    + " "
    + PRICE_HONESTY
)


def alternative_user_text(
    item_name: str,
    category: str,
    style: str,
    budget_remaining: float | None,
    excluded: list[str],
) -> str:
    lines = [
        f"The client rejected the {item_name} ({category}) in this room. "
        f"Suggest a different {category} instead.",
        f"It must still suit a {style} room and fit the same spot.",
    ]
    if budget_remaining is not None:
        lines.append(f"Aim to stay within about {budget_remaining:,.0f} THB for this piece.")
    lines.append("Do not suggest any of these again: " + ", ".join([item_name, *excluded]))
    return "\n".join(lines)
