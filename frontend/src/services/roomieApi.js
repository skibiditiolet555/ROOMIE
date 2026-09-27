const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.detail || `Request failed (${res.status})`)
  }

  return res.json()
}

/** Original photo + chosen style + user brief -> finished design image (data URL). */
export function generateDesign({ image, style, prompt, budget, categories }) {
  return post('/api/design/generate', { image, style, prompt, budget, categories })
}

/** Free-form tweak to an existing design. */
export function refineDesign({ image, instruction, style }) {
  return post('/api/design/refine', { image, instruction, style })
}

/**
 * List shoppable items for a room, or a renovation plan if it's already
 * furnished. Pass every photo the user uploaded (different angles) — the
 * backend examines them all together to judge the room's real condition.
 * Falls back to text-only demo suggestions if no photos are given or the
 * vision call fails; check the response's `source` ("ai_vision" | "demo").
 */
export function detectItems({ images = [], budget, currency = 'THB', style, prompt, roomCategory }) {
  return post('/api/items/detect', {
    images,
    budget,
    currency,
    style,
    prompt,
    room_category: roomCategory,
  })
}

/** Swap one rejected item for an alternative, optionally re-rendering the room. */
export function regenerateItem({ image, item, style, budgetRemaining, exclude = [], rerender = true }) {
  return post('/api/items/regenerate', {
    image,
    item,
    style,
    budget_remaining: budgetRemaining,
    exclude,
    rerender,
  })
}

/** Remove an item and re-render the room without it. */
export function deleteItem({ image, item, style, rerender = true }) {
  return post('/api/items/delete', { image, item, style, rerender })
}

export function checkHealth() {
  return fetch(`${BASE_URL}/health`).then((res) => res.json())
}

/** Geometry for the photo currently displayed, independent of the shopping plan. */
export function locateItems(image, items) {
  return post('/api/items/locate', {
    image,
    items: items.map(({ id, name }) => ({ id, name })),
  })
}
