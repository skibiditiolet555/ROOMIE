// One ordered save stream for this page. A slower, older request must never
// overwrite a newer checkpoint or mark it saved. Dependencies are injectable
// so races and storage failures can be tested without a server or AI calls.
export function createDecisionCheckpoint({ persist, writeDraft, clearDraft, delay = 600 }) {
  let snapshot = null
  let revision = 0
  let savedRevision = 0
  let timer
  let queue = Promise.resolve()
  let localQueue = Promise.resolve()
  let status = { state: 'idle', error: '' }
  const listeners = new Set()
  const notify = (next) => { status = next; listeners.forEach((listener) => listener(next)) }
  const local = (task) => {
    localQueue = localQueue.catch(() => {}).then(task)
    // Local storage can be unavailable. Remote saving still works; failed
    // remote writes remain visibly unsaved and protected by beforeunload.
    localQueue.catch(() => {})
    return localQueue
  }
  const same = (a, b) => a && b && Object.keys(b).every((key) => a[key] === b[key])

  function setSnapshot(next) {
    if (!next || same(snapshot, next)) return
    snapshot = next
    revision += 1
    local(() => writeDraft(next))
    notify({ state: 'pending', error: '' })
    clearTimeout(timer)
    timer = setTimeout(() => { flush().catch(() => {}) }, delay)
  }

  function flush(extra = {}) {
    clearTimeout(timer)
    if (!snapshot) return Promise.resolve()
    const next = snapshot
    const version = revision
    const operation = queue.catch(() => {}).then(async () => {
      if (version < savedRevision || (version === savedRevision && !Object.keys(extra).length)) return
      if (version === revision) notify({ state: 'saving', error: '' })
      try {
        const result = await persist(next, extra)
        savedRevision = version
        if (version === revision) {
          await local(() => clearDraft(next)).catch(() => {})
          if (version === revision) notify({ state: 'saved', error: '' })
        }
        return result
      } catch (error) {
        if (version === revision) notify({ state: 'error', error: error.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่' })
        throw error
      }
    })
    queue = operation
    return operation
  }

  return {
    setSnapshot, flush,
    isDirty: () => revision > savedRevision,
    cancelTimer: () => clearTimeout(timer),
    subscribe(listener) { listeners.add(listener); listener(status); return () => listeners.delete(listener) },
  }
}
