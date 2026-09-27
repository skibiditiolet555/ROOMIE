import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { segmentObjects } from '../../lib/api'
import { containsPoint, imageKey } from '../../utils/selectionGeometry'

// Real pixel-level silhouettes, not boxes: ChatGPT (via detectItems, upstream
// of this component) has already found each item's rough position in the
// photo; this component traces a matching mask locally in the browser. One
// batched client operation covers every item in the photo —
// nothing is guessed, and an item YOLOE can't confidently match is simply
// left without an outline rather than shown as a rectangle.
const cache = new Map()
function getOutlines(key, image, items, { skipCache = false } = {}) {
  const storageKey = `roomie-outlines-v3:${key}`
  if (skipCache) { cache.delete(key); try { localStorage.removeItem(storageKey) } catch { /* ignore */ } }
  else {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      if (saved) return Promise.resolve(saved)
    } catch { /* Storage can be unavailable. */ }
  }
  if (!cache.has(key)) {
    cache.set(key, segmentObjects({ image, objects: items }).then((result) => {
      try { localStorage.setItem(storageKey, JSON.stringify(result.found)) } catch { /* Optional cache. */ }
      return result.found
    }).catch((error) => { cache.delete(key); throw error }))
  }
  return cache.get(key)
}

const centerOf = (item) => ({
  x: item.x != null && item.w != null ? item.x + item.w / 2 : item.x,
  y: item.y != null && item.h != null ? item.y + item.h / 2 : item.y,
})

export default function ObjectSelectionCanvas({ image, items, highlightedIds, selectedId, onSelect, onClear, regeneratingId }) {
  const imgRef = useRef(null)
  const [ratio, setRatio] = useState(4 / 3)
  const [outlines, setOutlines] = useState({})
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const photoKey = useMemo(() => imageKey(image || ''), [image])
  const itemsForScan = useMemo(
    () => items.map((item) => ({ id: item.id, name: item.name, category: item.categoryId ?? item.category, ...centerOf(item) })),
    // Round positions so a 1px drag doesn't trigger a whole new (slow) scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.map((item) => `${item.id}:${item.name}:${item.categoryId ?? item.category}:${Math.round(centerOf(item).x ?? -1)}:${Math.round(centerOf(item).y ?? -1)}`).join('|')]
  )
  const requestKey = `${photoKey}:${imageKey(JSON.stringify(itemsForScan))}`

  useEffect(() => {
    if (!image || itemsForScan.length === 0) return
    let cancelled = false
    setNotice('')
    setScanning(true)
    getOutlines(requestKey, image, itemsForScan, { skipCache: retry > 0 }).then((found) => {
      if (cancelled) return
      setOutlines(found)
      if (Object.values(found).every((entry) => !entry.matched)) {
        setNotice('Could not trace any object precisely. You can still pick items from the list.')
      }
    }).catch((error) => {
      const reason = /quota|billing|credit/i.test(error.message) ? 'The AI service has no available credits.'
        : /ultralytics|opencv|503/i.test(error.message) ? 'Object tracing is unavailable.'
        : /connection|timeout/i.test(error.message) ? 'The request could not be completed.'
        : 'Automatic object tracing is unavailable.'
      if (!cancelled) setNotice(`${reason} You can still pick items from the list.`)
    }).finally(() => { if (!cancelled) setScanning(false) })
    return () => { cancelled = true }
  }, [requestKey, image, itemsForScan, retry])

  const clickPhoto = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * 100
    const y = (event.clientY - rect.top) / rect.height * 100
    // Prefer a real traced outline; fall back to the item's known box so it's
    // still clickable even when segmentation couldn't confidently match it — the box
    // is only ever used for hit-testing, never drawn.
    const candidates = items.filter((item) => {
      const outline = outlines[item.id]
      if (outline?.matched && outline.outline) return containsPoint(outline.outline.map(([px, py]) => ({ x: px, y: py })), x, y)
      if (item.x == null || item.w == null) return false
      return x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h
    }).sort((a, b) => (a.w ?? 100) * (a.h ?? 100) - (b.w ?? 100) * (b.h ?? 100))
    const hit = candidates[0]
    if (hit) onSelect(hit.id)
    else onClear()
  }

  return (
    <div className="room-photo-selection">
      <div className="room-canvas" style={{ aspectRatio: ratio }} onClick={clickPhoto}>
        {image ? <img ref={imgRef} src={image} className="room-canvas__img" alt="Your room" draggable={false}
          onLoad={(event) => setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
          : <div className="room-canvas__missing">No room photo yet.</div>}
        <svg className="room-canvas__outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Selected object outlines">
          {highlightedIds.map((id) => {
            const item = items.find((entry) => entry.id === id)
            const outline = outlines[id]
            if (!item || !outline?.matched || !outline.outline) return null
            return <polygon key={id} data-item-id={id} points={outline.outline.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none" stroke={item.color || '#ffff00'} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke" className={`room-canvas__outline-poly${regeneratingId === id ? ' room-canvas__outline-poly--pulse' : ''}`} />
          })}
        </svg>
        {scanning && <span className="room-canvas__mask-loading" role="status"><RefreshCw size={13} className="furniture-item__spin" />Tracing objects with AI…</span>}
      </div>
      {notice && <p className="room-canvas__notice" role="status">{notice} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry tracing</button></p>}
      <p className="room-canvas__hint">Click an object to select it. Click it again to hide its outline.</p>
    </div>
  )
}
