import { clipText, parseHandoff } from './routing.js'

const inputPrefix = 'dsh-team-chat:'

export function roomInputId(run) {
  return inputPrefix + run.id
}

function belongsTo(run, message) {
  return message.source.kind === 'user' && message.source.rpcId === roomInputId(run)
}

export function isStaleRoomInput(run, message) {
  if (message.source.kind !== 'user' || !message.source.rpcId?.startsWith(inputPrefix)) return false
  return !run || run.finished || run.signal?.aborted || !belongsTo(run, message)
}

// These DSH sources represent independent requests. Runtime and tool context
// produced inside the native turn keep their normal step semantics.
const independentSources = new Set(['user', 'agent-message', 'team-message', 'schedule', 'goal'])

export async function isolateRoomStep(run, { agent, messages, turn }, next) {
  const stale = message => isStaleRoomInput(run, message)
  const owned = run?.claimed === turn && !run.finished
  const foreign = message => owned && independentSources.has(message.source.kind) && !belongsTo(run, message) && !stale(message)
  if (!owned && !messages.some(stale)) return next()
  const deferred = messages.filter(foreign)
  if (deferred.length) {
    run.deferredIds ??= new Set()
    const nextTurn = agent.inbox.nextTurn
    const offset = nextTurn.findIndex(message => !run.deferredIds.has(message.id))
    agent.inbox.splice('next-turn', offset < 0 ? nextTurn.length : offset, 0, deferred)
    for (const message of deferred) run.deferredIds.add(message.id)
  }
  if (messages.length && messages.every(stale)) return { kind: 'reject' }
  const decision = await next()
  if (decision.kind !== 'enter') return decision
  // Recheck the actual admitted list, including replacements from middleware.
  const admitted = decision.messages.filter(message => !stale(message) && !foreign(message))
  // A late steering message alone must not create a second room response
  // after the native agent has already committed a final answer.
  const deferredOnly = deferred.length && messages.every(message => foreign(message) || stale(message))
  return { ...decision, messages: deferredOnly && run.finalReply?.text
    ? admitted.filter(message => message.source.kind !== 'runtime-context') : admitted }
}

export function claimRoomTurn(run, message, turn) {
  if (run && !run.finished && belongsTo(run, message)) run.claimed = turn
}

export function discardRoomInput(run, message) {
  if (!run || run.finished || !belongsTo(run, message)) return
  run.finished = true
  run.done.resolve({ kind: 'aborted' })
}

export function observeRoomTurn(run, session, event) {
  if (!run || run.memberId !== session.id || run.finished) return
  const data = event.data
  switch (event.type) {
    case 'assistant/message':
      if (run.claimed === data.turn) {
        const blocks = data.message.content
        const answer = blocks.filter(block => block.type === 'text').map(block => block.text).join('')
        const parsed = parseHandoff(answer)
        const text = clipText(parsed.text, 12_000)
        run.finalReply = !data.interrupted && !blocks.some(block => block.type === 'tool-call')
          ? { text, names: parsed.names, truncated: text !== parsed.text } : undefined
        if (text) run.text = text
        run.live = ''
      }
      break
    case 'turn/end':
      if (run.claimed !== data.turn) break
      run.finished = true
      run.done.resolve(data.reason)
      break
  }
}

export function observeRoomStream(run, frame) {
  if (!run || run.finished || run.claimed === undefined) return
  if (frame.type === 'start') {
    if (frame.turn !== run.claimed) return
    run.attempt = frame.attemptId
    run.live = ''
  }
  if (frame.type === 'chunk' && frame.attemptId === run.attempt && frame.chunk.type === 'text-delta') {
    run.live = (run.live + frame.chunk.text).slice(0, 12_000)
  }
}

export function stopRoomTurn(run, agent) {
  if (!run || !agent || run.finished) return
  if (run.claimed !== undefined) {
    agent.cancel({ kind: 'user' }, { keepInbox: true })
    return
  }
  const queued = agent.inbox.nextTurn.find(message => belongsTo(run, message))
  if (queued) agent.inbox.remove(queued.id)
}

export function nativeAttention(run) {
  if (!run?.attention?.size) return undefined
  return [...run.attention.values()].find(item => item.kind === 'approval') ?? run.attention.values().next().value
}

export async function observeNativeAttention(run, detail, next, changed) {
  if (!run || run.claimed === undefined || run.finished) return next()
  run.attention ??= new Map()
  const token = Symbol()
  run.attention.set(token, detail)
  changed()
  try {
    return await next()
  } finally {
    run.attention.delete(token)
    changed()
  }
}
