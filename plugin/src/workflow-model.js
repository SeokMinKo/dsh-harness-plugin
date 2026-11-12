import { z } from 'zod'

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
const title = z.string().trim().min(1).max(100)
const note = z.string().trim().max(1200)
const path = z.string().trim().min(1).max(240)
const userText = z.string().trim().min(1).max(6000)
const revision = z.number().int().nonnegative()
const runKey = z.uuid()
const edge = z.strictObject({ from: key, when: z.enum(['success', 'failure', 'settled']) })
export const workflowDraft = z.strictObject({
  title,
  layout: z.enum(['sequence', 'hierarchy', 'parallel', 'mixed', 'blank']),
  groups: z.array(z.strictObject({ id: key, title, parent: key.nullable(), agent: z.string().min(1).max(128).nullable().optional() })).max(12),
  nodes: z.array(z.strictObject({
    id: key, title, agent: z.string().min(1).max(128).nullable(), group: key.nullable(),
    instruction: note, completion: note, needsDevice: z.boolean(), tools: z.boolean(),
    outputs: z.array(path).max(8), after: z.array(edge).max(15),
  })).max(16),
})
export const folderRule = z.strictObject({
  directory: path, suffix: z.string().trim().min(2).max(32).regex(/^\.[a-zA-Z0-9._-]+$/),
  device: z.string().trim().max(96), enabled: z.boolean(),
})
export const allocationProposal = z.strictObject({
  title, nodes: z.array(z.strictObject({
    id: key, title, agent: z.string().min(1).max(128), instruction: note, completion: note.optional(),
    after: z.array(key).max(15), tools: z.boolean().optional(), needsDevice: z.boolean().optional(),
    outputs: z.array(path).max(8).optional(),
  })).min(1).max(16),
})
export const stepOutput = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('complete'), summary: userText, artifacts: z.array(path).max(8) }),
  z.strictObject({ status: z.literal('question'), question: userText }),
  z.strictObject({ status: z.literal('failed'), summary: userText }),
  z.strictObject({ status: z.literal('checkpoint'), state: userText, files: z.array(path).max(8).optional() }),
  z.strictObject({ status: z.literal('handoff'), summary: userText, target: key, instruction: note }),
])
export const workflowRequest = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('view') }),
  z.strictObject({ action: z.literal('approveAllocation'), id: runKey, revision,
    assignments: z.array(z.strictObject({ nodeId: key, agent: z.string().min(1).max(128) })).min(1).max(16),
    input: z.string().trim().max(240), device: z.string().trim().max(96) }),
  z.strictObject({ action: z.literal('stopTask'), id: runKey, nodeId: key, token: revision }),
  z.strictObject({ action: z.literal('recoverTask'), id: runKey, nodeId: key, token: revision,
    decision: z.enum(['resume', 'restart', 'cancel']), file: z.string().trim().max(240).optional(),
    text: z.string().trim().max(6000).optional(), tools: z.boolean() }),
  z.strictObject({ action: z.literal('suggest'), revision, text: userText, nodeId: key.optional() }),
  z.strictObject({ action: z.literal('draft'), revision, draft: workflowDraft }),
  z.strictObject({ action: z.literal('publish'), revision }),
  z.strictObject({ action: z.literal('folder'), revision, folder: folderRule }),
  z.strictObject({ action: z.literal('start'), id: runKey, version: revision, input: z.string().trim().max(240),
    device: z.string().trim().max(96), tools: z.boolean() }),
  z.strictObject({ action: z.literal('answer'), id: runKey, nodeId: key, questionId: runKey, text: userText }),
  z.strictObject({ action: z.literal('retry'), id: runKey, nodeId: key, attempt: revision,
    decision: z.enum(['retry', 'failed']), tools: z.boolean() }),
  z.strictObject({ action: z.literal('authorize'), id: runKey, nodeId: key, attempt: revision }),
  z.strictObject({ action: z.literal('repair'), id: runKey, runRevision: revision }),
  z.strictObject({ action: z.literal('apply'), id: runKey, revision, runRevision: revision }),
])

export const initialDraft = () => ({ title: '워크플로우', layout: 'blank', groups: [], nodes: [] })
export const initialNode = (id, name = '새 작업') => ({
  id, title: name, agent: null, group: null, instruction: '', completion: '', needsDevice: false, tools: false, outputs: [], after: [],
})

function ordered(records, dependencies) {
  const entries = new Map(records.map(item => [item.id, item]))
  if (entries.size !== records.length) throw new Error('중복된 작업 또는 그룹 ID가 있습니다.')
  const visiting = new Set()
  const done = new Set()
  const order = []
  function visit(id) {
    if (visiting.has(id)) throw new Error('순환 연결 · ' + [...visiting, id].map(key => entries.get(key)?.title ?? key).join(' → '))
    if (done.has(id)) return
    const record = entries.get(id)
    if (!record) throw new Error('연결된 작업 또는 그룹이 없습니다. ' + id)
    visiting.add(id)
    const parents = dependencies(record)
    if (new Set(parents).size !== parents.length) throw new Error('같은 선행 작업이 두 번 연결됐습니다. ' + record.title)
    for (const parent of parents) visit(parent)
    visiting.delete(id)
    done.add(id)
    order.push(record)
  }
  for (const item of records) visit(item.id)
  return order
}

export function orderNodes(draft) {
  return ordered(draft.nodes, node => node.after.map(edge => edge.from))
}

export function checkDraft(draft, members, runnable = false) {
  workflowDraft.parse(draft)
  const groups = new Set(ordered(draft.groups, group => group.parent ? [group.parent] : []).map(group => group.id))
  const agents = new Set(members.map(item => item.id))
  if (draft.groups.some(group => group.agent && !agents.has(group.agent))) throw new Error('계층 그룹의 담당 Agent가 현재 팀에 없습니다.')
  if (runnable && !draft.nodes.length) throw new Error('작업을 하나 이상 추가하세요.')
  for (const node of orderNodes(draft)) {
    if (node.group && !groups.has(node.group)) throw new Error('작업의 그룹을 찾을 수 없습니다. ' + node.title)
    if (node.agent && !agents.has(node.agent)) throw new Error('현재 팀에 없는 Agent입니다. ' + node.title)
    if (runnable && !node.agent) throw new Error('담당 Agent를 선택하세요. ' + node.title)
  }
  return draft
}

const final = new Set(['complete', 'failed', 'skipped'])
export function eligibility(node, steps) {
  const linked = node.after.map(edge => ({ when: edge.when, status: steps[edge.from]?.status }))
  if (linked.some(edge => !final.has(edge.status))) return 'wait'
  return linked.every(edge => edge.when === 'settled' || (edge.when === 'success' && edge.status === 'complete') || (edge.when === 'failure' && edge.status === 'failed'))
    ? 'ready' : 'skip'
}

export function jsonAnswer(text) {
  const value = text.trim()
  const fenced = /^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i.exec(value)
  try { return JSON.parse(fenced?.[1] ?? value) }
  catch { throw new Error('Agent가 요청한 JSON 형식으로 응답하지 않았습니다.') }
}

export function changedDraft(before, after, members = []) {
  const previous = new Map(before.nodes.map(node => [node.id, node]))
  const current = new Map(after.nodes.map(node => [node.id, node]))
  const changes = []
  if (before.title !== after.title) changes.push('이름 · ' + after.title)
  if (before.layout !== after.layout) changes.push('보기 · ' + after.layout)
  if (JSON.stringify(before.groups) !== JSON.stringify(after.groups)) changes.push('계층 그룹 변경')
  const agent = id => members.find(item => item.id === id)?.name ?? (id ? id.slice(0, 8) : '미배정')
  const condition = { success: '성공 후', failure: '실패 시', settled: '종료 후' }
  const connections = node => node.after.map(edge => (current.get(edge.from)?.title ?? edge.from) + ' ' + condition[edge.when]).join(', ') || '없음'
  for (const node of after.nodes) {
    const old = previous.get(node.id)
    if (!old) {
      changes.push('추가 · ' + node.title + ' · ' + agent(node.agent) + (node.after.length ? ' · ' + connections(node) : '')
        + (node.tools ? ' · DSH 도구 필요' : '') + (node.needsDevice ? ' · 대상 장비 점유' : ''))
    } else if (JSON.stringify(old) !== JSON.stringify(node)) {
      const detail = []
      if (old.agent !== node.agent) detail.push('담당 ' + agent(old.agent) + ' → ' + agent(node.agent))
      if (JSON.stringify(old.after) !== JSON.stringify(node.after)) detail.push('선행 · ' + connections(node))
      if (old.tools !== node.tools) detail.push(node.tools ? 'DSH 도구 필요' : '텍스트 전용')
      if (old.needsDevice !== node.needsDevice) detail.push(node.needsDevice ? '대상 장비 점유' : '장비 점유 해제')
      changes.push('수정 · ' + node.title + (detail.length ? ' · ' + detail.join(' · ') : ''))
    }
  }
  for (const node of before.nodes) if (!current.has(node.id)) changes.push('삭제 · ' + node.title)
  return changes
}
