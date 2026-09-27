from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from app.services import product_catalog

router = APIRouter(prefix="/api/products", tags=["products"])


def _safe_fetch(category: str, size: int) -> list[dict]:
    try:
        return product_catalog.fetch_category(category, size)
    except Exception:  # one failing category should not blank the whole catalog
        return []


@router.get("")
async def list_products(category: str | None = None, q: str | None = None, limit: int = Query(24, ge=1, le=60)):
    """Real IKEA Thailand listings. `category` is a Roomie category id; omit it to get all of them."""
    if category:
        if category not in product_catalog.CATEGORY_QUERIES and not q:
            raise HTTPException(404, f"Unknown category: {category}")
        try:
            items = await run_in_threadpool(product_catalog.fetch_category, category, limit, q)
        except Exception as exc:
            raise HTTPException(502, f"Store lookup failed: {exc}") from exc
        return {"store": "IKEA Thailand", "items": items}

    def gather() -> list[dict]:
        with ThreadPoolExecutor(max_workers=6) as pool:
            batches = pool.map(lambda cat: _safe_fetch(cat, limit), product_catalog.CATEGORY_QUERIES)
        return [item for batch in batches for item in batch]

    items = await run_in_threadpool(gather)
    if not items:
        raise HTTPException(502, "Store lookup failed")
    return {"store": "IKEA Thailand", "items": items}
