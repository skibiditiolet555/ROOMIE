import { backendUrl } from './backendUrl'

export const api = {
  async post(path, body, { timeoutMs } = {}) {
    const controller = timeoutMs ? new AbortController() : null
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    let res
    try {
      res = await fetch(backendUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller?.signal,
      })
    } catch (error) {
      if (controller?.signal.aborted) throw new Error('คำขอใช้เวลานานเกินไป กรุณาลองอีกครั้ง')
      throw error
    } finally {
      if (timeout) clearTimeout(timeout)
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => null)
      throw new Error(detail?.detail || `Request failed (${res.status})`)
    }
    return res.json()
  },
}

// GPT compares the before/after photos and lists what the redesign ADDED;
// the backend then cuts each one out with local YOLOE segmentation. Objects
// come back with an `outline` ([[x%, y%], ...]) only when a real mask was
// found — never a guessed box.
export async function detectObjects({ image, originalImage, budget, style }) {
  const result = await api.post('/api/decisions/detect', {
    image_url: image,
    original_image_url: originalImage || null,
    budget,
    style,
  })
  return {
    objects: result.objects.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      x: item.x,
      y: item.y,
      outline: item.outline ?? undefined,
      traced: Boolean(item.outline),
    })),
  }
}

// Pixel-level outlines for objects we already know about (e.g. from the
// Furnish step) — free, runs on the backend machine, no OpenAI call.
export async function segmentObjects({ image, objects, originalImage = null }) {
  const result = await api.post('/api/decisions/segment', {
    image_url: image,
    original_image_url: originalImage,
    items: objects.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category ?? '',
      label: item.yoloLabel ?? null,
      x: item.x ?? null,
      y: item.y ?? null,
    })),
  })
  return {
    found: Object.fromEntries(result.objects.map((item) => [item.id, item])),
    // Other furniture in the photo (already in the room, not just what the AI
    // added) so it can be selected as well.
    extras: result.extras ?? [],
  }
}
