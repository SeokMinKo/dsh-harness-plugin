import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptSend, selectStop } from '../src/room-state.js'

const members = [{ id: 'lead', name: 'lead', role: 'lead' }, { id: 'test', name: 'test', role: 'teammate' }]
const request = { id: 'request', text: '@test hello', tools: false }
const queued = id => ({ id, kind: 'user', status: 'queued' })

test('send accepts only an identical replay for a request ID', () => {
  const room = { members, messages: [] }
  assert.equal(acceptSend(room, request, 12), true)
  assert.equal(acceptSend(room, request, 13), false)
  assert.throws(() => acceptSend(room, { ...request, text: 'changed' }, 13), /ID/)
  assert.throws(() => acceptSend(room, { ...request, tools: true }, 13), /ID/)
  assert.equal(room.messages.length, 1)
})

test('current-only stop preserves queued messages and stale stop has no effect', () => {
  const room = { messages: [queued('next')] }
  assert.equal(selectStop(room, { mode: 'current', activeId: 'old' }, 'new'), false)
  assert.equal(selectStop(room, { mode: 'current', activeId: 'new' }, 'new'), true)
  assert.equal(room.messages[0].status, 'queued')
  assert.equal(selectStop(room, { mode: 'all', activeId: 'old' }, 'new'), false)
  assert.equal(room.messages[0].status, 'queued')
  assert.equal(selectStop(room, { mode: 'all' }, 'new'), true)
  assert.equal(room.messages[0].status, 'stopped')
})

test('native tools require one explicit recipient and do not propagate across rounds', async () => {
  const { toolEnabledFor } = await import('../src/room-state.js')
  const room = { members, messages: [] }
  for (const text of ['hello', '@all hello', '@lead @test hello']) {
    assert.throws(() => acceptSend(room, { ...request, text, tools: true }, 12), /팀원 한 명/)
  }
  acceptSend(room, { ...request, tools: true }, 12)
  const message = room.messages[0]
  assert.equal(toolEnabledFor(message, { id: 'test', round: 1 }), true)
  assert.equal(toolEnabledFor(message, { id: 'test', round: 2 }), false)
  assert.equal(toolEnabledFor(message, { id: 'lead', round: 1 }), false)
  assert.equal(toolEnabledFor({ ...message, recipients: ['lead', 'test'] }, { id: 'test', round: 1 }), false)
})

test('a valid direct reply is explicit, while a removed member cannot inherit a reply', () => {
  const reply = { id: 'reply', kind: 'bot', memberId: 'test' }
  const room = { members, messages: [reply] }
  acceptSend(room, { ...request, text: '네', replyTo: reply.id, tools: true }, 12)
  assert.deepEqual(room.messages.at(-1).recipients, ['test'])
  assert.throws(() => acceptSend({ members, messages: [{ ...reply, memberId: 'gone' }] },
    { ...request, text: '네', replyTo: reply.id, tools: false }, 12), /참가자/)
})

test('a question holds old and new requests until its actual recipient is answered', async () => {
  const { nextQueued, resumeQuestion } = await import('../src/room-state.js')
  const question = { id: 'ask', kind: 'bot', memberId: 'test', status: 'complete', asksUser: true }
  const room = { members, messages: [queued('old'), question], awaiting: { messageId: 'ask', memberId: 'test' } }
  acceptSend(room, { ...request, id: 'unrelated', text: 'unrelated' }, 12)
  assert.equal(nextQueued(room), undefined)
  assert.throws(() => acceptSend(room, { ...request, text: '@lead answer', replyTo: 'ask' }, 13), /질문한/)
  assert.equal(resumeQuestion(room, 'stale'), false)
  acceptSend(room, { ...request, text: 'answer', replyTo: 'ask' }, 13)
  assert.equal(room.awaiting, undefined)
  assert.equal(nextQueued(room).id, request.id)
  room.messages.at(-1).status = 'complete'
  assert.equal(nextQueued(room).id, 'old')
  room.awaiting = { messageId: 'ask', memberId: 'test' }
  assert.equal(resumeQuestion(room, 'ask'), true)
  assert.equal(nextQueued(room).id, 'old')
})

test('summary explicitly clears a previously published question in an incremental merge', async () => {
  const { roomSummary } = await import('../src/room-state.js')
  const room = { teamId: 'a', messages: [], awaiting: { messageId: 'old', memberId: 'lead' } }
  const previous = roomSummary(room)
  delete room.awaiting
  assert.equal({ ...previous, ...roomSummary(room) }.awaiting, null)
})
