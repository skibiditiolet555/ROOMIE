from fastapi import APIRouter

from app.schemas import DesignResponse, GenerateDesignRequest, RefineDesignRequest
from app.services import design_service

router = APIRouter(prefix="/api/design", tags=["design"])


@router.post("/generate", response_model=DesignResponse)
async def generate(payload: GenerateDesignRequest) -> DesignResponse:
    """Original room photo + chosen style + the user's brief -> finished design."""
    image = await design_service.generate_design(
        image=payload.image,
        style=payload.style,
        prompt=payload.prompt,
        budget=payload.budget,
        categories=payload.categories,
    )
    return DesignResponse(image=image)


@router.post("/refine", response_model=DesignResponse)
async def refine(payload: RefineDesignRequest) -> DesignResponse:
    """Apply a free-form tweak to an existing design, e.g. 'make the rug darker'."""
    image = await design_service.refine_design(
        image=payload.image,
        instruction=payload.instruction,
        style=payload.style,
    )
    return DesignResponse(image=image)
