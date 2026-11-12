import { performance } from 'node:perf_hooks'
import { RoomHistory } from '../src/history.js'

const sampleSize = 5000
const updates = 256
const text = '검증 결과 · storage metrics '.repeat(8)
const message = i => ({ id: 'message-' + i, author: 'test', kind: 'bot', status: 'complete', text, time: i })
const initial = { title: 'Performance fixture', messages: Array.from({ length: sampleSize }, (_, i) => message(i)) }

function measuredTable(records = []) {
  const state = new Map(records)
  return {
    bytes: 0,
    get: key => state.get(key),
    async put(key, row) {
      const serialized = JSON.stringify(row)
      this.bytes += Buffer.byteLength(serialized)
      state.set(key, row)
    },
  }
}

const baseline = measuredTable([['room', initial]])
const baselineTimes = []
for (let i = 0; i < updates; i++) {
  const t = performance.now()
  const draft = structuredClone(baseline.get('room'))
  draft.messages.push(message(sampleSize + i))
  await baseline.put('room', draft)
  baselineTimes.push(performance.now() - t)
}

const rooms = measuredTable([['room', initial]])
const archive = measuredTable()
const history = new RoomHistory(rooms, archive)
await history.update('room', room => { room.title = 'Migrated fixture' })
rooms.bytes = 0
archive.bytes = 0
const updatedTimes = []
for (let i = 0; i < updates; i++) {
  const t = performance.now()
  await history.update('room', room => { room.messages.push(message(sampleSize + i)) })
  updatedTimes.push(performance.now() - t)
}

const p50 = times => times.toSorted((a, b) => a - b)[Math.floor(times.length / 2)]
const updatedBytes = rooms.bytes + archive.bytes
console.log(JSON.stringify({
  initialMessages: sampleSize, appends: updates, fixtureTextUtf8Bytes: Buffer.byteLength(text),
  baselineBytesPerAppend: Math.round(baseline.bytes / updates),
  upgradedBytesPerAppend: Math.round(updatedBytes / updates),
  baselineP50Ms: Number(p50(baselineTimes).toFixed(3)),
  upgradedP50Ms: Number(p50(updatedTimes).toFixed(3)),
  byteReductionPercent: Number((100 * (1 - updatedBytes / baseline.bytes)).toFixed(2)),
}, null, 2))
