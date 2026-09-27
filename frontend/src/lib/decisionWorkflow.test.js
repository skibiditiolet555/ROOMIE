import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decisionTotal, historyEntry, initialObjectForRoom, mergeSuggestedDecisions, restoreHistoryObject, roomsNeedingDetection,
} from './decisionWorkflow.js'

test('late AI suggestions preserve manual and saved decisions', () => {
  const current = { sofa: 'remove', rug: 'keep' }
  const suggestions = [{ id: 'sofa', decision: 'keep' }, { id: 'rug', decision: 'replace' }]
  assert.deepEqual(mergeSuggestedDecisions(current, suggestions, new Set(['sofa'])), {
    sofa: 'remove', rug: 'replace',
  })
})

test('detects every photo that has no object records yet', () => {
  const designs = [{ sourceImageId: 'photo-0' }, { sourceImageId: 'photo-1' }, { sourceImageId: 'photo-2' }]
  const objects = [{ id: 'sofa', roomId: 'photo-0' }, { id: 'rug', roomId: 'photo-2' }]
  assert.deepEqual(roomsNeedingDetection(designs, objects), [{ sourceImageId: 'photo-1' }])
})

test('initial object always belongs to the photo that opens', () => {
  const objects = [
    { id: 'room-1-hidden', roomId: 'photo-0', traced: false },
    { id: 'room-2-first-mask', roomId: 'photo-1', traced: true },
    { id: 'room-1-visible', roomId: 'photo-0', traced: true },
  ]
  assert.equal(initialObjectForRoom(objects).id, 'room-1-visible')
})

test('a selected catalog product contributes its real price, not an edited allowance', () => {
  const objects = [{ id: 'sofa', price: 1000 }]
  const decisions = { sofa: 'replace' }
  const briefs = { sofa: { productId: 'real-sofa', productPrice: 7200, budget: 100 } }
  assert.equal(decisionTotal(objects, decisions, briefs), 7200)
})

test('undo and redo restore the matching object geometry', () => {
  const oldObject = { id: 'sofa', outline: [[1, 1], [2, 1], [2, 2]], traced: true, appliedDecision: 'keep' }
  const newObject = { id: 'sofa', outline: [[5, 5], [9, 5], [9, 9]], traced: true, appliedDecision: 'replace' }
  const room = { generatedImageUrl: 'new-image' }
  const undoEntry = { ...historyEntry({ generatedImageUrl: 'old-image' }, oldObject, 'replace'), previousDecision: 'keep' }
  assert.deepEqual(restoreHistoryObject(newObject, undoEntry, 'undo'), oldObject)
  const redoEntry = historyEntry(room, newObject, 'replace')
  assert.deepEqual(restoreHistoryObject(oldObject, redoEntry, 'redo'), newObject)
})
