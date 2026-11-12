import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlan, settleStep, resultStatus } from '../src/plan.js'
import { acceptSend, nextQueued, recoverInterrupted, resumeQuestion, selectStop } from '../src/room-state.js'
import { roomPrompt } from '../src/routing.js'

const members = [
  { id: 'lead', name: 'lead', role: 'lead' }, { id: 'test', name: 'test', role: 'teammate' },
  { id: 'report', name: 'report', role: 'teammate' },
]
function startingRoom() {
  const root = { id: 'root', kind: 'user', author: '나', text: '@lead @test 시작', status: 'running',
    tools: false, recipients: ['lead', 'test'] }
  return { members, rounds: 3, messages: [root] }
}
function bot(room, id, memberId) {
  const message = { id, kind: 'bot', memberId, author: memberId, text: '확인해 주세요', status: 'complete' }
  room.messages.push(message)
  return message
}

test('a question checkpoints remaining recipients and a direct answer has priority after restart', () => {
  const room = startingRoom()
  const plan = createPlan(room.messages[0])
  const question = bot(room, 'q', 'lead')
  assert.equal(settleStep(room, plan, question, ['user', 'test', 'report']), true)
  assert.deepEqual(room.continuation.steps.slice(1).map(step => step.id), ['test', 'report'])
  assert.deepEqual(room.continuation.steps[1].handoffIds, ['q'])
  assert.equal(room.messages[0].status, 'waiting')
  const restored = structuredClone(room)
  recoverInterrupted(restored)
  assert.equal(nextQueued(restored), undefined)
  assert.equal(restored.awaiting.messageId, 'q')
  acceptSend(restored, { id: 'other', text: '다른 요청', tools: false }, 1)
  acceptSend(restored, { id: 'answer', text: '이 조건으로 진행', replyTo: 'q', tools: true }, 2)
  assert.equal(nextQueued(restored).id, 'root')
  assert.equal(restored.continuation.answerId, 'answer')
  const resumed = createPlan(nextQueued(restored), restored.continuation)
  const answer = bot(restored, 'answer-bot', 'lead')
  assert.equal(settleStep(restored, resumed, answer, ['test'], true), false)
  assert.deepEqual(resumed.steps[resumed.cursor].handoffIds, ['answer-bot'])
  assert.equal(restored.messages.find(item => item.id === 'answer').status, 'complete')
  const prompt = roomPrompt(members[1], members, [question, answer], restored.messages[0],
    { round: 1, rounds: 3, tools: false, handoffs: [answer] })
  assert.match(prompt, /Peer handoff from @lead/)
})

test('failed answer keeps the question, and explicit resume or cancellation retains the correct scope', () => {
  const room = startingRoom()
  settleStep(room, createPlan(room.messages[0]), bot(room, 'q', 'lead'), ['user'])
  acceptSend(room, { id: 'answer', text: '진행', replyTo: 'q', tools: false }, 1)
  const plan = createPlan(nextQueued(room), room.continuation)
  const response = { ...bot(room, 'bad', 'lead'), status: 'failed' }
  assert.equal(settleStep(room, plan, response, [], true), true)
  assert.equal(room.awaiting.messageId, 'q')
  assert.equal(room.messages.find(message => message.id === 'answer').status, 'failed')
  assert.equal(nextQueued(room), undefined)
  assert.equal(resumeQuestion(room, 'q'), true)
  assert.equal(nextQueued(room).id, 'root')
  assert.equal(room.continuation.answerId, undefined)
  selectStop(room, { mode: 'all' })
  assert.equal(room.continuation, undefined)
  assert.equal(room.messages[0].status, 'stopped')
})

test('a nested question keeps the same plan and restart during execution never replays it', () => {
  const room = startingRoom()
  settleStep(room, createPlan(room.messages[0]), bot(room, 'q1', 'lead'), ['user'])
  acceptSend(room, { id: 'answer1', text: '조건', replyTo: 'q1', tools: false }, 1)
  let plan = createPlan(nextQueued(room), room.continuation)
  assert.equal(settleStep(room, plan, bot(room, 'q2', 'lead'), ['user'], true), true)
  assert.equal(room.awaiting.messageId, 'q2')
  assert.equal(room.continuation.cursor, 1)
  acceptSend(room, { id: 'answer2', text: '추가 조건', replyTo: 'q2', tools: false }, 1)
  room.messages[0].status = 'running'
  recoverInterrupted(room)
  assert.equal(room.continuation, undefined)
  assert.equal(room.messages[0].status, 'interrupted')
  assert.equal(nextQueued(room), undefined)
})

test('combined successful and failed recipients are reported as partial', () => {
  const room = startingRoom()
  const plan = createPlan(room.messages[0])
  settleStep(room, plan, bot(room, 'pass', 'lead'), [])
  assert.equal(resultStatus(plan), 'complete')
  settleStep(room, plan, { ...bot(room, 'fail', 'test'), status: 'failed' }, [])
  assert.equal(resultStatus(plan), 'partial')
  assert.equal(resultStatus({ passed: 0, failed: 2 }), 'failed')
})

test('multiple senders retain independent handoff context for a single pending recipient', () => {
  const room = startingRoom()
  room.messages[0].recipients = ['lead', 'test', 'report']
  const plan = createPlan(room.messages[0])
  const first = bot(room, 'first', 'lead')
  first.text = '먼저 확보한 입력'
  const second = bot(room, 'second', 'test')
  second.text = '검증 결과'
  settleStep(room, plan, first, ['report'])
  settleStep(room, plan, second, ['report'])
  assert.equal(plan.steps.length, 3)
  assert.deepEqual(plan.steps[2].handoffIds, ['first', 'second'])
  const failed = { id: 'failed', author: 'watch', kind: 'bot', status: 'failed', text: '임시 출력' }
  const prompt = roomPrompt(members[2], members, [first, second, failed], room.messages[0],
    { round: 1, rounds: 3, tools: false, handoffs: [first, second] })
  assert.match(prompt, /Peer handoff from @lead/)
  assert.match(prompt, /Peer handoff from @test/)
  assert.match(prompt, /"status":"failed"/)
  assert.equal(prompt.match(/먼저 확보한 입력/g).length, 1)
})

test('unfulfilled handoffs are visible and a successful reply cannot hide the failure', () => {
  const room = startingRoom()
  room.rounds = 1
  room.messages[0].recipients = ['lead']
  const plan = createPlan(room.messages[0])
  const response = bot(room, 'reply', 'lead')
  settleStep(room, plan, response, ['missing', 'all', 'lead', 'test'])
  assert.equal(resultStatus(plan), 'partial')
  assert.deepEqual(response.handoffWarnings, [
    { name: 'missing', reason: 'unknown' }, { name: 'all', reason: 'broadcast' },
    { name: 'lead', reason: 'self' }, { name: 'test', reason: 'round-limit' },
  ])
})
