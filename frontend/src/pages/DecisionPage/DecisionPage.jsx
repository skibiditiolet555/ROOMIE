import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTHB } from '../../lib/currency'
import { usePrefs } from '../../lib/prefs'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getObjectDecisions, getProject, getRoomDesigns, updateProject, withWorkflowData } from '../../lib/projects'
import { clearDecisionDraft, getProjectImages, loadDecisionDraft, loadDesignHistory, saveDecisionDraft, saveDesignHistory } from '../../lib/imageStore'
import { api, detectObjects, segmentObjects } from '../../lib/api'
import { getCatalog, useCatalog } from '../../lib/useCatalog'
import { createDecisionCheckpoint } from '../../lib/decisionCheckpoint'
import { decisionTotal, historyEntry, initialObjectForRoom, mergeSuggestedDecisions, realOutlines, restoreHistoryObject, roomsNeedingDetection } from '../../lib/decisionWorkflow'
import ReplacementBrowser from '../../components/ReplacementBrowser/ReplacementBrowser'
import decisionRoom from '../../assets/hero-room.jpg'
import './DecisionPage.css'
import './DecisionOverlay.css'

// Fallback shown only if there's no room photo yet, or AI detection fails.
// `outline` points are hand-tuned to loosely hug each demo item's silhouette
// (not a plain rectangle) so the fallback looks like the real AI response.
const DEMO_OBJECTS = [
  { id: 'sofa', name: 'โซฟา 3 ที่นั่ง', category: 'Sofa', price: 2790, x: 58, y: 56, outline: [[33, 71], [33, 50], [45, 41], [71, 41], [83, 50], [83, 71]] },
  { id: 'table', name: 'โต๊ะกลางทรงกลม', category: 'Coffee table', price: 1290, x: 55, y: 76, outline: [[47, 64], [63, 64], [70, 72], [70, 80], [63, 88], [47, 88], [40, 80], [40, 72]] },
  { id: 'chair', name: 'เก้าอี้ไม้สาน', category: 'Armchair', price: 1790, x: 17, y: 61, outline: [[10, 44], [24, 44], [31, 55], [31, 68], [24, 78], [10, 78], [3, 68], [3, 55]] },
  { id: 'plant', name: 'ต้นไม้ตกแต่ง', category: 'Decoration', price: 590, x: 84, y: 35, outline: [[84, 15], [90, 22], [94, 35], [90, 48], [84, 55], [78, 48], [74, 35], [78, 22]] },
  { id: 'pouf', name: 'เบาะนั่ง Pouffe', category: 'Pouffe', price: 790, x: 20, y: 82, outline: [[14, 70], [26, 70], [32, 82], [26, 94], [14, 94], [8, 82]] },
]

const DECISIONS = [
  { id: 'keep', label: 'KEEP', detail: 'เก็บชิ้นนี้ไว้ในแบบ', icon: '✓' },
  { id: 'replace', label: 'REPLACE', detail: 'หาสินค้าชิ้นใหม่มาแทน', icon: '↻' },
  { id: 'remove', label: 'REMOVE', detail: 'นำออกเพื่อคืนพื้นที่และงบ', icon: '−' },
]

const SCORE_LABELS = ['Function', 'Space', 'Budget', 'Style', 'Availability']
const SCORE_MAX = [30, 25, 20, 15, 10]
const DEFAULT_SCORES = { score: 0, scores: [0, 0, 0, 0, 0], reason: 'กำลังวิเคราะห์...' }
function scoreObjectsWithRules(items, budget) {
  const functionByCategory = { sofa: 0.92, bed: 0.95, desk: 0.88, chair: 0.8, armchair: 0.8, table: 0.78, 'coffee table': 0.72, 'dining table': 0.9, cabinet: 0.8, shelf: 0.75, furniture: 0.8, lighting: 0.7, lamp: 0.7, flooring: 0.65, rug: 0.6, curtains: 0.65, curtain: 0.65, decor: 0.4, decoration: 0.4, plant: 0.35 }
  const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0)
  const results = items.map((item) => {
    const category = (item.category || '').toLowerCase()
    const functionScore = functionByCategory[category] ?? 0.6
    const space = item.price < 3000 ? 0.9 : item.price < 15000 ? 0.8 : 0.7
    const fairShare = budget && items.length ? budget / items.length : 0
    let fit = fairShare ? Math.max(0, Math.min(1, 1 - Math.max(0, item.price / fairShare - 1) * 0.45)) : 0.75
    if (budget && total > budget) fit = Math.max(0, fit - 0.15)
    const scores = [functionScore * 30, space * 25, fit * 20, 0.75 * 15, 0.9 * 10].map(Math.round)
    const score = scores.reduce((sum, value) => sum + value, 0)
    const decision = score >= 72 ? 'keep' : score >= 55 ? 'replace' : 'remove'
    const reason = decision === 'keep' ? 'คะแนนรวมเหมาะกับห้องและงบ · ประเมินเบื้องต้น' : decision === 'replace' ? 'ใช้ได้แต่ยังมีจุดที่ปรับให้เหมาะขึ้นได้ · ประเมินเบื้องต้น' : 'คะแนนเบื้องต้นยังไม่คุ้มกับงบ · ลองพิจารณาอีกครั้ง'
    return { id: item.id, scores, score, decision, reason }
  })
  if (results.length && results.every((item) => item.decision === 'remove')) {
    results.reduce((best, item) => item.score > best.score ? item : best).decision = 'keep'
  }
  return results
}

// Prefers the AI's traced silhouette; falls back to a plain rectangle
// around (x, y) for items with no usable outline (e.g. detection error).
function getObjectOutline(item) {
  if (Array.isArray(item.outline) && item.outline.length >= 3) return item.outline
  const xMin = item.box_x_min ?? Math.max(0, item.x - 12)
  const xMax = item.box_x_max ?? Math.min(100, item.x + 12)
  const yMin = item.box_y_min ?? Math.max(0, item.y - 15)
  const yMax = item.box_y_max ?? Math.min(100, item.y + 15)
  return [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]]
}

function getObjectOutlines(item) {
  if (Array.isArray(item.outlines) && item.outlines.length) {
    const valid = item.outlines.filter((outline) => Array.isArray(outline) && outline.length >= 3)
    if (valid.length) return valid
  }
  return [getObjectOutline(item)]
}

// Bounding box of the outline — used to place the decision badge at a
// corner of the shape.
function getObjectBox(item) {
  const points = getObjectOutlines(item).flat()
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) }
}

// What YOLOE calls each kind of furniture -> how we name it, what category it
// belongs to for product matching, and the catalog category used to estimate
// what replacing it would cost.
const EXTRA_KINDS = {
  sofa: ['โซฟา', 'Sofa', 'sofa'], chair: ['เก้าอี้', 'Armchair', 'chair'],
  'coffee table': ['โต๊ะกลาง', 'Coffee table', 'coffee-table'], 'side table': ['โต๊ะข้าง', 'Side table', 'side-table'],
  'dining table': ['โต๊ะอาหาร', 'Dining table', 'dining-table'], desk: ['โต๊ะทำงาน', 'Desk', 'desk'],
  bed: ['เตียง', 'Bed', 'bed'], nightstand: ['ตู้ข้างเตียง', 'Nightstand', 'nightstand'],
  shelf: ['ชั้นวางของ', 'Shelf', 'shelf'], cabinet: ['ตู้เก็บของ', 'Cabinet', 'cabinet'],
  'tv stand': ['ตู้วางทีวี', 'TV stand', 'television'], television: ['โทรทัศน์', 'TV stand', 'television'],
  rug: ['พรม', 'Rug', 'rug'], lamp: ['โคมไฟ', 'Lamp', 'lamp'], 'potted plant': ['ต้นไม้', 'Plant', 'plant'],
  curtain: ['ผ้าม่าน', 'Curtain', 'curtain'], mirror: ['กระจก', 'Mirror', 'mirror'],
  'framed picture': ['ภาพติดผนัง', 'Wall art', 'wall-art'], pouf: ['เบาะนั่ง', 'Pouffe', 'ottoman'],
  bench: ['ม้านั่ง', 'Bench', 'bench'], vase: ['แจกัน', 'Decoration', null], clock: ['นาฬิกา', 'Decoration', null],
}

// Typical price of buying a replacement, from the reference catalog (0 when
// the catalog has nothing for that kind).
function estimateReplacementPrice(catalogCategory) {
  const prices = getCatalog().filter((product) => product.category === catalogCategory).map((product) => product.price).sort((a, b) => a - b)
  return prices.length ? prices[Math.floor(prices.length / 2)] : 0
}

function pointInPolygon(x, y, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function centroidOf(polygon) {
  return [
    polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
    polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
  ]
}

// Cuts each object out of the redesigned photo with the backend's local
// YOLOE segmentation (free, no OpenAI call) and swaps the outline in as it
// arrives. An object it can't find confidently gets NO outline — it stays in
// the list, but nothing is drawn where a guess might be wrong. The same pass
// also returns furniture that was ALREADY in the room, which is offered as
// extra selectable objects (onExtras) so you can keep, replace or remove
// those too — not only what the AI added.
async function traceObjects(designs, list, isCancelled, onResult, onExtras) {
  // Anything without a real outline yet is (re)tried on every visit — a scan
  // that found nothing must not be saved as final. Removed objects are
  // already out of the photo, so there's nothing to find for them.
  const pending = list.filter((item) => !item.traced && !item.removedFromImage)
  const rooms = [...new Set(pending.map((item) => item.roomId))]
  for (const roomId of rooms) {
    if (isCancelled()) return
    const design = designs.find((room) => room.sourceImageId === roomId) ?? designs[0]
    if (!design?.generatedImageUrl) continue
    const group = list.filter((item) => item.roomId === roomId && !item.removedFromImage)
    try {
      const { found, extras } = await segmentObjects({
        image: design.generatedImageUrl,
        originalImage: design.sourceImageUrl || null,
        objects: group,
      })
      if (isCancelled()) return
      // Already-traced objects keep their outline; only newly found ones change.
      for (const item of group) if (!item.traced) onResult(item.id, found[item.id]?.outline ?? null)
      onExtras(roomId, extras)
    } catch {
      // Backend segmentation unavailable — leave these objects un-outlined
      // (and un-scanned, so a later visit tries again).
    }
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('โหลดภาพไม่สำเร็จ'))
    image.src = src
  })
}

// Puts one object back: copies ONLY its region (outline grown a little, soft
// edge) from the photo as it was before the object was removed/replaced onto
// the current photo. Exact original pixels, no AI call, and every other edit
// made since is kept.
async function restoreObjectRegion(currentUrl, beforeUrl, outlines) {
  const [current, before] = await Promise.all([loadImage(currentUrl), loadImage(beforeUrl)])
  const width = current.naturalWidth
  const height = current.naturalHeight
  const grow = Math.max(4, Math.round(Math.min(width, height) * 0.012))

  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  const maskCtx = mask.getContext('2d')
  maskCtx.filter = `blur(${Math.round(grow / 2)}px)`
  maskCtx.fillStyle = '#000'
  maskCtx.strokeStyle = '#000'
  maskCtx.lineWidth = grow * 2
  maskCtx.lineJoin = 'round'
  for (const points of outlines) {
    maskCtx.beginPath()
    points.forEach(([x, y], index) => maskCtx[index ? 'lineTo' : 'moveTo'](x / 100 * width, y / 100 * height))
    maskCtx.closePath()
    maskCtx.fill()
    maskCtx.stroke()
  }

  const patch = document.createElement('canvas')
  patch.width = width
  patch.height = height
  const patchCtx = patch.getContext('2d')
  patchCtx.drawImage(before, 0, 0, width, height)
  patchCtx.globalCompositeOperation = 'destination-in'
  patchCtx.drawImage(mask, 0, 0)

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const outCtx = out.getContext('2d')
  outCtx.drawImage(current, 0, 0, width, height)
  outCtx.drawImage(patch, 0, 0)
  return out.toDataURL('image/jpeg', 0.95)
}

// Only objects with a real traced outline (from YOLOE segmentation, which
// sets `traced`) are drawn on the photo. The vision model's own rough
// `outline` estimate is NOT enough — it's usually a few-point near-rectangle,
// and drawing it produced boxy highlights instead of the real silhouette.
function hasRealOutline(item) {
  return realOutlines(item).length > 0
}

const DECISION_ICON_PATHS = {
  keep: <path d="M5 12.5 10 17 19 7" />,
  replace: <>
    <path d="M17 2.5 21 6.5 17 10.5" />
    <path d="M3 12.5v-1.5a4 4 0 0 1 4-4h14" />
    <path d="M7 21.5 3 17.5 7 13.5" />
    <path d="M21 11.5v1.5a4 4 0 0 1-4 4H3" />
  </>,
  remove: <path d="M5 12.5h14" />,
}

function DecisionIcon({ decision, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {DECISION_ICON_PATHS[decision] ?? DECISION_ICON_PATHS.keep}
    </svg>
  )
}

function DecisionPage() {
  usePrefs()
  useCatalog()
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [roomDesigns, setRoomDesigns] = useState([])
  const [activeRoomId, setActiveRoomId] = useState('')
  const [objects, setObjects] = useState([])
  const [isRealDetection, setIsRealDetection] = useState(false)
  const [isDetecting, setIsDetecting] = useState(true)
  const [isTracing, setIsTracing] = useState(false)
  const [detectError, setDetectError] = useState('')
  const [activeId, setActiveId] = useState('')
  const [decisions, setDecisions] = useState({})
  const [replacementBriefs, setReplacementBriefs] = useState({})
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [aiSource, setAiSource] = useState('')
  const [aiError, setAiError] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState('')
  const [readyToSave, setReadyToSave] = useState(false)
  const [saveStatus, setSaveStatus] = useState({ state: 'idle', error: '' })
  const editedIdsRef = useRef(new Set())
  const checkpointRef = useRef(null)
  if (!checkpointRef.current) {
    checkpointRef.current = createDecisionCheckpoint({
      persist: async (snapshot, extra) => {
        const savedState = withWorkflowData(
          { ...snapshot.decisions, __replacementBriefs: snapshot.replacementBriefs },
          { generatedImages: snapshot.roomDesigns, detectedObjects: snapshot.objects },
        )
        const updated = await updateProject(snapshot.projectId, {
          decisions: savedState,
          estimatedTotal: snapshot.total,
          stage: 'object-decision',
          status: 'in-progress',
          progress: 67,
          ...extra,
        })
        await saveDesignHistory(snapshot.projectId, snapshot.roomDesigns)
        return updated
      },
      writeDraft: (snapshot) => saveDecisionDraft(snapshot.projectId, snapshot),
      clearDraft: (snapshot) => clearDecisionDraft(snapshot.projectId),
    })
  }

  const activeObjectBase = objects.find((item) => item.id === activeId) ?? objects[0]
  const aiSuggestion = aiSuggestions?.[activeObjectBase?.id]
  const activeObject = activeObjectBase
    ? { ...DEFAULT_SCORES, ...activeObjectBase, ...(aiSuggestion ?? {}) }
    : null
  const total = useMemo(() => decisionTotal(objects, decisions, replacementBriefs, getCatalog()), [objects, decisions, replacementBriefs])

  const decisionCounts = useMemo(() => objects.reduce((counts, item) => {
    const decision = decisions[item.id] || 'keep'
    counts[decision] += 1
    return counts
  }, { keep: 0, replace: 0, remove: 0 }), [objects, decisions])

  function makeSnapshot(next = {}) {
    const nextObjects = next.objects ?? objects
    const nextDecisions = next.decisions ?? decisions
    const nextBriefs = next.replacementBriefs ?? replacementBriefs
    const nextDesigns = next.roomDesigns ?? roomDesigns
    return {
      projectId: project?.id ?? id,
      decisions: nextDecisions,
      replacementBriefs: nextBriefs,
      objects: nextObjects,
      roomDesigns: nextDesigns,
      total: decisionTotal(nextObjects, nextDecisions, nextBriefs, getCatalog()),
    }
  }

  useEffect(() => {
    let cancelled = false
    setReadyToSave(false)
    editedIdsRef.current = new Set()

    async function run() {
      const loaded = await getProject(id)
      if (cancelled || !loaded) return
      setProject(loaded)
      // Project data is enough to render the page shell and saved choices.
      // Object detection continues in-place instead of trapping the user on
      // a full-page loading screen while the vision model is working.
      setIsLoading(false)

      const draft = await loadDecisionDraft(id)
      if (cancelled) return
      let activeObjects = draft?.objects?.length ? draft.objects : loaded.detectedObjects?.length ? loaded.detectedObjects : []
      const detectionErrors = []
      const savedDecisions = draft?.decisions ?? loaded.decisions ?? {}
      const savedObjectDecisions = getObjectDecisions(savedDecisions)
      const savedReplacementBriefs = draft?.replacementBriefs ?? loaded.replacementBriefs
      const hasSavedDecisions = Object.keys(savedObjectDecisions).length > 0
      editedIdsRef.current = new Set(Object.keys(savedObjectDecisions))
      if (hasSavedDecisions) setDecisions(savedObjectDecisions)
      if (savedReplacementBriefs) setReplacementBriefs(savedReplacementBriefs)

      // Detect against the AI-redesigned photo (has furniture in it), not
      // the original empty room — falls back to the original only if the
      // room hasn't been through AI Generate yet. When both exist, sending
      // the original too lets the AI list only what it actually added,
      // instead of re-listing furniture that was already there.
      const images = await getProjectImages(id).catch(() => [])
      if (cancelled) return
      // Undo/redo history survives leaving the page (kept in IndexedDB), so a
      // removed object can still be brought back on a later visit.
      const savedHistory = await loadDesignHistory(id)
      if (cancelled) return
      const serverDesigns = getRoomDesigns(loaded, images)
        .filter((room) => room.generatedImageUrl)
        .map((room) => ({ ...room, ...(savedHistory[room.sourceImageId] ?? {}) }))
      const designs = draft?.roomDesigns?.length
        ? draft.roomDesigns.map((room) => ({ ...room, ...(savedHistory[room.sourceImageId] ?? {}), history: room.history ?? savedHistory[room.sourceImageId]?.history ?? [], future: room.future ?? savedHistory[room.sourceImageId]?.future ?? [] }))
        : serverDesigns
      setRoomDesigns(designs)
      setActiveRoomId(designs[0]?.sourceImageId ?? 'demo')

      const roomsToDetect = roomsNeedingDetection(designs, activeObjects)
      if (roomsToDetect.length) {
        const detectedByRoom = []
        for (const room of roomsToDetect) {
          const roomIndex = designs.findIndex((candidate) => candidate.sourceImageId === room.sourceImageId)
          try {
            const detectResult = await detectObjects({
              image: room.generatedImageUrl,
              originalImage: room.sourceImageUrl,
              budget: loaded.budget,
              style: loaded.style,
            })
            detectResult.objects?.forEach((item, itemIndex) => detectedByRoom.push({
              ...item,
              id: `${room.sourceImageId}:${item.id}:${itemIndex}`,
              sourceObjectId: item.id,
              roomId: room.sourceImageId,
              roomNumber: roomIndex + 1,
            }))
          } catch (err) {
            detectionErrors.push(`ห้อง ${roomIndex + 1}: ${err.message || 'ตรวจจับไม่สำเร็จ'}`)
          }
          if (cancelled) return
        }
        if (detectedByRoom.length) activeObjects = [...activeObjects, ...detectedByRoom]
        if (detectionErrors.length) setDetectError(detectionErrors.join(' · '))
      }
      if (activeObjects.length) setIsRealDetection(true)

      if (!activeObjects.length && !designs.length) {
        const fallbackRoomId = designs[0]?.sourceImageId ?? 'demo'
        activeObjects = DEMO_OBJECTS.map((item) => ({ ...item, roomId: fallbackRoomId, roomNumber: 1 }))
      } else if (!activeObjects.length && !detectionErrors.length) {
        setDetectError('AI ยังไม่พบวัตถุใหม่ที่มั่นใจเพียงพอ ระบบจึงไม่วาด Selection ที่อาจผิดตำแหน่ง')
      }
      setObjects(activeObjects)
      // Keep the selected photo and detail panel on the same room. Prefer a
      // clickable object in the first room; never jump to another room merely
      // because its mask happened to finish first.
      const initialObject = initialObjectForRoom(activeObjects)
      setActiveId(initialObject?.id ?? '')
      if (initialObject?.roomId) setActiveRoomId(initialObject.roomId)
      setDecisions((current) => ({ ...Object.fromEntries(activeObjects.map((item) => [item.id, 'keep'])), ...current }))
      setIsDetecting(false)

      if (activeObjects.length && designs.length) {
        setIsTracing(true)
        traceObjects(designs, activeObjects, () => cancelled, (objectId, outline) => {
          setObjects((current) => current.map((item) => {
            if (item.id !== objectId) return item
            // No confident mask -> no outline at all (never a rectangle).
            // Not found: keep it listed (reachable with ‹ ›) but mark it as not
            // visible in the photo, and try again on the next visit.
            return outline
              ? { ...item, outline, outlines: undefined, traced: true, scanned: true, notInPhoto: false }
              : { ...item, outline: undefined, outlines: undefined, traced: false, scanned: true, notInPhoto: true }
          }))
        }, (roomId, extras) => {
          // Everything else actually visible in the photo becomes selectable
          // too. The backend compared against the original photo: pieces that
          // were already there are "existing" (nothing to buy unless you
          // Replace); pieces the redesign added are priced like any other.
          const roomNumber = designs.findIndex((room) => room.sourceImageId === roomId) + 1
          const added = extras.map((extra) => {
            const [thaiName, category, catalogCategory] = EXTRA_KINDS[extra.label] ?? [extra.label, 'Furniture', null]
            const [x, y] = centroidOf(extra.polygon)
            return {
              // Stable across visits (kind + position), so a re-scan never
              // adds the same piece twice.
              id: `${roomId}:seen:${extra.label}:${Math.round(x)}-${Math.round(y)}`,
              name: thaiName,
              category,
              yoloLabel: extra.label,
              price: catalogCategory ? estimateReplacementPrice(catalogCategory) : 0,
              x,
              y,
              outline: extra.polygon,
              traced: true,
              scanned: true,
              existing: Boolean(extra.existing),
              roomId,
              roomNumber: roomNumber || 1,
            }
          })
          setObjects((current) => {
            const known = new Set(current.map((item) => item.id))
            // Also skip a piece whose centre falls inside an object we already
            // have an outline for (the same thing found again).
            const fresh = added.filter((item) => !known.has(item.id) && !current.some((other) =>
              other.roomId === item.roomId && other.traced && Array.isArray(other.outline)
              && pointInPolygon(item.x, item.y, other.outline)))
            return [...current, ...fresh]
          })
          setDecisions((current) => ({ ...Object.fromEntries(added.map((item) => [item.id, 'keep'])), ...current }))
        }).finally(() => {
          if (cancelled) return
          setIsTracing(false)
          // First scan of this room: if we opened on something the photo
          // doesn't show, move to the first object that has an outline.
          setObjects((current) => {
            setActiveId((active) => {
              const shown = current.find((item) => item.id === active)
              if (shown?.traced) return active
              return current.find((item) => item.roomId === shown?.roomId && item.traced && !item.removedFromImage)?.id ?? active
            })
            return current
          })
        })
      }

      if (!activeObjects.length) return

      const fallbackScores = scoreObjectsWithRules(activeObjects, loaded.budget)
      setAiSuggestions(Object.fromEntries(fallbackScores.map((item) => [item.id, item])))
      setAiSource('rules-pending')
      setDecisions((current) => mergeSuggestedDecisions(current, fallbackScores, editedIdsRef.current))
      setReadyToSave(true)
      try {
        const suggestResult = await api.post('/api/decisions/suggest', {
          room_type: loaded.roomType,
          style: loaded.style,
          budget: loaded.budget,
          dimensions: loaded.dimensions || null,
          requirements: loaded.requirements?.length ? loaded.requirements : null,
          ai_instructions: loaded.aiInstructions || null,
          detected_objects: activeObjects.map((item) => ({ id: item.id, name: item.name, category: item.category, price: item.price })),
        }, { timeoutMs: 30000 })
        if (!cancelled) {
          setAiSuggestions(Object.fromEntries(suggestResult.objects.map((item) => [item.id, item])))
          setAiSource(suggestResult.source || 'llm')
          setDecisions((current) => mergeSuggestedDecisions(current, suggestResult.objects, editedIdsRef.current))
        }
      } catch {
        if (!cancelled) {
          setAiSource('rules')
          setAiError('GPT ยังตอบไม่สำเร็จ จึงแสดงคะแนนประเมินเบื้องต้นแทน')
        }
      }
    }

    run().finally(() => {
      if (!cancelled) {
        setIsLoading(false)
        setIsDetecting(false)
      }
    })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => checkpointRef.current.subscribe(setSaveStatus), [])

  // Every meaningful step is a checkpoint: choices, briefs, detected masks,
  // edited photos, and undo history. The writer debounces normal typing and
  // serializes requests so an older response cannot overwrite newer work.
  useEffect(() => {
    if (!readyToSave || !project || !objects.length) return
    checkpointRef.current.setSnapshot(makeSnapshot())
    // makeSnapshot intentionally represents these exact pieces of workflow state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToSave, project?.id, decisions, replacementBriefs, objects, roomDesigns, total])

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!checkpointRef.current.isDirty()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [])

  if (isLoading) {
    return <main className="decision-missing"><h1>กำลังโหลดโปรเจกต์...</h1></main>
  }

  if (!project) {
    return <main className="decision-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>
  }

  if (!activeObject) {
    return (
      <div className="decision-shell">
        <header className="decision-topbar"><Link to={`/room/${project.id}/furniture`}>← กลับไปดูผลลัพธ์</Link><span>ROOMLY AI · DECISION</span><button className="decision-save-draft" type="button" disabled>บันทึกร่างและออก</button></header>
        <main className="decision-content"><section className="decision-detection-state"><img src={roomDesigns[0]?.generatedImageUrl || decisionRoom} alt="ภาพห้องที่กำลังตรวจจับวัตถุ" /><div><span>{isDetecting ? 'AI DETECTION IN PROGRESS' : 'NO RELIABLE DETECTION'}</span><h1>{isDetecting ? 'กำลังตรวจจับวัตถุอย่างละเอียด' : 'ยังไม่พบวัตถุที่มั่นใจเพียงพอ'}</h1><p>{isDetecting ? 'ระบบกำลังเทียบภาพต้นฉบับกับภาพ AI และตรวจ mask ก่อนแสดง Selection' : detectError}</p>{!isDetecting ? <button type="button" onClick={() => window.location.reload()}>ลองตรวจจับอีกครั้ง</button> : null}</div></section></main>
      </div>
    )
  }

  async function continueToSummary() {
    checkpointRef.current.setSnapshot(makeSnapshot())
    try {
      const updated = await checkpointRef.current.flush({ stage: 'summary', progress: 84 })
      if (updated) setProject(updated)
      navigate(`/room/${project.id}/summary`)
    } catch {
      // The persistent error banner offers an explicit retry; never navigate
      // away while the checkpoint is unconfirmed.
    }
  }

  async function saveDraft() {
    checkpointRef.current.setSnapshot(makeSnapshot())
    try {
      const updated = await checkpointRef.current.flush()
      if (updated) setProject(updated)
      navigate('/home')
    } catch {
      // Stay here and let the user retry without losing the local draft.
    }
  }

  async function retrySave() {
    try {
      const updated = await checkpointRef.current.flush()
      if (updated) setProject(updated)
    } catch {
      // Status is updated by the checkpoint writer.
    }
  }

  const activeRoom = roomDesigns.find((room) => room.sourceImageId === activeRoomId) ?? roomDesigns[0]
  const visibleObjects = objects.filter((item) => !item.roomId || item.roomId === (activeRoom?.sourceImageId ?? activeRoomId))
  // Removed objects stay drawn as a faint dashed ghost of their shape, so
  // they can still be clicked and brought back.
  const drawnObjects = visibleObjects.filter((item) => hasRealOutline(item))
  const orderedDrawnObjects = [...drawnObjects].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId))
  // Only offer room tabs for rooms that have something to decide on.
  const tabRooms = roomDesigns.filter((room) => objects.some((item) => item.roomId === room.sourceImageId))

  function selectRoom(roomId) {
    setActiveRoomId(roomId)
    const firstObject = objects.find((item) => item.roomId === roomId)
    if (firstObject) setActiveId(firstObject.id)
  }

  // Step through every object in this room — including ones with no traced
  // outline or already removed, which can't be clicked on the photo.
  function stepObject(offset) {
    if (!visibleObjects.length) return
    const index = visibleObjects.findIndex((item) => item.id === activeObject.id)
    const next = visibleObjects[(index + offset + visibleObjects.length) % visibleObjects.length]
    setActiveId(next.id)
  }

  function chooseDecision(decision) {
    editedIdsRef.current.add(activeObject.id)
    setDecisions((current) => ({ ...current, [activeObject.id]: decision }))
    if (decision === 'replace' && !replacementBriefs[activeObject.id]) {
      setReplacementBriefs((current) => ({ ...current, [activeObject.id]: { budget: activeObject.price, note: '' } }))
    }
  }

  function updateReplacementBrief(patch) {
    editedIdsRef.current.add(activeObject.id)
    setReplacementBriefs((current) => ({
      ...current,
      [activeObject.id]: { budget: activeObject.price, note: '', ...current[activeObject.id], ...patch },
    }))
  }

  // A piece picked in the Replace browser becomes this object's replacement:
  // its price is the budget, and its description is what the image edit and
  // Product Match both use.
  function pickReplacement(product) {
    updateReplacementBrief({ productId: product.id, productPrice: product.price, budget: product.price })
  }

  function clearReplacement() {
    updateReplacementBrief({ productId: null })
  }

  function openReplacementBrowser() {
    document.getElementById('replacement-browser')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function saveDesigns(nextDesigns, nextDecisions, extra = {}, nextObjects = objects) {
    setRoomDesigns(nextDesigns)
    setObjects(nextObjects)
    setDecisions(nextDecisions)
    checkpointRef.current.setSnapshot(makeSnapshot({ roomDesigns: nextDesigns, decisions: nextDecisions, objects: nextObjects }))
    const updated = await checkpointRef.current.flush(extra)
    setProject(updated)
  }

  // Swap back to an earlier (undo) or undone (redo) image: no AI call, the
  // files are still in Storage.
  async function stepImageHistory(direction) {
    if (!activeRoom) return
    const source = direction === 'undo' ? activeRoom.history ?? [] : activeRoom.future ?? []
    const entry = source[source.length - 1]
    if (!entry) return
    setIsRegenerating(true)
    setRegenerateError('')
    try {
      const rest = source.slice(0, -1)
      const currentObject = objects.find((item) => item.id === entry.objectId)
      const counterpart = currentObject
        ? { ...historyEntry(activeRoom, currentObject, entry.action), previousDecision: entry.previousDecision }
        : { imageUrl: activeRoom.generatedImageUrl, objectId: entry.objectId, objectName: entry.objectName, action: entry.action, previousDecision: entry.previousDecision }
      const nextDesigns = roomDesigns.map((room) => room.sourceImageId !== activeRoom.sourceImageId ? room : {
        ...room,
        generatedImageUrl: entry.imageUrl,
        history: direction === 'undo' ? rest : [...(room.history ?? []), counterpart].slice(-10),
        future: direction === 'undo' ? [...(room.future ?? []), counterpart].slice(-10) : rest,
      })
      const nextDecisions = { ...decisions }
      if (direction === 'undo') nextDecisions[entry.objectId] = entry.previousDecision ?? 'keep'
      else nextDecisions[entry.objectId] = entry.action === 'restore' ? 'keep' : entry.action
      const nextObjects = objects.map((item) => item.id === entry.objectId ? restoreHistoryObject(item, entry, direction) : item)
      await saveDesigns(nextDesigns, nextDecisions, {}, nextObjects)
    } catch (error) {
      setRegenerateError(error.message || 'ย้อนภาพไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsRegenerating(false)
    }
  }

  // The photo as it was right before this object was last removed/replaced
  // (null if it hasn't been, or was already brought back since).
  function restorableEntry(objectId) {
    const steps = (activeRoom?.history ?? []).filter((entry) => entry.objectId === objectId)
    const last = steps[steps.length - 1]
    if (!last || last.action === 'restore') return null
    // After several edits of the same object, go back to its original look.
    let firstSinceRestore = last
    for (let index = steps.length - 1; index >= 0 && steps[index].action !== 'restore'; index -= 1) firstSinceRestore = steps[index]
    return firstSinceRestore
  }

  async function bringBackObject() {
    const entry = restorableEntry(activeObject.id)
    if (!entry || !activeRoom) return
    setIsRegenerating(true)
    setRegenerateError('')
    try {
      // Cover both the current shape (e.g. the replacement piece) and the
      // original one, so nothing of either is left half-visible.
      const outlines = [
        ...(hasRealOutline(activeObject) ? getObjectOutlines(activeObject) : []),
        ...(entry.outline?.length >= 3 ? [entry.outline] : []),
      ]
      if (!outlines.length) throw new Error('ไม่พบขอบของวัตถุนี้ จึงนำกลับมาไม่ได้ — ใช้ปุ่มเลิกทำแทน')
      const restored = await restoreObjectRegion(activeRoom.generatedImageUrl, entry.imageUrl, outlines)
      const nextDesigns = roomDesigns.map((room) => room.sourceImageId !== activeRoom.sourceImageId ? room : {
        ...room,
        generatedImageUrl: restored,
        history: [...(room.history ?? []), historyEntry(room, activeObjectBase, 'restore')].slice(-10),
        future: [],
      })
      const nextDecisions = { ...decisions, [activeObject.id]: 'keep' }
      const nextObjects = objects.map((item) => item.id === activeObject.id
        ? {
          ...(entry.objectSnapshot ?? item),
          id: item.id,
          removedFromImage: false,
          appliedDecision: 'keep',
          appliedBrief: null,
          outline: entry.objectSnapshot?.outline ?? entry.outline ?? item.outline,
          traced: Boolean(entry.objectSnapshot?.traced || entry.outline?.length >= 3 || item.traced),
        }
        : item)
      await saveDesigns(nextDesigns, nextDecisions, {}, nextObjects)
    } catch (error) {
      setRegenerateError(error.message || 'นำกลับมาไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsRegenerating(false)
    }
  }

  async function regenerateSelection() {
    if (!activeRoom?.generatedImageUrl || !activeObject || !['replace', 'remove'].includes(activeDecision)) return
    setIsRegenerating(true)
    setRegenerateError('')
    try {
      const result = await api.post('/api/decisions/regenerate', {
        image_url: activeRoom.generatedImageUrl,
        object_name: activeObject.name,
        category: activeObject.category,
        // Only the object's real outline may be repainted. With none, the
        // backend finds the object itself (by name + this position) and
        // refuses rather than repainting the whole room.
        outlines: hasRealOutline(activeObject) ? getObjectOutlines(activeObject) : [],
        x: activeObject.x ?? null,
        y: activeObject.y ?? null,
        action: activeDecision,
        // The chosen catalog piece (in English, which the image model follows
        // best) plus any extra wishes typed in the note.
        instruction: activeDecision === 'replace'
          ? [pickedReplacement?.en, activeReplacementBrief.note?.trim()].filter(Boolean).join(', ') || null
          : null,
        style: project.style,
        budget: activeDecision === 'replace' ? Number(activeReplacementBrief.budget) || activeObject.price : null,
      })
      const nextDesigns = roomDesigns.map((room) => room.sourceImageId === activeRoom.sourceImageId
        ? {
          ...room,
          generatedImageUrl: result.image_url,
          history: [...(room.history ?? []), historyEntry(room, activeObjectBase, activeDecision)].slice(-10),
          future: [],
        }
        : room)
      const nextSelections = { ...(project.productSelections ?? {}) }
      delete nextSelections[activeObject.id]
      let replacementOutline = null
      if (activeDecision === 'replace') {
        try {
          const { found } = await segmentObjects({
            image: result.image_url,
            objects: [{ id: activeObject.id, name: pickedReplacement?.en || activeObject.name, category: activeObject.category, x: activeObject.x, y: activeObject.y }],
          })
          replacementOutline = found[activeObject.id]?.outline ?? null
        } catch {
          // Save the image with an untraced object. The next visit will retry;
          // reusing the old object's mask could repaint the wrong pixels.
        }
      }
      const appliedBrief = activeDecision === 'replace'
        ? { ...activeReplacementBrief, productPrice: pickedReplacement?.price ?? activeReplacementBrief.productPrice ?? null }
        : null
      const nextObjects = objects.map((item) => {
        if (item.id !== activeObject.id) return item
        if (activeDecision === 'remove') return { ...item, removedFromImage: true, appliedDecision: 'remove', appliedBrief: null }
        return {
          ...item,
          removedFromImage: false,
          appliedDecision: 'replace',
          appliedBrief,
          outline: replacementOutline ?? undefined,
          outlines: undefined,
          traced: Boolean(replacementOutline),
          scanned: Boolean(replacementOutline),
          notInPhoto: false,
        }
      })
      await saveDesigns(nextDesigns, decisions, { productSelections: nextSelections }, nextObjects)
    } catch (error) {
      setRegenerateError(error.message || 'สร้างเฉพาะวัตถุนี้ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsRegenerating(false)
    }
  }

  const activeDecision = decisions[activeObject.id] || 'keep'
  const canBringBack = Boolean(restorableEntry(activeObject.id))
  const activeReplacementBrief = replacementBriefs[activeObject.id] ?? { budget: activeObject.price, note: '' }
  const pickedReplacement = getCatalog().find((product) => product.id === activeReplacementBrief.productId) ?? null
  const activeContribution = activeDecision === 'remove'
    ? 0
    : decisionTotal([activeObjectBase], decisions, replacementBriefs, getCatalog())
  const maxReplacementBudget = Math.max(100, project.budget - (total - activeContribution))
  const isOverBudget = total > project.budget

  return (
    <div className="decision-shell">
      <header className="decision-topbar">
        <Link to={`/room/${project.id}/furniture`}>← กลับไปดูผลลัพธ์</Link>
        <span>ROOMLY AI · DECISION</span>
        <div className={`decision-save-state is-${saveStatus.state}`} role="status">
          <small>{saveStatus.state === 'saving' ? 'กำลังบันทึก…' : saveStatus.state === 'pending' ? 'มีการเปลี่ยนแปลง' : saveStatus.state === 'saved' ? 'บันทึกอัตโนมัติแล้ว' : saveStatus.state === 'error' ? saveStatus.error : ''}</small>
          {saveStatus.state === 'error' ? <button type="button" onClick={retrySave}>ลองอีกครั้ง</button> : null}
          <button className="decision-save-draft" type="button" disabled={isRegenerating || saveStatus.state === 'saving'} onClick={saveDraft}>บันทึกร่างและออก</button>
        </div>
      </header>

      <main className="decision-content">
        <header className="decision-heading">
          <div><p>04 · OBJECT DECISION</p><h1>เลือกสิ่งที่ควรเก็บ เปลี่ยน หรือนำออก</h1><span>กดกรอบไฮไลต์บนภาพหรือเลือกรายการด้านล่าง ระบบจะแสดงคะแนนและเหตุผลประกอบ</span></div>
          <div className={`decision-budget ${isOverBudget ? 'is-over' : ''}`.trim()}><span>HARD BUDGET LIMIT</span><strong>{formatTHB(project.budget)}</strong><small>ห้ามเกินแม้แต่ ฿1</small></div>
        </header>

        <section className="decision-overview" aria-label="สรุปการตัดสินใจ">
          <div><span>ทั้งหมด</span><strong>{objects.length}</strong><small>รายการ</small></div>
          <div className="is-keep"><span>เก็บไว้</span><strong>{decisionCounts.keep}</strong><small>KEEP</small></div>
          <div className="is-replace"><span>เปลี่ยนใหม่</span><strong>{decisionCounts.replace}</strong><small>REPLACE</small></div>
          <div className="is-remove"><span>นำออก</span><strong>{decisionCounts.remove}</strong><small>REMOVE</small></div>
        </section>

        {tabRooms.length > 1 ? <nav className="decision-room-tabs" aria-label="เลือกภาพห้อง">{tabRooms.map((room, index) => {
          const count = objects.filter((item) => item.roomId === room.sourceImageId).length
          return <button className={activeRoom?.sourceImageId === room.sourceImageId ? 'is-active' : ''} type="button" onClick={() => selectRoom(room.sourceImageId)} key={room.sourceImageId}><span>ROOM {String(index + 1).padStart(2, '0')}</span><strong>{count} รายการที่ตรวจพบ</strong></button>
        })}</nav> : null}
        {isTracing ? <p className="decision-tracing">กำลังหาขอบวัตถุ…</p> : null}

        <section className={`decision-workspace ${activeDecision === 'replace' ? 'is-replacing' : ''}`.trim()}>
          <div className="decision-visual">
            <img src={activeRoom?.generatedImageUrl || decisionRoom} alt="ภาพห้องพร้อมจุดเลือกเฟอร์นิเจอร์" />
            {isRegenerating ? <div className="decision-regenerating" role="status"><span /><strong>AI กำลังแก้เฉพาะวัตถุที่เลือก</strong><small>ส่วนอื่นของห้องจะคงเดิม</small></div> : null}
            <svg className="decision-outline-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {orderedDrawnObjects.map((item) => {
                const decision = decisions[item.id] || 'keep'
                return (
                  <g key={item.id}>
                    {getObjectOutlines(item).map((points, outlineIndex) => (
                      <polygon
                        className={`decision-outline-shape is-${decision} ${activeId === item.id ? 'is-active' : 'is-muted'} ${item.removedFromImage ? 'is-ghost' : ''}`}
                        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
                        onClick={() => setActiveId(item.id)}
                        key={`${item.id}-${outlineIndex}`}
                      />
                    ))}
                  </g>
                )
              })}
            </svg>
            {orderedDrawnObjects.map((item) => {
              const decision = decisions[item.id] || 'keep'
              const box = getObjectBox(item)
              return (
                <span className="decision-object-markers" key={item.id}>
                  <button
                    className={`decision-hotspot is-${decision} ${activeId === item.id ? 'is-active' : ''}`}
                    style={{ left: `${box.xMax}%`, top: `${box.yMin}%` }}
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    aria-label={`เลือก ${item.name} (${decision})`}
                  >
                    <DecisionIcon decision={decision} />
                  </button>
                  {activeId === item.id ? <span className="decision-object-callout" style={{ left: `${(box.xMin + box.xMax) / 2}%`, top: `${Math.max(3, box.yMin)}%` }}>{item.name}</span> : null}
                </span>
              )
            })}
            {(activeRoom?.history?.length || activeRoom?.future?.length) ? (
              <div className="decision-image-history" role="group" aria-label="ย้อนประวัติภาพ">
                <button type="button" disabled={isRegenerating || !activeRoom.history?.length} onClick={() => stepImageHistory('undo')} title="กลับไปภาพก่อนหน้า ไม่เสียเครดิต AI">
                  ↶ เลิกทำ{activeRoom.history?.length ? ` (${activeRoom.history.length})` : ''}
                </button>
                <button type="button" disabled={isRegenerating || !activeRoom.future?.length} onClick={() => stepImageHistory('redo')} title="ทำซ้ำภาพที่เลิกทำไป ไม่เสียเครดิต AI">
                  ↷ ทำซ้ำ{activeRoom.future?.length ? ` (${activeRoom.future.length})` : ''}
                </button>
              </div>
            ) : null}
            <span className="decision-demo-label">{isRealDetection ? 'AI DETECTED' : 'DEMO DETECTION'}{aiSource === 'llm' ? ' · GPT SCORED' : aiSource === 'rules-pending' ? ' · GPT SCORING' : aiSource === 'rules' ? ' · BASIC SCORE' : ''}</span>
          </div>

          <aside className={`decision-panel is-${activeDecision} ${isRegenerating ? 'is-busy' : ''}`} aria-busy={isRegenerating}>
            <div className="decision-object-title"><span>{activeObject.category}</span><small className="decision-object-stepper">
              <button type="button" aria-label="รายการก่อนหน้า" disabled={visibleObjects.length < 2} onClick={() => stepObject(-1)}>‹</button>
              ห้อง {activeObject.roomNumber ?? 1} · รายการ {visibleObjects.findIndex((item) => item.id === activeObject.id) + 1} / {visibleObjects.length}
              <button type="button" aria-label="รายการถัดไป" disabled={visibleObjects.length < 2} onClick={() => stepObject(1)}>›</button>
            </small><h2>{activeObject.name}</h2><p>{activeObject.existing ? `ของเดิมในห้อง · ถ้าเปลี่ยนใหม่ประมาณ ${formatTHB(activeObject.price)}` : `ราคาประเมิน ${formatTHB(activeObject.price)}`}</p>{activeObject.notInPhoto && !activeObject.removedFromImage ? <small className="decision-not-in-photo">ไม่พบชิ้นนี้ในภาพ AI · อยู่ในแผนแต่ภาพไม่ได้วาดไว้ จึงเลือกบนภาพหรือแก้ไขภาพไม่ได้</small> : null}</div>

            <div className="decision-score-summary"><div><strong>{activeObject.score}</strong><span>/ 100</span></div><p>{activeObject.reason}</p>{detectError || aiError ? <small className="decision-ai-error">{detectError || aiError}</small> : null}</div>

            <div className="decision-score-list">
              {SCORE_LABELS.map((label, index) => (
                <div key={label}><span>{label}</span><i><b style={{ width: `${(activeObject.scores[index] / SCORE_MAX[index]) * 100}%` }} /></i><strong>{activeObject.scores[index]}/{SCORE_MAX[index]}</strong></div>
              ))}
            </div>

            <fieldset className="decision-options" disabled={isRegenerating}>
              <legend>การตัดสินใจของคุณ</legend>
              {DECISIONS.map((option) => (
                <label className={decisions[activeObject.id] === option.id ? `is-selected is-${option.id}` : ''} key={option.id}>
                  <input type="radio" name={`decision-${activeObject.id}`} checked={decisions[activeObject.id] === option.id} onChange={() => chooseDecision(option.id)} />
                  <b aria-hidden="true">{option.icon}</b><span><strong>{option.label}</strong><small>{option.detail}</small></span><i />
                </label>
              ))}
            </fieldset>

            {activeDecision === 'replace' ? (
              <section className="decision-action-card is-replace" aria-label="รายละเอียดสินค้าทดแทน">
                <div><span>NEXT · PRODUCT MATCH</span><strong>กำหนดโจทย์ของชิ้นใหม่</strong></div>
                {pickedReplacement ? (
                  <button type="button" className="decision-picked" onClick={openReplacementBrowser}>
                    <i style={{ background: pickedReplacement.swatch }} />
                    <span><small>ของที่จะมาแทน · {pickedReplacement.store}</small><strong>{pickedReplacement.name}</strong><em>{formatTHB(pickedReplacement.price)} · เปลี่ยน ↓</em></span>
                  </button>
                ) : (
                  <button type="button" className="decision-browse-button" onClick={openReplacementBrowser}>
                    ดูและเลือกของที่จะมาแทน ({getCatalog().length} รายการ) ↓
                  </button>
                )}
                <label><span>งบสูงสุดสำหรับชิ้นนี้ · ใช้ได้ไม่เกิน {formatTHB(maxReplacementBudget)}</span><span className="decision-replace-budget"><b>฿</b><input type="number" min="100" max={maxReplacementBudget} step="100" value={activeReplacementBrief.budget} onChange={(event) => updateReplacementBrief({ budget: event.target.value === '' ? '' : Number(event.target.value) })} onBlur={() => updateReplacementBrief({ budget: Math.min(maxReplacementBudget, Math.max(100, Number(activeReplacementBrief.budget) || 100)) })} /></span></label>
                <label><span>อยากได้แบบไหน</span><textarea rows="2" value={activeReplacementBrief.note} onChange={(event) => updateReplacementBrief({ note: event.target.value })} placeholder="เช่น ขนาดเล็กลง สีไม้สว่าง มีพื้นที่เก็บของ" /></label>
                <p>ระบบจะใช้โจทย์เดียวกันทั้งสร้างภาพเฉพาะชิ้นนี้และค้นหาสินค้าจริงในขั้นถัดไป</p>
                <button className="decision-regenerate-button" type="button" disabled={isRegenerating} onClick={regenerateSelection}>{isRegenerating ? 'กำลังสร้าง...' : '↻ สร้างใหม่เฉพาะชิ้นที่เลือก'}</button>
                {regenerateError ? <small className="decision-regenerate-error" role="alert">{regenerateError}</small> : null}
              </section>
            ) : activeDecision === 'remove' ? (
              <section className="decision-action-card is-remove" aria-label="ผลจากการนำรายการออก">
                <div><span>REMOVE CONFIRMED</span><strong>คืนพื้นที่ให้ห้องมากขึ้น</strong></div>
                <p>รายการนี้จะไม่ถูกส่งไปจับคู่สินค้า {activeObject.existing ? 'ของเดิมในห้องอยู่แล้ว จึงไม่มีงบที่ต้องคืน' : <>และคืนงบประมาณประมาณ <b>{formatTHB(activeObject.price)}</b></>}</p>
                {activeObject.removedFromImage ? null : <button className="decision-regenerate-button is-remove" type="button" disabled={isRegenerating} onClick={regenerateSelection}>{isRegenerating ? 'กำลังลบ...' : '− ลบเฉพาะชิ้นนี้ออกจากภาพ'}</button>}
                {regenerateError ? <small className="decision-regenerate-error" role="alert">{regenerateError}</small> : null}
              </section>
            ) : (
              <section className="decision-action-card is-keep" aria-label="ผลจากการเก็บรายการไว้">
                <div><span>KEEP CONFIRMED</span><strong>คงรายการนี้ไว้ในแบบ</strong></div>
                <p>ไม่ต้องค้นหาสินค้าทดแทน ระบบจะนับราคาประเมินเดิมในงบรวม</p>
              </section>
            )}
            {canBringBack ? (
              <section className="decision-bring-back" aria-label="นำวัตถุเดิมกลับมา">
                <p>{activeObject.removedFromImage ? 'ชิ้นนี้ถูกนำออกจากภาพแล้ว' : 'ชิ้นนี้ถูกเปลี่ยนในภาพแล้ว'} · นำของเดิมกลับมาได้โดยไม่กระทบส่วนอื่นที่แก้ไว้</p>
                <button type="button" disabled={isRegenerating} onClick={bringBackObject}>↺ นำของเดิมกลับมา</button>
                {regenerateError && activeDecision === 'keep' ? <small className="decision-regenerate-error" role="alert">{regenerateError}</small> : null}
              </section>
            ) : null}
            {activeDecision === 'replace' ? (
              <div id="replacement-browser">
                <ReplacementBrowser
                  key={activeObject.id}
                  compact
                  object={activeObject}
                  catalog={getCatalog()}
                  style={project.style}
                  maxBudget={maxReplacementBudget}
                  selectedId={activeReplacementBrief.productId}
                  onSelect={pickReplacement}
                  onClear={clearReplacement}
                />
              </div>
            ) : null}
          </aside>
        </section>

        <footer className="decision-footer">
          <div><span>ยอดประมาณการใหม่</span><strong>{formatTHB(total)}</strong><small className={total > project.budget ? 'is-over' : ''}>{total <= project.budget ? `เหลืองบ ${formatTHB(project.budget - total)}` : `เกินงบ ${formatTHB(total - project.budget)}`}</small></div>
          <p className={isOverBudget ? 'is-over' : ''}>{isOverBudget ? <>ต้องลดอีก <b>{formatTHB(total - project.budget)}</b> ก่อนดำเนินการต่อ</> : <><b>{decisionCounts.replace}</b> รายการรอหาสินค้าทดแทน · <b>{decisionCounts.remove}</b> รายการจะถูกนำออก</>}</p>
          <button type="button" disabled={isOverBudget || isRegenerating || saveStatus.state === 'saving'} onClick={continueToSummary}>{isOverBudget ? 'ยอดรวมยังเกินงบ' : isRegenerating ? 'รอ AI สร้างภาพให้เสร็จ' : saveStatus.state === 'saving' ? 'กำลังบันทึก' : 'ดูโปรเจกต์ฉบับสุดท้าย'} <span>{isOverBudget ? '!' : '→'}</span></button>
        </footer>
      </main>
    </div>
  )
}

export default DecisionPage
