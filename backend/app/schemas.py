from typing import Literal

from pydantic import BaseModel, Field

ItemCategory = Literal["furniture", "flooring", "curtains", "lighting", "decor"]


class BoundingBox(BaseModel):
    """Where an item sits in the first room photo, as percentages (0-100) of
    that photo's width/height — x/y is the top-left corner."""

    x: float
    y: float
    w: float
    h: float


class OutlinePoint(BaseModel):
    """One point on an item's estimated silhouette, as percentages (0-100) of
    the first photo's width/height. This is the vision model's best guess at
    the item's outline from a single 2D photo, NOT real pixel-level
    segmentation (that needs a dedicated segmentation model, e.g. SAM) — it
    can miss curves and fine detail."""

    x: float
    y: float


class Item(BaseModel):
    """A single shoppable piece the AI spotted in (or suggested for) the design."""

    id: str
    name: str
    category: ItemCategory
    description: str = ""
    # Retailer the AI thinks carries something like this. Prices are ESTIMATES
    # produced by the model, not live listings — see search_query.
    source: str = "Other"
    price_estimate: float = 0
    currency: str = "THB"
    # Query the frontend can drop into the retailer's own search to find the
    # real product, instead of us inventing a product URL.
    search_query: str = ""
    # Only set when vision actually looked at a photo (see
    # item_service.detect_items_vision) — an AI-estimated location for this
    # item, real if it's already visible in the photo, a sensible guess if
    # it's a newly proposed piece. None for the text-only demo fallback.
    bbox: BoundingBox | None = None
    # Same caveat as bbox: an approximation, only from vision calls. A
    # polygon (in order around the shape) so the frontend can highlight
    # roughly the item's real outline instead of a rectangle.
    outline: list[OutlinePoint] | None = None


class GenerateDesignRequest(BaseModel):
    image: str = Field(..., description="Original room photo as a data URL or bare base64")
    style: str = Field("Modern", description="Theme the user picked, e.g. Modern / Cozy")
    prompt: str = Field("", description="What the user asked for in their own words")
    budget: float | None = Field(None, description="Total budget in THB, for realism")
    categories: list[ItemCategory] = Field(
        default_factory=lambda: ["furniture", "flooring", "curtains", "lighting", "decor"],
        description="Types of new room items the design may add",
    )


class RefineDesignRequest(BaseModel):
    image: str = Field(..., description="Current design image as a data URL or bare base64")
    instruction: str = Field(..., description="What to change, e.g. 'remove the floor lamp'")
    style: str = "Modern"


class DesignResponse(BaseModel):
    image: str = Field(..., description="Result as a data URL, ready for <img src>")


class DetectItemsRequest(BaseModel):
    # All photos the user uploaded of the room (different angles). When
    # OpenAI vision is available, every one of these is examined together
    # so the AI can judge the room's actual condition and layout instead of
    # guessing from a single shot. Falls back to text-only demo suggestions
    # (see app/services/item_service.py) if no photos are given or the
    # vision call fails (e.g. no OpenAI credits).
    images: list[str] = Field(default_factory=list, description="Room photos as data URLs or bare base64")
    style: str = "Modern"
    prompt: str = Field("", description="The user's design brief, for context")
    room_category: str = Field("Room", description="e.g. Living Room, Bedroom")
    budget: float | None = None
    currency: str = "THB"


class DetectItemsResponse(BaseModel):
    items: list[Item]
    total_estimate: float
    currency: str = "THB"
    # "ai_vision": the model actually looked at the uploaded photos.
    # "demo": text-only fallback — no photo analysis happened (see
    # DetectItemsRequest.images and item_service.detect_items_demo).
    source: Literal["ai_vision", "demo"] = "demo"
    # Only meaningful when source == "ai_vision": whether the AI judged the
    # room to already contain furniture ("furnished") or not ("empty").
    room_condition: Literal["empty", "furnished", "unknown"] = "unknown"
    # When room_condition == "furnished", the AI's plan for renovating what's
    # already there to match the user's brief, rather than just a shopping list.
    renovation_plan: str = ""


class RegenerateItemRequest(BaseModel):
    image: str = Field(..., description="Current design image")
    item: Item = Field(..., description="The item the user wants swapped")
    style: str = "Modern"
    budget_remaining: float | None = None
    exclude: list[str] = Field(default_factory=list, description="Names already rejected")
    # When true the room image is re-rendered with the replacement in place.
    rerender: bool = True


class RegenerateItemResponse(BaseModel):
    item: Item
    image: str | None = None


class DeleteItemRequest(BaseModel):
    image: str = Field(..., description="Current design image")
    item: Item = Field(..., description="The item to remove from the room")
    style: str = "Modern"
    rerender: bool = True


class DeleteItemResponse(BaseModel):
    removed_id: str
    image: str | None = None


class AuthUser(BaseModel):
    id: str
    email: str
    name: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


class VerifyEmailRequest(BaseModel):
    email: str


class VerifyEmailResponse(BaseModel):
    exists: bool


class SetPasswordRequest(BaseModel):
    email: str
    new_password: str
