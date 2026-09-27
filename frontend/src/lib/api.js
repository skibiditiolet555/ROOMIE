import { backendHeaders, backendUrl } from './backendUrl'

export const api = {
  async post(path, body, { timeoutMs } = {}) {
    const controller = timeoutMs ? new AbortController() : null
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    let res
    try {
      res = await fetch(backendUrl(path), {
        method: 'POST',
        headers: backendHeaders(),
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

// GPT compares before/after photos and lists what the redesign ADDED. Fine
// object outlines are traced in the browser with SlimSAM/MediaPipe.
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

// Pixel-level outlines run locally in the browser; Supabase Edge Functions
// do not host the YOLOE/PyTorch model used by the former Python API.
export async function segmentObjects({ image, objects, originalImage = null }) {
  const { segmentAtPoint } = await import('../utils/segmentation')
  const img = new Image()
  img.src = image
  await img.decode()
  const traced = await Promise.all(objects.map(async (item) => {
    const x = Number(item.x ?? (item.bbox ? item.bbox.x + item.bbox.w / 2 : 50)) / 100
    const y = Number(item.y ?? (item.bbox ? item.bbox.y + item.bbox.h / 2 : 50)) / 100
    try {
      const outline = await segmentAtPoint(img, x, y, item.name, item.bbox ?? null)
      return [item.id, { id: item.id, matched: true, outline, score: null }]
    } catch {
      return [item.id, { id: item.id, matched: false, outline: null, score: null }]
    }
  }))
  return {
    found: Object.fromEntries(traced),
    extras: [],
  }
}
