export const styleOptions = [
  { id: 'modern', label: 'Modern', filter: 'contrast(1.12) saturate(0.85) brightness(1.02)' },
  { id: 'minimalist', label: 'Minimalist', filter: 'grayscale(0.45) brightness(1.08) contrast(0.95)' },
  { id: 'cozy', label: 'Cozy', filter: 'sepia(0.3) saturate(1.35) brightness(0.95)' },
  { id: 'luxury', label: 'Luxury', filter: 'contrast(1.2) saturate(1.25) brightness(0.88)' },
]

export function baseFilterForStyle(styleLabel) {
  return styleOptions.find((s) => s.label === styleLabel)?.filter || styleOptions[0].filter
}

// Simulates a fresh AI generation attempt: takes the chosen theme's base
// look and jitters it slightly so each regenerate produces a visibly
// different (but on-theme) result.
export function randomVariantFilter(styleLabel) {
  const base = baseFilterForStyle(styleLabel)
  const hue = Math.round(Math.random() * 30 - 15)
  const brightness = (0.95 + Math.random() * 0.15).toFixed(2)
  const saturate = (0.9 + Math.random() * 0.3).toFixed(2)
  return `${base} hue-rotate(${hue}deg) brightness(${brightness}) saturate(${saturate})`
}

// Bakes a CSS filter into an actual image (data URL) using canvas, so the
// "generated" look can be saved as the room's real thumbnail.
export function bakeFilteredImage(src, filter) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.filter = filter
      ctx.drawImage(img, 0, 0)
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = reject
    img.src = src
  })
}
