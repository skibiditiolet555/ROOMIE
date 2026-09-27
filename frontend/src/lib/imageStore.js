// Roomie keeps photos and designs on the room itself, so there is no
// separate image store to read — the Decision page only calls this to
// stay compatible with the project model it was written for.
export async function getProjectImages() {
  return []
}

// The Decision page's undo/redo history (earlier versions of each room
// photo, one per remove/replace) is kept in the browser's IndexedDB: the
// images are far too large for the database row or localStorage, and without
// them a removed object could never be brought back after leaving the page.
const DB_NAME = 'roomie-images'
const STORE = 'design-history'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, run) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const result = run(tx.objectStore(STORE))
    tx.oncomplete = () => { db.close(); resolve(result?.result) }
    tx.onerror = () => { db.close(); reject(tx.error) }
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Local storage transaction aborted')) }
  })
}

/** { [sourceImageId]: { history, future } } for a room, or {} if none saved. */
export async function loadDesignHistory(roomId) {
  try {
    return (await withStore('readonly', (store) => store.get(roomId))) ?? {}
  } catch {
    return {}
  }
}

export async function saveDesignHistory(roomId, designs) {
  try {
    const value = Object.fromEntries(designs.map((design) => [
      design.sourceImageId,
      { history: design.history ?? [], future: design.future ?? [] },
    ]))
    await withStore('readwrite', (store) => store.put(value, roomId))
  } catch {
    // Storage blocked or full: undo still works for this visit.
  }
}

// Unconfirmed Decision checkpoints include the edited photo, not just the
// previous history. A failed network save can be recovered on the next visit.
export async function loadDecisionDraft(roomId) {
  try {
    return await withStore('readonly', (store) => store.get(`decision-draft:${roomId}`))
  } catch {
    return null
  }
}

export function saveDecisionDraft(roomId, snapshot) {
  return withStore('readwrite', (store) => store.put(snapshot, `decision-draft:${roomId}`))
}

export function clearDecisionDraft(roomId) {
  return withStore('readwrite', (store) => store.delete(`decision-draft:${roomId}`))
}
