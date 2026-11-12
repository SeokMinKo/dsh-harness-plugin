import test from 'node:test'
import assert from 'node:assert/strict'
import { claimRoomTurn, discardRoomInput, isStaleRoomInput, observeRoomTurn, stopRoomTurn } from '../src/turn.js'

function fixture() {
  const input = { id: 'room-input', source: { kind: 'user', rpcId: 'dsh-team-chat:room' } }
  const unrelated = { id: 'native-input', source: { kind: 'user', rpcId: 'native' } }
  const removed = []
  const cancelled = []
  const agent = { session: { id: 'target' },
    inbox: { nextTurn: [input, unrelated], remove: id => removed.push(id) },
    cancel: (...args) => cancelled.push(args),
  }
  const run = { id: 'room', memberId: 'target', text: '', done: Promise.withResolvers() }
  const event = (type, data) => observeRoomTurn(run, agent.session, { type, data })
  return { event, input, unrelated, agent, run, removed, cancelled }
}

test('correlates assistant text and completion with the exact native turn', async () => {
  const { event, input, unrelated, run } = fixture()
  claimRoomTurn(run, unrelated, 1)
  event('assistant/message', { turn: 1, message: { content: [{ type: 'text', text: 'private' }] } })
  event('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.equal(run.text, '')
  claimRoomTurn(run, input, 2)
  event('assistant/message', { turn: 2, message: { content: [{ type: 'reasoning', text: 'hidden' }, { type: 'text', text: 'shared' }] } })
  event('turn/end', { turn: 2, reason: { kind: 'completed' } })
  assert.equal(run.text, 'shared')
  assert.equal((await run.done.promise).kind, 'completed')
})

test('stopping removes its exact queued item or aborts its claimed turn with inbox intact', () => {
  const { agent, run, event, input, removed, cancelled } = fixture()
  stopRoomTurn(run, agent)
  assert.deepEqual(removed, ['room-input'])
  assert.deepEqual(cancelled, [])
  claimRoomTurn(run, input, 1)
  stopRoomTurn(run, agent)
  assert.deepEqual(cancelled, [[{ kind: 'user' }, { keepInbox: true }]])
  event('turn/end', { turn: 1, reason: { kind: 'aborted' } })
  stopRoomTurn(run, agent)
  assert.equal(cancelled.length, 1)
})

test('settles native rejection before the model sees the input and notices a discarded input', async () => {
  const blocked = fixture()
  claimRoomTurn(blocked.run, blocked.input, 3)
  blocked.event('turn/end', { turn: 3, reason: { kind: 'blocked' } })
  assert.equal((await blocked.run.done.promise).kind, 'blocked')
  const removed = fixture()
  discardRoomInput(removed.run, removed.unrelated)
  assert.equal(removed.run.finished, undefined)
  discardRoomInput(removed.run, removed.input)
  assert.equal((await removed.run.done.promise).kind, 'aborted')
})

test('recognizes queued room inputs left by a crash while preserving normal native inputs', () => {
  const { input, unrelated, run } = fixture()
  assert.equal(isStaleRoomInput(undefined, input), true)
  assert.equal(isStaleRoomInput(undefined, unrelated), false)
  assert.equal(isStaleRoomInput(run, input), false)
  run.signal = AbortSignal.abort()
  assert.equal(isStaleRoomInput(run, input), true)
})

test('exposes the owned native approval without deciding it and clears the signal when it settles', async () => {
  const { nativeAttention, observeNativeAttention } = await import('../src/turn.js')
  const deferred = Promise.withResolvers()
  const { run, input } = fixture()
  let changes = 0
  claimRoomTurn(run, input, 1)
  const operation = observeNativeAttention(run, { kind: 'approval', toolName: 'fixture' }, () => deferred.promise, () => { changes++ })
  assert.deepEqual(nativeAttention(run), { kind: 'approval', toolName: 'fixture' })
  const question = observeNativeAttention(run, { kind: 'question' }, async () => 'answer', () => { changes++ })
  assert.equal(await question, 'answer')
  assert.equal(nativeAttention(run).kind, 'approval')
  deferred.resolve('rejected')
  assert.equal(await operation, 'rejected')
  assert.equal(nativeAttention(run), undefined)
  assert.equal(changes, 4)
  assert.equal(await observeNativeAttention(undefined, { kind: 'approval' }, async () => 'unavailable', () => { changes++ }), 'unavailable')
  assert.equal(changes, 4)
})

test('foreign steering is deferred into native turns in arrival order, outside the room payload', async () => {
  const { isolateRoomStep } = await import('../src/turn.js')
  const { run, input, unrelated } = fixture()
  const ordinary = [{ ...unrelated, id: 'later-existing' }]
  const agent = { inbox: { nextTurn: ordinary, splice(_target, start, remove, rows) { ordinary.splice(start, remove, ...rows) } } }
  const external = { ...unrelated, id: 'peer', source: { kind: 'agent-message' } }
  const toolContext = { ...unrelated, id: 'context', source: { kind: 'runtime-context' } }
  claimRoomTurn(run, input, 7)
  const first = [input, unrelated, toolContext]
  assert.deepEqual((await isolateRoomStep(run, { agent, turn: 7, messages: first },
    async () => ({ kind: 'enter', messages: first }))).messages, [input, toolContext])
  assert.deepEqual((await isolateRoomStep(run, { agent, turn: 7, messages: [external] },
    async () => ({ kind: 'enter', messages: [external] }))).messages, [])
  assert.deepEqual(ordinary.map(message => message.id), [unrelated.id, external.id, 'later-existing'])
  const elsewhere = await isolateRoomStep(run, { agent, turn: 8, messages: [unrelated] },
    async () => ({ kind: 'enter', messages: [unrelated] }))
  assert.deepEqual(elsewhere.messages, [unrelated])
})

test('tool preambles and empty terminal steps cannot supply a handoff', () => {
  const { run, input, event } = fixture()
  claimRoomTurn(run, input, 1)
  event('assistant/message', { turn: 1, message: { content: [
    { type: 'text', text: '도구 전\n[[team-chat: @test]]' }, { type: 'tool-call' },
  ] } })
  assert.equal(run.finalReply, undefined)
  event('assistant/message', { turn: 1, message: { content: [] } })
  assert.deepEqual(run.finalReply?.names, [])
  assert.equal(run.finalReply?.text, '')
})

test('long completed replies retain the final handoff while the preview keeps useful ends', () => {
  const { run, input, event } = fixture()
  claimRoomTurn(run, input, 1)
  event('assistant/message', { turn: 1, message: { content: [
    { type: 'text', text: '앞부분 ' + '한'.repeat(15_000) + ' 끝부분\n[[team-chat: @test]]' },
  ] } })
  assert.deepEqual(run.finalReply?.names, ['test'])
  assert.equal(run.finalReply?.truncated, true)
  assert.match(run.finalReply?.text, /^앞부분/)
  assert.match(run.finalReply?.text, /끝부분$/)
  assert.ok(run.finalReply?.text.length <= 12_000)
})
