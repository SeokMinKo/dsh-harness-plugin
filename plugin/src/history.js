import { createHash } from 'node:crypto'
import { changedPositions } from './updates.js'
import { isPending } from './room-state.js'

export const chunkSize = 64
const hotFloor = 96

function chunkKey(teamId, base) {
  return createHash('sha256').update(teamId).digest('hex') + '-' + base
}

function metadata({ messages, ...fields }) {
  return fields
}

export class RoomHistory {
  constructor(rooms, chunks) {
    this.rooms = rooms
    this.chunks = chunks
    this.writes = new Map()
    this.indexes = new Map()
  }

  entries() { return this.rooms.entries() }
  get(teamId) { return this.rooms.get(teamId) }
  put(teamId, room) { return this.rooms.put(teamId, room) }

  chunk(teamId, base) {
    const chunk = this.chunks.get(chunkKey(teamId, base))
    if (!chunk || chunk.length !== chunkSize) throw new Error('보관된 대화 기록을 읽을 수 없습니다. 위치 ' + base)
    return chunk
  }

  at(teamId, position) {
    const room = this.get(teamId)
    const base = room.base ?? 0
    if (position >= base) return room.messages[position - base]
    if (position < 0) return undefined
    const start = Math.floor(position / chunkSize) * chunkSize
    return this.chunk(teamId, start)[position - start]
  }

  position(teamId, id) {
    let index = this.indexes.get(teamId)
    if (!index) {
      index = new Map()
      const room = this.get(teamId)
      const base = room.base ?? 0
      for (let start = 0; start < base; start += chunkSize) {
        this.chunk(teamId, start).forEach((message, i) => index.set(message.id, start + i))
      }
      room.messages.forEach((message, i) => index.set(message.id, base + i))
      this.indexes.set(teamId, index)
    }
    return index.get(id)
  }

  find(teamId, id) {
    const position = this.position(teamId, id)
    return position === undefined ? undefined : this.at(teamId, position)
  }

  page(teamId, before, size) {
    const room = this.get(teamId)
    const end = before ? this.position(teamId, before) : (room.base ?? 0) + room.messages.length
    if (end === undefined) throw new Error('이전 메시지 위치를 찾을 수 없습니다.')
    const start = Math.max(0, end - size)
    const rows = []
    for (let position = start; position < end; position++) rows.push(this.at(teamId, position))
    return { start, rows }
  }

  update(teamId, mutate) {
    const operation = (this.writes.get(teamId) ?? Promise.resolve()).then(() => this.commit(teamId, mutate))
    const settled = operation.then(() => undefined, () => undefined)
    this.writes.set(teamId, settled)
    void settled.then(() => { if (this.writes.get(teamId) === settled) this.writes.delete(teamId) })
    return operation
  }

  async commit(teamId, mutate) {
    const previous = this.get(teamId)
    if (!previous) throw new Error('대화방을 찾을 수 없습니다.')
    const draft = structuredClone(previous)
    mutate(draft)
    const positions = changedPositions(previous, draft)
    const base = draft.base ?? 0
    let archived = 0
    while (draft.messages.length - archived >= hotFloor + chunkSize) {
      const chunk = draft.messages.slice(archived, archived + chunkSize)
      if (chunk.some(isPending)) break
      // Readers see a chunk only after the durable room cursor advances.
      await this.chunks.put(chunkKey(teamId, base + archived), chunk)
      archived += chunkSize
    }
    if (!archived && !positions.length && JSON.stringify(metadata(previous)) === JSON.stringify(metadata(draft))) {
      return { changed: false, positions }
    }
    const appended = draft.messages.slice(previous.messages.length)
    const appendBase = base + previous.messages.length
    if (archived) {
      draft.base = base + archived
      draft.messages = draft.messages.slice(archived)
    }
    await this.rooms.put(teamId, draft)
    const index = this.indexes.get(teamId)
    if (index) appended.forEach((message, i) => index.set(message.id, appendBase + i))
    return { changed: true, positions }
  }
}
