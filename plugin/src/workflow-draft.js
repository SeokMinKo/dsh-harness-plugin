import { initialDraft, initialNode, orderNodes } from './workflow-model.js'

export const layoutLabels = { blank: '빈 워크플로우', sequence: '시퀀스', hierarchy: '계층', parallel: '병렬', mixed: '혼합' }
export const edgeLabels = { success: '성공 후', failure: '실패 시', settled: '종료 후' }
const fieldLabels = {
  title: '이름', layout: '보기', agent: '담당 Agent', parent: '상위 그룹', group: '그룹',
  after: '선행 작업', outputs: '필수 결과 파일', instruction: '작업 지시', completion: '완료 조건',
  needsDevice: '장비 점유', tools: 'DSH 도구 필요',
}

export const newKey = prefix => prefix + '-' + crypto.randomUUID().slice(0, 12)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function draftFromLayout(layout) {
  const draft = { ...initialDraft(), layout }
  if (layout === 'blank') return draft
  const prepare = initialNode(newKey('step'), '준비')
  const work = initialNode(newKey('step'), '실행')
  const report = initialNode(newKey('step'), '보고')
  if (layout === 'hierarchy') {
    const top = { id: newKey('group'), title: '준비·실행', parent: null }
    const nested = { id: newKey('group'), title: '검증·보고', parent: top.id }
    draft.groups = [top, nested]
    prepare.group = work.group = top.id
    report.group = nested.id
  }
  if (layout !== 'parallel') work.after = [{ from: prepare.id, when: 'success' }]
  report.after = [{ from: work.id, when: 'success' }]
  draft.nodes = [prepare, work, report]
  if (layout === 'parallel') report.after.unshift({ from: prepare.id, when: 'success' })
  if (layout === 'mixed') {
    const verify = { ...initialNode(newKey('step'), '검증'), after: [{ from: prepare.id, when: 'success' }] }
    draft.nodes.splice(2, 0, verify)
    report.after.push({ from: verify.id, when: 'success' })
  }
  return draft
}

export function lanes(draft) {
  const depth = new Map()
  const layers = []
  for (const node of orderNodes(draft)) {
    const layer = Math.max(-1, ...node.after.map(edge => depth.get(edge.from))) + 1
    depth.set(node.id, layer)
    ;(layers[layer] ??= []).push(node)
  }
  return layers
}

export function mergeEdits(base, local, remote, choices = {}) {
  const conflicts = []
  function field(key, label, old, mine, latest) {
    if (same(mine, latest) || same(old, latest)) return mine
    if (same(old, mine)) return latest
    if (choices[key]) return choices[key] === 'local' ? mine : latest
    conflicts.push({ key, label, local: mine, remote: latest })
    return latest
  }
  function records(kind) {
    const indexed = [base, local, remote].map(draft => new Map(draft[kind].map(item => [item.id, item])))
    const identifiers = [...new Set([...indexed[1].keys(), ...indexed[2].keys(), ...indexed[0].keys()])]
    const entries = new Map()
    for (const id of identifiers) {
      const [old, mine, latest] = indexed.map(map => map.get(id))
      const title = mine?.title ?? latest?.title ?? old?.title
      const entry = !old || !mine || !latest
        ? field(kind + '/' + id, title, old, mine, latest)
        : Object.fromEntries(Object.keys(mine).map(key => [key, field(kind + '/' + id + '/' + key,
          title + ' · ' + (fieldLabels[key] ?? key), old[key], mine[key], latest[key])]))
      if (entry) entries.set(id, entry)
    }
    const common = identifiers.filter(id => indexed.every(map => map.has(id)) && entries.has(id))
    const orders = indexed.map(map => [...map.keys()].filter(id => common.includes(id)))
    const order = field(kind + '/order', kind === 'nodes' ? '작업 표시 순서' : '그룹 표시 순서', ...orders)
    let cursor = 0
    const ids = identifiers.filter(id => entries.has(id)).map(id => common.includes(id) ? order[cursor++] : id)
    return ids.map(id => entries.get(id))
  }
  const draft = {
    title: field('title', '워크플로우 이름', base.title, local.title, remote.title),
    layout: field('layout', '보기', base.layout, local.layout, remote.layout),
    groups: records('groups'), nodes: records('nodes'),
  }
  return { draft, conflicts }
}
