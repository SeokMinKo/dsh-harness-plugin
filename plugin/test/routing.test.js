import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHandoff, routeUser, extendPlan, roomPrompt } from '../src/routing.js'

const members = [{ id: 'a', name: 'lead' }, { id: 'b', name: 'test' }, { id: 'c', name: 'report' }]

test('routes named, broadcast, default and reply messages in order', () => {
  assert.deepEqual(routeUser('안녕 @Report @test @report', members), ['c', 'b'])
  assert.deepEqual(routeUser('@everyone 의견 줘', members), ['a', 'b', 'c'])
  assert.deepEqual(routeUser('이 결과 다시 봐줘', members, 'b'), ['b'])
  assert.deepEqual(routeUser('안녕', members), ['a'])
  assert.throws(() => routeUser('@missing 안녕', members), /missing/)
  assert.deepEqual(routeUser('a@b.com과 `@unknown` 검토', members), ['a'])
})

test('only a standalone final handoff directive outside code can trigger other members', () => {
  assert.deepEqual(parseHandoff('확인했어요.\n[[team-chat: @report @test]]'), { text: '확인했어요.', names: ['report', 'test'] })
  assert.deepEqual(parseHandoff('질문이 있어요.\n[[team-chat: @user]]'), { text: '질문이 있어요.', names: ['user'] })
  const code = '사용법\n```\n[[team-chat: @report]]'
  assert.deepEqual(parseHandoff(code), { text: code, names: [] })
  const natural = '@report 안녕'
  assert.deepEqual(parseHandoff(natural), { text: natural, names: [] })
})

test('a run deduplicates pending recipients, rejects self and broadcast, and enforces both limits', () => {
  const plan = [{ id: 'a', round: 1, messageId: 'm' }, { id: 'b', round: 1 }]
  extendPlan(plan, 0, ['lead', 'test', 'all', 'report'], members, 3)
  assert.deepEqual(plan, [{ id: 'a', round: 1, messageId: 'm' }, { id: 'b', round: 1, handoffIds: ['m'] }, { id: 'c', round: 2, replyTo: 'm' }])
  extendPlan(plan, 2, ['lead'], members, 2)
  assert.equal(plan.length, 3)
  plan[2].messageId = 'ask'
  assert.equal(extendPlan(plan, 2, ['user', 'lead'], members, 3).ask, true)
  assert.deepEqual(plan.at(-1), { id: 'a', round: 3, replyTo: 'ask' })
  const full = [{ id: 'a', round: 1 }, ...Array(11).fill({ id: 'b', round: 1 })]
  extendPlan(full, 0, ['report'], members, 3)
  assert.equal(full.length, 12)
})

test('room context includes prior human/bot names and attributes a handoff to its sender', () => {
  const prompt = roomPrompt({ name: 'report' }, members, [
    { author: '나', text: '결과 정리' }, { author: 'test', text: '성공 7건' },
  ], { author: 'test', text: '성공 7건' }, { round: 2, rounds: 3, tools: false })
  assert.match(prompt, /test/)
  assert.match(prompt, /성공 7건/)
  assert.match(prompt, /@user/)
  assert.match(prompt, /Original sender: test/)
})

test('nested shorter fences and indented code cannot trigger a bot or handoff', () => {
  const wrapped = ['````md', '```', '@missing', '[[team-chat: @report]]', '```', '````'].join('\n')
  assert.deepEqual(routeUser(wrapped, members), ['a'])
  assert.deepEqual(routeUser('    @missing\n@report', members), ['c'])
  const body = ['````md', '```', '[[team-chat: @report]]'].join('\n')
  assert.deepEqual(parseHandoff(body), { text: body, names: [] })
})

test('room prompt bounds escaped UTF-8 transcript and sends the trigger text only once', () => {
  const trigger = { id: 'trigger', author: '나', text: 'UNIQUE_TRIGGER_TEXT' }
  const old = Array.from({ length: 30 }, (_, i) => ({ id: String(i), author: 'test', text: '한글\\\n"'.repeat(3000) }))
  const prompt = roomPrompt({ name: 'report' }, members, [...old, trigger], trigger, { round: 1, rounds: 3, tools: false })
  const transcript = prompt.split('\n').find(line => line.startsWith('Recent room transcript (JSON): ')).split(': ').slice(1).join(': ')
  assert.ok(Buffer.byteLength(transcript) <= 12_000)
  assert.ok(JSON.parse(transcript).length > 0)
  assert.equal(prompt.match(/UNIQUE_TRIGGER_TEXT/g).length, 1)
})
