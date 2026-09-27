# Roomie AI Backend

FastAPI service that does the AI work for the Roomie frontend: turning a photo of
a real room into a finished design, then letting the user swap or remove
individual pieces.

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env         # macOS/Linux: cp .env.example .env
```

Put your OpenAI key in `.env`, then run:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

The frontend calls it through `src/services/roomieApi.js`, which points at
`http://localhost:8000` by default (override with `VITE_API_URL`).

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | Config check — is the key set, which models are in use |
| `POST` | `/api/design/generate` | Original photo + style + brief -> finished design |
| `POST` | `/api/design/refine` | Apply one free-form change to a design |
| `POST` | `/api/items/detect` | List the shoppable items in a design, with prices |
| `POST` | `/api/items/regenerate` | Swap one rejected item, re-render the room |
| `POST` | `/api/items/delete` | Remove one item, re-render the room without it |

Images go in and out as data URLs (`data:image/png;base64,...`), which is what
the frontend already stores, so no file handling is needed on either side.

## Models

Set in `.env` so you can change them without touching code:

- `OPENAI_IMAGE_MODEL` (default `gpt-image-1`) — generation and editing
- `OPENAI_TEXT_MODEL` (default `gpt-4.1`) — vision + structured item lists

## A note on prices and retailers

Item prices, store names and search terms come from the model. They are
**estimates, not live listings** — the API deliberately returns a `search_query`
per item instead of a product URL, so the frontend can link to the retailer's own
search results rather than to a made-up product page. Wiring in real listings
would mean integrating each retailer's product/affiliate API.
