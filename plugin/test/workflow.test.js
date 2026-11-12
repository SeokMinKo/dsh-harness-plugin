import test from 'node:test'
import assert from 'node:assert/strict'
import { checkDraft, eligibility, initialDraft, initialNode, jsonAnswer, orderNodes } from '../src/workflow-model.js'

const task = (id, after = []) => ({ ...initialNode(id, id), agent: 'native', after })
const edge = (from, when = 'success') => ({ from, when })
const graph = nodes => ({ ...initialDraft(), nodes })

test('validates dependencies independently of groups and the visual order', () => {
  const draft = graph([task('report', [edge('test')]), task('test')])
  assert.deepEqual(orderNodes(checkDraft(draft, [{ id: 'native' }], true)).map(node => node.id), ['test', 'report'])
  assert.throws(() => checkDraft(graph([task('a', [edge('b')]), task('b', [edge('a')])]), []), /순환/)
  assert.throws(() => checkDraft(graph([task('a')]), []), /현재 팀/)
})

test('a question blocks only its descendants and a conditional join honors failure', () => {
  const steps = { a: { status: 'question' }, b: { status: 'failed' } }
  assert.equal(eligibility(task('independent'), steps), 'ready')
  assert.equal(eligibility(task('child', [edge('a')]), steps), 'wait')
  assert.equal(eligibility(task('child', [edge('b')]), steps), 'skip')
  assert.equal(eligibility(task('child', [edge('b', 'settled')]), steps), 'ready')
  assert.equal(eligibility(task('child', [edge('b', 'failure')]), steps), 'ready')
  assert.throws(() => jsonAnswer('free text'), /JSON/)
})

test('two-window merge preserves independent edits and exposes shared-field conflicts', async () => {
  const { mergeEdits } = await import('../src/workflow-draft.js')
  const base = graph([task('a'), task('b')])
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.title = '첫 창'
  remote.title = '두 번째 창'
  local.nodes[0].instruction = 'first instruction'
  remote.nodes[1].completion = 'second completion'
  assert.deepEqual(mergeEdits(base, local, remote).conflicts.map(item => item.key), ['title'])
  const merged = mergeEdits(base, local, remote, { title: 'local' })
  assert.equal(merged.draft.title, '첫 창')
  assert.equal(merged.draft.nodes[0].instruction, 'first instruction')
  assert.equal(merged.draft.nodes[1].completion, 'second completion')
})
