import { FilesetResolver, InteractiveSegmenter } from '@mediapipe/tasks-vision'
import { frameOutline, imageKey, maskToOutline } from './selectionGeometry'

// ── Primary: SlimSAM (a compressed Segment Anything) ─────────────────────
// Runs entirely in the browser via Transformers.js — no server, no API key,
// no per-use cost. Unlike a "magic wand", SAM separates the clicked *object*
// from what it sits against, so a sofa doesn't bleed into the wall behind it.
// The model downloads once and is cached by the browser afterwards.
const SAM_MODEL = 'Xenova/slimsam-77-uniform'
let samPromise

function getSam() {
  if (!samPromise) {
    samPromise = import('@huggingface/transformers').then(async (tf) => {
      const device = typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'wasm'
      const [model, processor] = await Promise.all([
        tf.SamModel.from_pretrained(SAM_MODEL, { device }),
        tf.AutoProcessor.from_pretrained(SAM_MODEL),
      ])
      return { tf, model, processor }
    }).catch((error) => { samPromise = null; throw error })
  }
  return samPromise
}

// Encoding the image is the slow part (seconds); clicking an object after
// that is fast. Embeddings are kept per image so every further click — and
// every object the Decision page traces on the same photo — reuses them.
const embeddingCache = new Map()

async function embeddingsFor(sam, image) {
  const key = imageKey(image.currentSrc || image.src)
  if (!embeddingCache.has(key)) {
    if (embeddingCache.size >= 3) embeddingCache.delete(embeddingCache.keys().next().value)
    embeddingCache.set(key, (async () => {
      const raw = await sam.tf.RawImage.fromURL(image.currentSrc || image.src)
      const inputs = await sam.processor(raw)
      return { raw, embeddings: await sam.model.get_image_embeddings(inputs) }
    })().catch((error) => { embeddingCache.delete(key); throw error }))
  }
  return embeddingCache.get(key)
}

async function segmentWithSam(image, x, y, box) {
  const sam = await getSam()
  const { raw, embeddings } = await embeddingsFor(sam, image)
  // A box (the object's known extent, in percent of the photo) removes the
  // "which level did you mean?" ambiguity of a single click — a click on a
  // sofa can mean the cushion, the sofa, or the sofa and table together.
  // (This Transformers.js build rejects box-only prompts, so the box is sent
  // the way SAM encodes one internally: its two corners as points labelled
  // 2 = top-left and 3 = bottom-right.)
  const prompt = box
    ? {
      input_points: [[[
        [(box.x / 100) * raw.width, (box.y / 100) * raw.height],
        [((box.x + box.w) / 100) * raw.width, ((box.y + box.h) / 100) * raw.height],
      ]]],
      input_labels: [[[2, 3]]],
    }
    : { input_points: [[[x * raw.width, y * raw.height]]] }
  const inputs = await sam.processor(raw, prompt)
  const outputs = await sam.model({ ...embeddings, ...inputs })
  const [masks] = await sam.processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)

  // SAM proposes three nested masks per prompt; take the one it is most
  // confident in.
  const scores = Array.from(outputs.iou_scores.data)
  const [, , height, width] = masks.dims
  const size = width * height
  let best = scores.indexOf(Math.max(...scores))

  if (box) {
    // For a thin object inside a mostly-wall box, SAM's most confident mask
    // can be the wall itself. A mask that spills well outside the box can't
    // be the object it was given, so only accept ones that stay within it.
    const slackX = (box.w / 100) * width * 0.15
    const slackY = (box.h / 100) * height * 0.15
    const left = (box.x / 100) * width - slackX
    const right = ((box.x + box.w) / 100) * width + slackX
    const top = (box.y / 100) * height - slackY
    const bottom = ((box.y + box.h) / 100) * height + slackY
    const fits = scores.map((_, index) => {
      const start = index * size
      for (let py = 0; py < height; py += 2) {
        for (let px = 0; px < width; px += 2) {
          if (masks.data[start + py * width + px] && (px < left || px > right || py < top || py > bottom)) return false
        }
      }
      return true
    })
    const valid = scores.map((score, index) => (fits[index] ? index : -1)).filter((index) => index >= 0)
    if (!valid.length) {
      const rejected = new Error('The object could not be isolated inside its box.')
      rejected.isRejection = true // SAM ran fine — don't fall back to a worse model
      throw rejected
    }
    best = valid.reduce((a, b) => (scores[b] > scores[a] ? b : a))
  }
  const plane = masks.data.subarray(best * size, (best + 1) * size)
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) mask[i] = plane[i] ? 1 : 0
  // The seed for the connected-region search must be inside the mask; with a
  // box prompt the box centre may not be, so use the mask's own densest spot
  // nearest the requested point.
  let sx = x
  let sy = y
  if (!mask[Math.min(height - 1, Math.floor(y * height)) * width + Math.min(width - 1, Math.floor(x * width))]) {
    let bestDistance = Infinity
    for (let py = 0; py < height; py += 4) {
      for (let px = 0; px < width; px += 4) {
        if (!mask[py * width + px]) continue
        const distance = (px / width - x) ** 2 + (py / height - y) ** 2
        if (distance < bestDistance) { bestDistance = distance; sx = px / width; sy = py / height }
      }
    }
  }
  return maskToOutline(width, height, mask, sx, sy)
}

// ── Fallback: MediaPipe Interactive Segmenter ────────────────────────────
// Lighter, but a similarity-based "magic wand" — used only if SlimSAM can't
// load (offline, blocked model download, unsupported browser).
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite'
let segmenterPromise
function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = FilesetResolver.forVisionTasks(WASM_BASE)
      .then((vision) => InteractiveSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })).catch((error) => { segmenterPromise = null; throw error })
  }
  return segmenterPromise
}

async function segmentWithMediaPipe(image, x, y) {
  const segmenter = await getSegmenter()
  const result = segmenter.segment(image, { keypoint: { x, y } })
  try {
    const mask = result.categoryMask
    if (!mask) throw new Error('No selection mask returned.')
    return maskToOutline(mask.width, mask.height, mask.getAsUint8Array(), x, y)
  } finally {
    result.close?.()
  }
}

export function preloadSegmenter() {
  getSam().catch(() => getSegmenter().catch(() => {}))
}

// Always run on the intrinsic image, never a CSS-cropped copy. The result is
// a vector contour, so its stroke stays 5 screen pixels at every zoom/size.
export async function segmentAtPoint(image, x, y, name = '', box = null) {
  if (/art|print|frame|mirror|painting|picture/i.test(name)) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(900, image.naturalWidth)
    canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const outline = frameOutline(canvas.width, canvas.height, context.getImageData(0, 0, canvas.width, canvas.height).data, x, y)
    if (outline) return outline
  }
  try {
    return await segmentWithSam(image, x, y, box)
  } catch (samError) {
    // SAM understood the request but found no trustworthy mask (or the click
    // sat on background) — report that instead of showing a worse model's guess.
    if (samError.isRejection) throw samError
    console.warn('SlimSAM unavailable, falling back to MediaPipe:', samError)
    return segmentWithMediaPipe(image, x, y)
  }
}
