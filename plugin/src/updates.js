export function changedPositions(previous, current) {
  const base = current.base ?? 0
  const oldBase = previous.base ?? 0
  const changed = []
  for (let offset = 0; offset < current.messages.length; offset++) {
    const position = base + offset
    const row = current.messages[offset]
    const old = previous.messages[position - oldBase]
    if (!old || old.status !== row.status || old.text !== row.text || old.error !== row.error || old.asksUser !== row.asksUser
      || old.truncated !== row.truncated || old.handoffWarningCount !== row.handoffWarningCount) {
      changed.push(position)
    }
  }
  return changed
}

export class RoomUpdates {
  constructor() {
    this.channels = new Map()
  }

  publish(teamId, positions = []) {
    const channel = this.channels.get(teamId)
    if (!channel) return
    for (const callback of channel.listeners) callback(positions)
  }

  live(teamId, position) {
    const channel = this.channels.get(teamId)
    if (!channel) return
    channel.live.add(position)
    channel.timer ??= setTimeout(() => {
      channel.timer = undefined
      const positions = [...channel.live]
      channel.live.clear()
      this.publish(teamId, positions)
    }, 80)
  }

  async *watch(teamId, signal, snapshot, patch) {
    if (signal.aborted) return
    let channel = this.channels.get(teamId)
    if (!channel) {
      channel = { listeners: new Set(), live: new Set(), timer: undefined }
      this.channels.set(teamId, channel)
    }
    let pending = false
    let full = false
    const positions = new Set()
    let ready = Promise.withResolvers()
    const wake = () => ready.resolve()
    const listener = changed => {
      pending = true
      if (!full) {
        for (const position of changed) positions.add(position)
        if (positions.size > 64) { positions.clear(); full = true }
      }
      wake()
    }
    channel.listeners.add(listener)
    signal.addEventListener('abort', wake, { once: true })
    try {
      yield snapshot()
      while (!signal.aborted) {
        if (!pending) await ready.promise
        if (signal.aborted) break
        const frame = full ? snapshot() : patch([...positions])
        pending = false
        full = false
        positions.clear()
        ready = Promise.withResolvers()
        yield frame
      }
    } finally {
      signal.removeEventListener('abort', wake)
      channel.listeners.delete(listener)
      if (!channel.listeners.size) {
        clearTimeout(channel.timer)
        this.channels.delete(teamId)
      }
    }
  }
}
