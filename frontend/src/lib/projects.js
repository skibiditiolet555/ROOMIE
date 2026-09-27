// Adapter: the Decision / Products / Summary pages were written against a
// "project" model. In Roomie a project IS a room, so this presents a room as
// that project shape and writes the results back onto the room.
//
// The pages call these as plain async functions (not hooks), so
// RoomsContext registers itself here via registerRoomsBridge.

let bridge = null

export function registerRoomsBridge(next) {
  bridge = next
}

async function waitForRooms() {
  // On a refresh or direct link rooms load asynchronously; wait for them
  // instead of reporting "not found" for a room that simply hasn't arrived.
  for (let waited = 0; waited < 10000; waited += 50) {
    if (bridge?.isLoaded()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

// ---- persistence of the workflow state -----------------------------------
// Lives in the room's `workflow` jsonb column (supabase/add_workflow_column.sql).
// Light fields are also mirrored to localStorage so choices survive a refresh
// even before that migration has been run. Images are never mirrored — they
// already live in the room's design_images.
const LS_KEY = (id) => `roomie_workflow_${id}`
const MIRRORED = ['decisions', 'replacementBriefs', 'productSelections', 'detectedObjects', 'stage', 'progress', 'estimatedTotal']

function readMirror(id) {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY(id)) || '{}')
  } catch {
    return {}
  }
}

function writeMirror(id, workflow) {
  try {
    const light = Object.fromEntries(MIRRORED.filter((key) => key in workflow).map((key) => [key, workflow[key]]))
    localStorage.setItem(LS_KEY(id), JSON.stringify(light))
  } catch {
    // Storage full or blocked — the database copy is the source of truth.
  }
}

function workflowOf(room) {
  const saved = room.workflow && Object.keys(room.workflow).length ? room.workflow : null
  return saved ?? readMirror(room.id)
}

// ---- turning Furniture-page items into Decision objects ------------------
const CATEGORY_KEYWORDS = [
  [/bedside|nightstand/i, 'Nightstand'], [/\bpet\b/i, 'Pouffe'], [/\bbed\b/i, 'Bed'],
  [/sofa|couch|sectional/i, 'Sofa'], [/coffee table|center table/i, 'Coffee table'],
  [/side table|end table/i, 'Side table'], [/dining table/i, 'Dining table'], [/desk/i, 'Desk'],
  [/armchair|chair|stool/i, 'Armchair'], [/\btable\b/i, 'Coffee table'],
  [/rug|carpet|mat\b/i, 'Rug'], [/lamp|light|lantern/i, 'Lamp'], [/curtain|drape/i, 'Curtain'],
  [/plant|tree|flower/i, 'Plant'], [/shelf|shelving|bookcase/i, 'Shelf'],
  [/cabinet|storage|wardrobe|dresser|sideboard/i, 'Cabinet'], [/mirror/i, 'Mirror'],
  [/art|print|frame|picture|poster/i, 'Wall art'], [/pouf|ottoman|cushion|pillow/i, 'Pouffe'],
  [/\btv\b|television/i, 'TV stand'], [/bench/i, 'Bench'],
]

function categoryFromName(name = '', fallback = '') {
  return CATEGORY_KEYWORDS.find(([pattern]) => pattern.test(name))?.[1] ?? fallback
}

function outlineOf(item) {
  const bbox = item.bbox
  if (item.outline?.length && bbox?.w && bbox?.h && item.w && item.h) {
    return item.outline.map((p) => [
      item.x + ((p.x - bbox.x) / bbox.w) * item.w,
      item.y + ((p.y - bbox.y) / bbox.h) * item.h,
    ])
  }
  const x = item.x ?? 10
  const y = item.y ?? 40
  const w = item.w ?? 22
  const h = item.h ?? 18
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
}

function objectsFromItems(items, roomId) {
  return items.map((item, index) => ({
    id: `${roomId}:${item.id}:${index}`,
    sourceObjectId: item.id,
    name: item.name,
    category: categoryFromName(item.name, item.categoryId || item.category || ''),
    price: Math.round(item.price ?? item.price_estimate ?? 0),
    x: (item.x ?? 10) + (item.w ?? 22) / 2,
    y: (item.y ?? 40) + (item.h ?? 18) / 2,
    outline: outlineOf(item),
    roomId,
    roomNumber: 1,
  }))
}

// ---- room -> project ------------------------------------------------------
function designsOf(room) {
  const photos = room.photos?.length ? room.photos : room.originalThumbnail ? [room.originalThumbnail] : []
  const designs = room.designImages?.length ? room.designImages : room.designImage ? [room.designImage] : []
  return photos
    .map((photo, index) => ({
      sourceImageId: `photo-${index}`,
      sourceImageUrl: photo,
      generatedImageUrl: designs[index],
      history: [],
      future: [],
    }))
    .filter((design) => design.generatedImageUrl)
}

function toProject(room) {
  const workflow = workflowOf(room)
  const generatedImages = designsOf(room)
  const seeded = workflow.detectedObjects?.length
    ? workflow.detectedObjects
    : room.items?.length && generatedImages.length
      ? objectsFromItems(room.items, generatedImages[0].sourceImageId)
      : []
  return {
    id: room.id,
    name: room.name,
    style: room.style,
    budget: room.budget,
    roomType: room.category,
    dimensions: null,
    requirements: null,
    aiInstructions: room.designPrompt || null,
    generatedImages,
    generatedImageUrl: generatedImages[0]?.generatedImageUrl,
    detectedObjects: seeded,
    decisions: workflow.decisions ?? {},
    replacementBriefs: workflow.replacementBriefs ?? {},
    productSelections: workflow.productSelections ?? {},
    plannedProducts: [],
    estimatedTotal: workflow.estimatedTotal ?? room.spent ?? 0,
    stage: workflow.stage ?? 'result',
    progress: workflow.progress ?? 0,
  }
}

export async function getProject(id) {
  if (!(await waitForRooms())) return null
  const room = bridge.getRooms().find((candidate) => candidate.id === id)
  return room ? toProject(room) : null
}

// Decisions are stored as { [objectId]: 'keep' | 'replace' | 'remove' } plus
// bookkeeping keys prefixed with "__" (see withWorkflowData) — this returns
// just the per-object choices.
export function getObjectDecisions(decisions) {
  return Object.fromEntries(
    Object.entries(decisions ?? {}).filter(([key, value]) => !key.startsWith('__') && typeof value === 'string')
  )
}

export function withWorkflowData(state, { generatedImages, detectedObjects }) {
  return { ...state, __generatedImages: generatedImages, __detectedObjects: detectedObjects }
}

export function getRoomDesigns(project) {
  return project?.generatedImages ?? []
}

const projectWrites = new Map()

export function updateProject(id, patch) {
  const previous = projectWrites.get(id) ?? Promise.resolve()
  const operation = previous.catch(() => {}).then(() => persistProject(id, patch))
  projectWrites.set(id, operation)
  const cleanup = () => { if (projectWrites.get(id) === operation) projectWrites.delete(id) }
  operation.then(cleanup, cleanup)
  return operation
}

async function persistProject(id, patch) {
  if (!(await waitForRooms())) throw new Error('โหลดข้อมูลห้องไม่สำเร็จ กรุณาลองใหม่')
  const room = bridge.getRooms().find((candidate) => candidate.id === id)
  if (!room) throw new Error('ไม่พบโปรเจกต์')

  const workflow = { ...workflowOf(room) }
  let generatedImages = null

  if (patch.decisions) {
    const { __replacementBriefs, __generatedImages, __detectedObjects, ...decisions } = patch.decisions
    workflow.decisions = decisions
    if (__replacementBriefs) workflow.replacementBriefs = __replacementBriefs
    if (__detectedObjects) workflow.detectedObjects = __detectedObjects
    if (__generatedImages) generatedImages = __generatedImages
  }
  for (const key of ['productSelections', 'estimatedTotal', 'stage', 'progress']) {
    if (key in patch) workflow[key] = patch[key]
  }

  const roomUpdates = {}
  // A regenerate (replace / remove) changes the picture itself — write it
  // back onto the room so the compare and furnish pages show the same image.
  if (generatedImages?.length) {
    const nextDesigns = [...(room.designImages?.length ? room.designImages : [])]
    for (const design of generatedImages) {
      const index = Number(String(design.sourceImageId).replace('photo-', ''))
      if (Number.isInteger(index) && design.generatedImageUrl) nextDesigns[index] = design.generatedImageUrl
    }
    roomUpdates.designImages = nextDesigns
    roomUpdates.designImage = nextDesigns.find(Boolean)
    roomUpdates.thumbnail = roomUpdates.designImage
  }
  if (patch.status) roomUpdates.status = patch.status === 'done' ? 'Completed' : 'In Progress'
  if ('estimatedTotal' in patch) roomUpdates.spent = patch.estimatedTotal

  // The picture and its decisions/masks are one checkpoint. Never report a
  // successful save or navigate away before this atomic row update succeeds.
  const result = await bridge.updateRoom(id, { ...roomUpdates, workflow })
  if (result === null) throw new Error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
  writeMirror(id, workflow)

  return toProject({ ...room, ...roomUpdates, workflow })
}
