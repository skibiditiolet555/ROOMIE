"""Live product listings from IKEA Thailand (real names, prices, photos, product pages).

Uses the same public search endpoint the ikea.com/th site itself calls. Results
are cached in memory so a browsing session does not hammer it. Nothing here is
invented: every field comes straight from the store's response.
"""
import re
import time

import httpx

SEARCH_URL = "https://sik.search.blue.cdtapps.com/th/th/search?c=listaf&v=20240110"
SEARCH_URL_EN = "https://sik.search.blue.cdtapps.com/th/en/search?c=listaf&v=20240110"
CACHE_SECONDS = 60 * 60

# Roomie category id -> IKEA search phrase.
CATEGORY_QUERIES = {
    "sofa": "sofa",
    "chair": "armchair",
    "coffee-table": "coffee table",
    "side-table": "side table",
    "dining-table": "dining table",
    "desk": "desk",
    "cabinet": "storage cabinet",
    "shelf": "bookcase",
    "television": "tv unit",
    "bed": "bed frame",
    "nightstand": "bedside table",
    "rug": "rug",
    "lamp": "floor lamp",
    "plant": "artificial plant",
    "curtain": "curtain",
    "mirror": "mirror",
    "wall-art": "picture frame",
    "ottoman": "footstool",
    "bench": "bench",
}

_cache: dict[tuple[str, int], tuple[float, list[dict]]] = {}


def _payload(query: str, size: int) -> dict:
    return {
        "searchParameters": {"input": query, "type": "QUERY"},
        "zip": "10110",
        "store": "",
        "isUserLoggedIn": False,
        "optimizely": {},
        "components": [{
            "component": "PRIMARY_AREA",
            "columns": 4,
            "types": {"main": "PRODUCT", "breakouts": []},
            "filterConfig": {"max-num-filters": 0},
            "window": {"size": size, "offset": 0},
            "forceFilterCalculation": True,
        }],
    }


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _normalize(category: str, product: dict) -> dict | None:
    price = (product.get("salesPrice") or {}).get("numeral")
    url = product.get("pipUrl")
    image = product.get("mainImageUrl")
    if not price or not url or not image or not product.get("onlineSellable", True):
        return None
    colors = product.get("colors") or []
    type_name = (product.get("typeName") or "").strip()
    name = (product.get("name") or "").strip()
    variant = (product.get("validDesignText") or "").strip()
    measure = (product.get("itemMeasureReferenceText") or "").strip()
    return {
        "id": f"ikea-{product.get('itemNoGlobal') or product.get('id')}",
        "category": category,
        "name": f"{name} {type_name}".strip(),
        "en": _slug(url.rsplit("/p/", 1)[-1]).replace("-", " "),
        "description": ", ".join(part for part in (type_name, variant) if part),
        "price": int(round(price)),
        "store": "IKEA",
        "size": measure or variant,
        "image_url": image,
        "url": url,
        "swatch": f"#{colors[0]['hex']}" if colors and colors[0].get("hex") else None,
        "rating": product.get("ratingValue"),
        "in_stock": True,
    }


def fetch_category(category: str, size: int = 24, query: str | None = None) -> list[dict]:
    phrase = query or CATEGORY_QUERIES.get(category)
    if not phrase:
        return []
    key = (f"{category}:{phrase}", size)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]

    def load(locale_url: str, count: int = size) -> list[dict]:
        response = httpx.post(locale_url, json=_payload(phrase, count), timeout=25, headers={"Accept": "application/json"})
        response.raise_for_status()
        results = response.json().get("results") or []
        items = results[0].get("items", []) if results else []
        return [
            row for row in (_normalize(category, item.get("product") or {}) for item in items if item.get("product"))
            if row
        ]

    products = load(SEARCH_URL)
    # Same products from the English site, so the UI can show English names and pages.
    try:
        english = {row["id"]: row for row in load(SEARCH_URL_EN, min(size * 4, 60))}
    except Exception:
        english = {}
    for row in products:
        match = english.get(row["id"])
        if match:
            row["name_en"] = match["name"]
            row["description_en"] = match["description"]
            row["size_en"] = match["size"]
            row["url_en"] = match["url"]
        else:
            # The English site ranks differently, so fall back to the English
            # words already in the product page's own URL slug.
            slug = row["url"].rsplit("/p/", 1)[-1].strip("/")
            words = re.sub(r"-\d{6,}$", "", slug).split("-")
            row["name_en"] = " ".join([words[0].upper(), *words[1:]])
            row["description_en"] = ""
            row["size_en"] = ""
            row["url_en"] = row["url"].replace("/th/th/p/", "/th/en/p/")
    _cache[key] = (time.time(), products)
    return products
