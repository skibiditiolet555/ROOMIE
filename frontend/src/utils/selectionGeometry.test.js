import test from 'node:test'
import assert from 'node:assert/strict'
import { containsPoint, imageKey, maskToOutline } from './selectionGeometry.js'

function makeMask(selectedLabel) {
  const mask = new Uint8Array(100 * 100).fill(selectedLabel === 0 ? 255 : 0)
  for (let y = 20; y < 70; y++) for (let x = 10; x < 60; x++) {
    if (x >= 35 && y < 45) continue // concavity that a bounding box would fill
    mask[y * 100 + x] = selectedLabel
  }
  mask[90 * 100 + 90] = selectedLabel // disconnected speck
  return mask
}

test('traces the clicked object with either category polarity, retaining concavity', () => {
  const a = maskToOutline(100, 100, makeMask(0), .2, .3)
  const b = maskToOutline(100, 100, makeMask(255), .2, .3)
  assert.deepEqual(a, b)
  assert.ok(a.length > 4)
  assert.ok(containsPoint(a, 20, 30))
  assert.ok(!containsPoint(a, 50, 30))
  assert.ok(!containsPoint(a, 90, 90))
  assert.ok(a.every((p) => p.x >= 10 && p.x <= 60 && p.y >= 20 && p.y <= 70))
})

test('does not outline internal holes as separate furniture shapes', () => {
  const mask = new Uint8Array(10000).fill(255)
  for (let y=20; y<70; y++) for (let x=10; x<60; x++) mask[y*100+x]=0
  for (let y=35; y<45; y++) for (let x=25; x<35; x++) mask[y*100+x]=255
  const outline=maskToOutline(100,100,mask,.2,.3)
  assert.ok(containsPoint(outline,30,40))
  assert.ok(outline.every((p) => p.x===10 || p.x===60 || p.y===20 || p.y===70))
})

test('rejects whole-image/background masks instead of showing a rectangle', () => {
  assert.throws(() => maskToOutline(100,100,new Uint8Array(10000),.5,.5))
})

test('different source photos do not share saved geometry', () => {
  assert.notEqual(imageKey('photo-A'), imageKey('photo-B'))
  assert.equal(imageKey('photo-A'), imageKey('photo-A'))
})
