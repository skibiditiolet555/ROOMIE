import test from 'node:test'
import assert from 'node:assert/strict'
import { createDecisionCheckpoint } from './decisionCheckpoint.js'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('serializes checkpoints so a slow older save cannot overtake a newer one', async () => {
  const calls = []
  const releases = []
  const checkpoint = createDecisionCheckpoint({
    delay: 60_000,
    persist: (snapshot) => new Promise((resolve) => { calls.push(snapshot.value); releases.push(resolve) }),
    writeDraft: async () => {},
    clearDraft: async () => {},
  })
  checkpoint.setSnapshot({ value: 'old' })
  const oldSave = checkpoint.flush()
  await tick()
  checkpoint.setSnapshot({ value: 'new' })
  const newSave = checkpoint.flush()
  await tick()
  assert.deepEqual(calls, ['old'])
  releases[0]('old-result')
  await tick()
  assert.deepEqual(calls, ['old', 'new'])
  releases[1]('new-result')
  assert.equal(await oldSave, 'old-result')
  assert.equal(await newSave, 'new-result')
  assert.equal(checkpoint.isDirty(), false)
  checkpoint.cancelTimer()
})

test('keeps a failed checkpoint dirty and supports an explicit retry', async () => {
  let attempts = 0
  const statuses = []
  const checkpoint = createDecisionCheckpoint({
    delay: 60_000,
    persist: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('offline')
      return 'saved'
    },
    writeDraft: async () => {},
    clearDraft: async () => {},
  })
  checkpoint.subscribe((status) => statuses.push(status.state))
  checkpoint.setSnapshot({ value: 'draft' })
  await assert.rejects(checkpoint.flush(), /offline/)
  assert.equal(checkpoint.isDirty(), true)
  assert.equal(statuses.at(-1), 'error')
  assert.equal(await checkpoint.flush(), 'saved')
  assert.equal(checkpoint.isDirty(), false)
  assert.equal(statuses.at(-1), 'saved')
  checkpoint.cancelTimer()
})
