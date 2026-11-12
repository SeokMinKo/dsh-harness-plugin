import test from 'node:test'
import assert from 'node:assert/strict'
import { RoomHistory, chunkSize } from '../src/history.js'

function storage(rows = []) {
  return {
    records: new Map(rows),
    writes: 0,
    get(key) { return this.records.get(key) },
    entries() { return this.records.entries() },
    async put(key, value) {
      if (this.fail) throw new Error('write failed')
      this.writes++
      this.records.set(key, structuredClone(value))
    },
  }
}
const messages = count => Array.from({ length: count }, (_, i) => ({ id: 'm' + i, status: 'complete', text: 'x'.repeat(50) }))

test('migrates a large legacy room and preserves page boundaries and ID lookup', async () => {
  const rooms = storage([['r', { messages: messages(263) }]])
  const chunks = storage()
  const history = new RoomHistory(rooms, chunks)
  assert.equal(history.position('r', 'm0'), 0)
  await history.update('r', room => { room.title = 'Migrated' })
  const result = rooms.get('r')
  assert.equal(result.base, 2 * chunkSize)
  assert.equal(result.messages.length, 263 - 2 * chunkSize)
  assert.equal(chunks.writes, 2)
  assert.equal(history.at('r', 0).id, 'm0')
  assert.equal(history.position('r', 'm260'), 260)
  assert.deepEqual(history.page('r', 'm131', 6).rows.map(row => row.id), ['m125', 'm126', 'm127', 'm128', 'm129', 'm130'])
  const restarted = new RoomHistory(rooms, chunks)
  assert.equal(restarted.position('r', 'm0'), 0)
  assert.equal(restarted.position('r', 'm262'), 262)
})

test('failed room commit leaves staged chunks invisible and retry preserves every row', async () => {
  const rooms = storage([['r', { messages: messages(200) }]])
  const chunks = storage()
  const history = new RoomHistory(rooms, chunks)
  rooms.fail = true
  await assert.rejects(history.update('r', room => room.messages.push({ id: 'new' })), /write failed/)
  assert.equal(chunks.writes, 1)
  assert.equal(history.get('r').base, undefined)
  assert.equal(history.position('r', 'new'), undefined)
  rooms.fail = false
  await history.update('r', room => room.messages.push({ id: 'new' }))
  assert.equal(history.position('r', 'new'), 200)
  assert.equal(history.at('r', 0).id, 'm0')
  assert.equal(history.at('r', 200).id, 'new')
})

test('concurrent updates serialize and a pending prefix is never archived', async () => {
  const rows = messages(200)
  rows[0].status = 'running'
  const rooms = storage([['r', { messages: rows }]])
  const chunks = storage()
  const history = new RoomHistory(rooms, chunks)
  await Promise.all([history.update('r', room => room.messages.push({ id: 'a' })),
    history.update('r', room => room.messages.push({ id: 'b' }))])
  assert.equal(chunks.writes, 0)
  assert.equal(history.position('r', 'a'), 200)
  assert.equal(history.position('r', 'b'), 201)
  await history.update('r', room => { room.messages[0].status = 'complete' })
  assert.equal(chunks.writes, 1)
  assert.equal(history.position('r', 'b'), 201)
})
