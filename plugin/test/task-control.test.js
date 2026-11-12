import test from 'node:test'
import assert from 'node:assert/strict'
import { requestsAllocation, checkpointKey, assertCheckpoint, canStopTask } from '../src/task-control.js'

test('allocation recognition applies to delegation requests while ordinary messages stay direct', () => {
  assert.equal(requestsAllocation('@lead 이 로그를 팀원들이 나눠 분석해줘'), true)
  assert.equal(requestsAllocation('@lead 이 로그 내용을 설명해줘'), false)
  assert.equal(requestsAllocation('@lead 배분 알고리즘을 설명해줘'), false)
  assert.equal(requestsAllocation('@lead 이 예시를 읽어줘\n> 일을 나눠 처리해줘'), false)
  assert.equal(requestsAllocation('@test 로그를 팀원들이 나눠 분석해줘'), false)
  assert.equal(requestsAllocation('@lead 팀원에게 배분해줘', 'reply'), false)
  assert.equal(requestsAllocation('이 문제를 리드가 분담해줘'), true)
})

test('resume accepts only matching checkpoint provenance and leaves invalid recovery explicit', () => {
  const node = { id: 'a', agent: 'tester', instruction: 'verify', completion: 'ok', after: [{ from: 'prior', when: 'success' }] }
  const run = { device: '', request: 'inspect', steps: { prior: { status: 'complete', attempt: 1, artifacts: [{ path: 'x', sha256: 'a' }] } } }
  const input = { path: 'sample.log', sha256: 'b', text: '' }
  const signature = checkpointKey(run, node, input)
  assert.doesNotThrow(() => assertCheckpoint({ signature }, signature))
  assert.throws(() => assertCheckpoint(undefined, signature), /체크포인트/)
  assert.throws(() => assertCheckpoint({ signature }, checkpointKey(run, node, { ...input, text: 'new input' })), /재사용/)
  assert.throws(() => assertCheckpoint({ signature }, checkpointKey(run, { ...node, agent: 'other' }, input)), /재사용/)
  assert.equal(canStopTask('running'), true)
  assert.equal(canStopTask('question'), true)
  assert.equal(canStopTask('complete'), false)
})
