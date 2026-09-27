export function mergeSuggestedDecisions(current, suggestions, protectedIds = new Set()) {
  const next = { ...current }
  for (const item of suggestions) {
    if (!protectedIds.has(item.id) && Object.hasOwn(current, item.id)) {
      next[item.id] = ['keep', 'replace', 'remove'].includes(item.decision) ? item.decision : 'keep'
    }
  }
  return next
}

export function roomsNeedingDetection(designs, objects) {
  return designs.filter((room) => !objects.some((item) => item.roomId === room.sourceImageId))
}

export function initialObjectForRoom(objects) {
  const roomId = objects[0]?.roomId
  return objects.find((item) => item.roomId === roomId && item.traced && !item.removedFromImage) ?? objects[0]
}

export function decisionTotal(objects, decisions, briefs, catalog = []) {
  return objects.reduce((sum, item) => {
    const decision = decisions[item.id] || 'keep'
    if (decision === 'remove') return sum
    if (decision === 'keep') return sum + (item.existing ? 0 : Number(item.price) || 0)
    const brief = briefs[item.id] ?? {}
    const picked = catalog.find((product) => product.id === brief.productId)
    const price = picked?.price ?? (brief.productId ? brief.productPrice : null)
      ?? (Number(brief.budget) > 0 ? Number(brief.budget) : item.price)
    return sum + Math.max(0, Number(price) || 0)
  }, 0)
}

export function realOutlines(item) {
  if (!item?.traced) return []
  const polygons = item.outlines?.length ? item.outlines : [item.outline]
  return polygons.filter((polygon) => Array.isArray(polygon) && polygon.length >= 3
    && polygon.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)))
}

export function appliedDecision(item) {
  return item.appliedDecision ?? (item.removedFromImage ? 'remove' : 'keep')
}

export function historyEntry(room, item, action) {
  return {
    imageUrl: room.generatedImageUrl,
    objectId: item.id,
    objectName: item.name,
    action,
    previousDecision: appliedDecision(item),
    objectSnapshot: { ...item },
    replacementBrief: item.appliedBrief ?? null,
    outline: realOutlines(item)[0] ?? null,
  }
}

export function restoreHistoryObject(item, entry, direction) {
  if (entry.objectSnapshot) return { ...entry.objectSnapshot }
  // Older histories did not store geometry. Never reuse a replacement's mask
  // on a different photo; it must be traced again before another image edit.
  const decision = direction === 'undo' ? entry.previousDecision ?? 'keep'
    : entry.action === 'restore' ? 'keep' : entry.action
  return {
    ...item, appliedDecision: decision, removedFromImage: decision === 'remove',
    outline: entry.outline ?? undefined, outlines: undefined,
    traced: Boolean(entry.outline?.length >= 3), scanned: false, notInPhoto: false,
  }
}
