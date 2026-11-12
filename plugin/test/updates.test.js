import test from 'node:test'
import assert from 'node:assert/strict'
import { RoomUpdates, changedPositions } from '../src/updates.js'

test('initial snapshot then changed positions only, with cancellation releasing the watcher', async () => {
  const changes = new RoomUpdates()
  const controller = new AbortController()
  const stream = changes.watch('room', controller.signal, () => ['snapshot'], positions => positions)[Symbol.asyncIterator]()
  assert.deepEqual((await stream.next()).value, ['snapshot'])
  changes.publish('other', [9])
  changes.publish('room', [2])
  changes.publish('room', [2, 3])
  assert.deepEqual((await stream.next()).value, [2, 3])
  const waiting = stream.next()
  controller.abort()
  assert.equal((await waiting).done, true)
  assert.equal(changes.channels.size, 0)
})

test('slow consumers resnapshot after too many positions and live updates coalesce', async () => {
  const changes = new RoomUpdates()
  const stream = changes.watch('room', new AbortController().signal, () => 'snapshot', positions => positions)[Symbol.asyncIterator]()
  await stream.next()
  changes.publish('room', Array.from({ length: 70 }, (_, i) => i))
  assert.equal((await stream.next()).value, 'snapshot')
  changes.live('room', 8)
  changes.live('room', 8)
  assert.deepEqual((await stream.next()).value, [8])
  await stream.return()
  assert.equal(changes.channels.size, 0)
})

test('position diff includes updated and appended rows but excludes unchanged archived rows', () => {
  const previous = { base: 3, messages: [{ text: 'a' }, { status: 'queued' }, { text: 'c' }] }
  const current = { base: 4, messages: [{ status: 'stopped' }, { text: 'c' }, { text: 'd' }] }
  assert.deepEqual(changedPositions(previous, current), [4, 6])
})
