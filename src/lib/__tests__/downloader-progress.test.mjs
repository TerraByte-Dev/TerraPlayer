// Unit tests for downloader-progress.ts — run with:
//   node --no-warnings --experimental-strip-types --test src/lib/__tests__/*.test.mjs
// (npm test). Pure logic only — no electron/node-fs dependencies.
import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeRun } from '../downloader-progress.ts'

test('empty run → zeros, not complete', () => {
  assert.deepEqual(summarizeRun([], []), {
    total: 0, done: 0, skipped: 0, failed: 0, active: 0, pending: 0, finished: 0, complete: false,
  })
})

test('all queued → all pending, not complete', () => {
  const rows = [{ i: 1, dlStage: 'queued' }, { i: 2, dlStage: 'queued' }, { i: 3 }]
  const p = summarizeRun(rows, [1, 2, 3])
  assert.equal(p.total, 3)
  assert.equal(p.pending, 3)
  assert.equal(p.finished, 0)
  assert.equal(p.complete, false)
})

test('mixed in-flight → done/active/pending split, not complete', () => {
  const rows = [
    { i: 1, dlStage: 'done' },
    { i: 2, dlStage: 'downloading' },
    { i: 3, dlStage: 'embedding' },
    { i: 4, dlStage: 'queued' },
  ]
  const p = summarizeRun(rows, [1, 2, 3, 4])
  assert.equal(p.done, 1)
  assert.equal(p.active, 2)
  assert.equal(p.pending, 1)
  assert.equal(p.finished, 1)
  assert.equal(p.complete, false)
})

test('all terminal → complete, finished counts done+skipped+failed', () => {
  const rows = [
    { i: 1, dlStage: 'done' },
    { i: 2, dlStage: 'skipped' },
    { i: 3, dlStage: 'failed' },
  ]
  const p = summarizeRun(rows, [1, 2, 3])
  assert.equal(p.finished, 3)
  assert.equal(p.done, 1)
  assert.equal(p.skipped, 1)
  assert.equal(p.failed, 1)
  assert.equal(p.complete, true)
})

test('rows not in downloadOrder are ignored', () => {
  const rows = [{ i: 1, dlStage: 'done' }, { i: 2, dlStage: 'done' }]
  const p = summarizeRun(rows, [1])
  assert.equal(p.total, 1)
  assert.equal(p.done, 1)
  assert.equal(p.complete, true)
})

test('row in order but missing from rows leaves run short of complete', () => {
  const rows = [{ i: 1, dlStage: 'done' }]
  const p = summarizeRun(rows, [1, 2])
  assert.equal(p.total, 2)
  assert.equal(p.done, 1)
  assert.equal(p.finished, 1)
  assert.equal(p.complete, false)
})
