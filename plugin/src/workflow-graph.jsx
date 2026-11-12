import React, { useId, useRef, useState } from 'react'
import { edgeLabels, lanes } from './workflow-draft.js'
import { orderNodes } from './workflow-model.js'

const nodeWidth = 132
const columnGap = 26
const rowGap = 54
const inset = 14

function flowLayout(draft, nodeHeight) {
  let rows
  try { rows = lanes(draft) }
  catch { rows = draft.nodes.map(node => [node]) }
  const width = Math.max(244, ...rows.map(row => row.length * (nodeWidth + columnGap) - columnGap + 2 * inset))
  const points = new Map(rows.flatMap((row, rank) => row.map((node, index) => [node.id, {
    x: width / 2 + (index - (row.length - 1) / 2) * (nodeWidth + columnGap),
    y: inset + rank * (nodeHeight + rowGap), rank,
  }])))
  let bypasses = 0
  const labels = []
  const edges = draft.nodes.flatMap(node => node.after.flatMap(edge => {
    const from = points.get(edge.from)
    const to = points.get(node.id)
    if (!from) return []
    const start = from.y + nodeHeight
    const end = to.y
    const middle = (start + end) / 2
    const bypass = to.rank !== from.rank + 1
    const track = bypass ? width - 4 + 12 * ++bypasses : 0
    const path = bypass
      ? `M ${from.x},${start} V ${start + 12} H ${track} V ${end - 12} H ${to.x} V ${end}`
      : `M ${from.x},${start} C ${from.x},${middle} ${to.x},${middle} ${to.x},${end}`
    const x = bypass ? track : (from.x + to.x) / 2
    const y = [middle, middle - 17, middle + 17].find(candidate => !labels.some(label =>
      Math.abs(label.y - candidate) < 16 && Math.abs(label.x - x) < 55)) ?? middle
    labels.push({ x, y })
    return [{ ...edge, to: node.id, path, x, y }]
  }))
  return { points, edges, width: width + (bypasses ? bypasses * 12 + 32 : 0), height: rows.length * (nodeHeight + rowGap) - rowGap + 2 * inset }
}

export function WorkflowGraph({ draft, members, onChange, onSelect, selected, run, previous, states }) {
  const marker = 'tc-wf-arrow-' + useId()
  const trigger = useRef(null)
  const [active, setActive] = useState(null)
  const [source, setSource] = useState(null)
  const nodes = new Map(draft.nodes.map(node => [node.id, node]))
  const groups = new Map(draft.groups.map(group => [group.id, group.title]))
  const agents = new Map(members.map(member => [member.id, member.name]))
  const nodeHeight = run ? 102 : 76
  const { points, edges, width, height } = flowLayout(draft, nodeHeight)
  const edge = onChange && active?.from && active.to === selected
    ? edges.find(edge => edge.from === active.from && edge.to === active.to) : null
  const node = onChange && active?.node === selected && nodes.get(selected)
  const linking = onChange && nodes.has(source)

  function closeEditor() {
    setActive(null)
    setSource(null)
    trigger.current?.focus()
  }
  function linkedNodes(target) {
    return draft.nodes.map(node => node.id === target ? { ...node, after: [...node.after, { from: source, when: 'success' }] } : node)
  }
  function canConnect(target) {
    try { orderNodes({ nodes: linkedNodes(target) }); return true }
    catch { return false }
  }
  function chooseNode(event, id) {
    trigger.current = event.currentTarget
    onSelect(id)
    if (linking) {
      onChange(id, { after: linkedNodes(id).find(node => node.id === id).after })
      setActive({ from: source, to: id })
      setSource(null)
    } else if (onChange) setActive(active?.node === id ? null : { node: id })
  }
  function chooseEdge(event, connection) {
    if (!onChange || linking) return
    trigger.current = event.currentTarget.closest('button')
    onSelect(connection.to)
    setActive({ from: connection.from, to: connection.to })
  }
  function updateEdge(when) {
    const after = nodes.get(edge.to).after
    onChange(edge.to, when
      ? { after: after.map(item => item.from === edge.from ? { ...item, when } : item) }
      : { after: after.filter(item => item.from !== edge.from) })
    if (!when) closeEditor()
  }
  if (!draft.nodes.length) return null
  return <section className="tc-wf-flow" aria-label="작업 관계도" onKeyDown={event => {
    if (event.key === 'Escape' && (active || linking)) closeEditor()
  }}>
    {linking && <div className="tc-wf-link-mode"><span role="status">{nodes.get(source).title} 다음에 실행할 작업을 선택하세요.</span>
      <button type="button" onClick={closeEditor}>연결 취소</button></div>}
    <div className="tc-wf-flow-scroll"><div className="tc-wf-flow-canvas" style={{ width, height }}>
      <svg aria-hidden="true" width={width} height={height} className="tc-wf-flow-lines">
        <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0,0 L 8,4 L 0,8 Z" fill="context-stroke" />
        </marker></defs>
        {edges.map(connection => <g key={connection.from + '/' + connection.to} data-when={connection.when} data-selected={edge === connection}>
          <path d={connection.path} markerEnd={`url(#${marker})`} />
          {onChange && <path className="tc-wf-flow-hit" d={connection.path} onClick={event => chooseEdge(event, connection)} />}
        </g>)}
      </svg>
      {draft.nodes.map(item => {
        const point = points.get(item.id)
        const step = run?.steps[item.id]
        const label = step?.attention?.kind === 'approval' ? 'DSH 승인 대기' : step?.attention?.kind === 'question'
          ? 'DSH 질문 대기' : states[step?.status]
        const changed = previous && JSON.stringify(previous.nodes.find(node => node.id === item.id)) !== JSON.stringify(item)
        return <article className="tc-wf-node" data-changed={changed} data-selected={selected === item.id} key={item.id}
          style={{ left: point.x - nodeWidth / 2, top: point.y, width: nodeWidth, height: nodeHeight }}>
          <button type="button" className="tc-wf-node-title" aria-label={item.title || '이름 없는 작업'}
            aria-pressed={selected === item.id} disabled={linking && !canConnect(item.id)} onClick={event => chooseNode(event, item.id)}>
            {item.group && <small className="tc-wf-node-group" title={groups.get(item.group)}>{groups.get(item.group)}</small>}
            <strong title={item.title}>{item.title || '이름 없는 작업'}</strong>
            <small>{item.agent ? '@' + (agents.get(item.agent) ?? '팀에서 사라진 Agent') : '미배정'}</small>
            {label && <span className="tc-wf-status" data-state={step.status}>{label}</span>}
            {step?.waiting && <small title={step.waiting}>{step.waiting}</small>}
          </button>
        </article>
      })}
      {edges.map(connection => {
        const label = edgeLabels[connection.when]
        const name = `${nodes.get(connection.from).title} → ${nodes.get(connection.to).title} · ${label}`
        const style = { left: connection.x, top: connection.y }
        const key = connection.from + '/' + connection.to
        return onChange ? <button type="button" key={key} className="tc-wf-flow-edge" style={style}
          data-when={connection.when} title={name} aria-label={name} aria-pressed={edge === connection} disabled={linking}
          onClick={event => chooseEdge(event, connection)}>{label}</button>
          : <span key={key} className="tc-wf-flow-edge" style={style} data-when={connection.when} title={name}>{label}</span>
      })}
    </div></div>
    {(edge || node) && <div className="tc-wf-flow-editor" role="group" aria-label={edge ? '연결 편집' : '작업 편집'}>
      <header><strong>{edge ? `${nodes.get(edge.from).title} → ${nodes.get(edge.to).title}` : node.title}</strong>
        <button type="button" aria-label="편집 닫기" onClick={closeEditor}>×</button></header>
      {edge ? <><select autoFocus aria-label="연결 실행 조건" value={edge.when} onChange={event => updateEdge(event.target.value)}>
        {Object.entries(edgeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select><button type="button" className="tc-wf-danger" onClick={() => updateEdge(null)}>연결 삭제</button></>
        : <><select autoFocus aria-label={node.title + ' 담당 Agent'} value={node.agent ?? ''} onChange={event => onChange(node.id, { agent: event.target.value || null })}>
          <option value="">미배정</option>
          {node.agent && !agents.has(node.agent) && <option value={node.agent}>팀에서 사라진 Agent</option>}
          {members.map(member => <option value={member.id} key={member.id}>@{member.name}</option>)}
        </select><button type="button" onClick={() => { setSource(node.id); setActive(null) }}>연결 추가</button></>}
    </div>}
  </section>
}
