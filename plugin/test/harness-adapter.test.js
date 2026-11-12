import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { HARNESS_INTERFACE_VERSION, turnPolicy, validateHarness } from '../src/harness-adapter.js'
import { initialDraft, initialNode } from '../src/workflow-model.js'
import { createWorkspaceFiles, workspaceRelative } from '../src/workflow-files.js'
import { Workflows } from '../src/workflow.js'

const team = 'example-team'
const agent = { id: 'existing-session', name: 'lead', role: 'lead' }
const task = { ...initialNode('check'), agent: agent.id }
const draft = { ...initialDraft(), nodes: [task] }
const noOp = () => undefined

function fixture() {
  const records = new Map()
  const table = { get: key => records.get(key), entries: () => records.entries(), put: async (key, value) => { records.set(key, value) } }
  const calls = []
  const adapter = {
    id: 'test-harness',
    version: HARNESS_INTERFACE_VERSION,
    capabilities: { isolatedTurns: true, scopedCancellation: true, tools: 'none' },
    team: async () => ({ id: team, leadId: agent.id, workspace: null, members: [agent] }),
    busy: () => false,
    startTurn(teamId, request) {
      calls.push({ teamId, request })
      return { result: Promise.resolve({ status: 'complete', text: '{"status":"complete","summary":"ok","artifacts":[]}' }),
        activity: () => null, drained: async () => undefined }
    },
  }
  const room = {
    stopping: () => false, publish: noOp, logger: { warn: noOp, error: noOp },
    members: () => [agent], requestText: () => 'request', annotate: async () => undefined, stopConversation: async () => undefined,
  }
  return { adapter, table, records, calls, room, engine: new Workflows(adapter, table, room) }
}

async function settled(engine, id) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const item = engine.record(team).runs.find(run => run.id === id)
    if (item?.steps.check.status === 'complete') return item
    await delay(10)
  }
  assert.fail('워크플로우가 완료되지 않았습니다.')
}

test('scheduler executes an existing session through an adapter without a native board', async () => {
  const { engine, calls } = fixture()
  await engine.request(team, { action: 'draft', revision: 0, draft })
  const { version } = await engine.request(team, { action: 'publish', revision: 1 })
  await engine.request(team, { action: 'start', id: 'portable-run', version, input: '', device: '', tools: false })
  const run = await settled(engine, 'portable-run')
  assert.equal(run.harness.id, 'test-harness')
  assert.equal(run.steps.check.native, undefined)
  assert.equal(run.steps.check.summary, 'ok')
  assert.equal(calls[0].request.agentId, agent.id)
  assert.equal(calls[0].request.policy, 'text-only')
  await engine.close()
})

test('a different harness cannot replay a persisted run and unsupported tool authority is denied', async () => {
  const { adapter, table, records, calls, room, engine } = fixture()
  assert.throws(() => validateHarness({ ...adapter, capabilities: { ...adapter.capabilities, scopedCancellation: false } }), /취소/)
  assert.throws(() => turnPolicy(adapter, true), /도구 승인/)
  await engine.request(team, { action: 'draft', revision: 0, draft: { ...draft, nodes: [{ ...task, tools: true }] } })
  await assert.rejects(engine.request(team, { action: 'publish', revision: 1 }), /도구 승인/)
  const other = new Workflows({ ...adapter, id: 'other-harness' }, table, room)
  records.get(team).runs.push(other.makeRun({ id: 'foreign', version: 1, input: '', device: '', tools: false }, draft, null, null, 'manual'))
  await engine.drain(team)
  assert.equal(engine.record(team).runs[0].setup, 'error')
  assert.equal(calls.length, 0)
})

test('startup holds an approved unstarted run until explicit resume', async () => {
  const { engine, records, calls } = fixture()
  await engine.write(team, state => {
    state.runs.push(engine.makeRun({ id: 'queued', version: 1, input: '', device: '', tools: false }, draft, null, null, 'manual'))
  })
  await engine.initialize()
  await engine.drain(team)
  const step = records.get(team).runs[0].steps.check
  assert.equal(step.status, 'suspended')
  assert.equal(calls.length, 0)
  await engine.request(team, { action: 'recoverTask', id: 'queued', nodeId: 'check', token: step.token, decision: 'restart', tools: false })
  await settled(engine, 'queued')
  assert.equal(calls.length, 1)
  await engine.close()
})

test('portable paths reject drive-relative, device, UNC, ADS and traversal forms', () => {
  assert.equal(workspaceRelative('incoming\\file.bin'), 'incoming/file.bin')
  assert.equal(workspaceRelative('.'), '.')
  for (const path of ['C:log.txt', 'C:\\log.txt', '\\\\server\\share\\log', 'log.txt:stream',
    'out/CON.txt', 'out/NUL', 'out/folder. /file', 'out/../file', '/etc/hosts', '~/log']) {
    assert.throws(() => workspaceRelative(path), /상대 경로/, path)
  }
})

test('file hashing uses only the harness provider and rejects links or changed snapshots', async () => {
  let version = 'v1'
  let replace = false
  let link = false
  let reads = 0
  const fs = {
    resolve: async path => ({ targetKey: path }),
    contains: () => true,
    lstat: async () => ({ type: link ? 'symlink' : 'file' }),
    stat: async () => ({ type: 'file', size: 3, version }),
    readByteRange: async (_target, { length }) => {
      reads++
      if (replace) version = 'v2'
      assert.equal(length, 3)
      return Buffer.from('abc')
    },
  }
  const files = createWorkspaceFiles(() => fs, new AbortController().signal)
  assert.equal((await files.hash('/workspace', 'a.txt')).sha256, createHash('sha256').update('abc').digest('hex'))
  replace = true
  await assert.rejects(files.hash('/workspace', 'a.txt'), /읽는 동안 바뀌/)
  link = true
  await assert.rejects(files.hash('/workspace', 'a.txt'), /심볼릭 링크/)
  assert.equal(reads, 2)
})
