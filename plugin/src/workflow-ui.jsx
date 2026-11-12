import React, { useEffect, useRef, useState } from 'react'
import { TaskControls, taskStates } from './task-controls.jsx'
import { checkDraft, initialDraft, initialNode, orderNodes, changedDraft } from './workflow-model.js'
import { draftFromLayout, edgeLabels, lanes, layoutLabels, mergeEdits, newKey } from './workflow-draft.js'

const states = { ...taskStates, created: '생성', ready: '실행 준비', edited: '변경 적용' }

export function useWorkflow(rpc, teamId, enabled, revision) {
  const [server, setServer] = useState(null)
  const [local, setLocal] = useState(null)
  const [undo, setUndo] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [designs, setDesigns] = useState([])
  const generation = useRef(0)
  const current = server?.teamId === teamId ? server : null
  const editing = local?.teamId === teamId ? local : null
  const draft = editing?.draft ?? current?.draft ?? initialDraft()
  const call = input => rpc({ op: 'workflow', teamId, input })

  async function refresh() {
    const id = ++generation.current
    const value = await call({ action: 'view' })
    if (id === generation.current) setServer({ ...value, teamId })
    return value
  }

  useEffect(() => {
    if (!enabled) return
    void refresh().catch(cause => setError(cause.message))
    return () => { generation.current++ }
  }, [enabled, teamId, revision])

  useEffect(() => {
    setUndo([])
    setDesigns([])
    setError('')
    setLocal(null)
  }, [teamId])

  const conflict = editing && current && editing.base !== current.revision
  function edit(next, keepUndo = true) {
    if (!current) return
    if (keepUndo) setUndo(values => [...values.slice(-29), draft])
    setLocal({ teamId, base: editing?.base ?? current.revision, original: editing?.original ?? current.draft, draft: next })
  }
  function revert() {
    if (!undo.length) return
    edit(undo.at(-1), false)
    setUndo(values => values.slice(0, -1))
  }
  function rebase(next) {
    setLocal({ teamId, base: current.revision, original: current.draft, draft: next })
    setUndo([])
  }

  async function persist() {
    if (!current) throw new Error('워크플로우를 먼저 불러오세요.')
    if (!editing) return current.revision
    const result = await call({ action: 'draft', revision: editing.base, draft: editing.draft })
    setServer(previous => previous?.teamId === teamId && previous.revision <= result.revision
      ? { ...previous, revision: result.revision, draft: editing.draft } : previous)
    setLocal(previous => previous === editing ? null : previous)
    return result.revision
  }

  async function perform(operation) {
    if (busy) return
    setError('')
    setBusy(true)
    try { return await operation() }
    catch (cause) { setError(cause.message); return undefined }
    finally { setBusy(false) }
  }

  function command(input) {
    return perform(async () => {
      const result = await call(input)
      await refresh()
      return result
    })
  }

  function propose(text, nodeId) {
    return perform(async () => {
      const expected = await persist()
      const context = designs.slice(-4).map(turn => [turn.text, turn.result.question ?? turn.result.note ?? ''])
      const request = context.length ? JSON.stringify({ previous: context, request: text }).slice(-6000) : text
      const result = await call({ action: 'suggest', revision: expected, text: request, ...(nodeId ? { nodeId } : {}) })
      setDesigns(list => [...list.map(turn => ({ ...turn, superseded: true })), { text, result }])
      return result
    })
  }

  function apply(turn) {
    return perform(async () => {
      if (editing || turn.result.revision !== current.revision) throw new Error('초안이 바뀌었습니다. 설계 요청을 다시 보내세요.')
      const result = await call({ action: 'draft', revision: turn.result.revision, draft: turn.result.draft })
      setUndo(list => [...list.slice(-29), draft])
      setDesigns(list => list.map(item => item === turn ? { ...item, applied: true } : item))
      await refresh()
      return result
    })
  }

  return {
    server: current, draft, local: editing, conflict, busy, error, designs, edit, revert, rebase, canUndo: !!undo.length,
    command, propose, apply,
    preview: designs.findLast(turn => !turn.superseded && !turn.applied && turn.result.draft),
    dismiss: turn => setDesigns(list => list.map(item => item === turn ? { ...item, superseded: true } : item)),
    persist: () => perform(persist),
    publish: () => perform(async () => {
      const revision = await persist()
      const result = await call({ action: 'publish', revision })
      await refresh()
      return result
    }),
    folder: folder => perform(async () => {
      const revision = await persist()
      const result = await call({ action: 'folder', revision, folder })
      await refresh()
      return result
    }),
    reviseRun: run => perform(async () => {
      const revision = await persist()
      const result = await call({ action: 'apply', id: run.id, revision, runRevision: run.revision })
      await refresh()
      return result
    }),
  }
}

export function WorkflowChat({ workflow, selected, answer, onClose, onAnswer }) {
  const [text, setText] = useState('')
  const [showTurns, setShowTurns] = useState(true)
  const label = answer ? '작업 질문에 답변' : '채팅으로 워크플로우 설계'
  async function submit(event) {
    event.preventDefault()
    if (!text.trim()) return
    const result = answer
      ? await workflow.command({ action: 'answer', id: answer.run.id, nodeId: answer.node.id, questionId: answer.question.id, text })
      : await workflow.propose(text, selected?.id)
    if (result) {
      setText('')
      if (answer) onAnswer()
    }
  }
  return <section className="tc-wf-chat" aria-label={label}>
    <div className="tc-wf-row tc-wf-chat-head">
      <strong>{label}</strong>
      {selected && !answer && <small>선택 · {selected.title}</small>}
      <button type="button" onClick={onClose}>일반 채팅</button>
    </div>
    {answer ? <div className="tc-wf-notice"><strong>{answer.node.title}</strong><p>{answer.question.text}</p></div>
      : workflow.designs.length > 0 && <div className="tc-wf-proposals">
        <button type="button" aria-expanded={showTurns} onClick={() => setShowTurns(!showTurns)}>설계 대화 {workflow.designs.length}건</button>
        {showTurns && workflow.designs.slice(-4).map((turn, index) => <article className="tc-wf-proposal" key={index}>
          <p><strong>나</strong> {turn.text}</p>
          {turn.result.question ? <p><strong>설계 질문</strong> {turn.result.question}</p> : <>
            <strong>초안 변경 제안</strong>
            {turn.result.note && <p>{turn.result.note}</p>}
            {turn.result.changes?.length > 0 && <ul>{turn.result.changes.map((change, i) => <li key={i}>{change}</li>)}</ul>}
            {!turn.superseded && !turn.applied && <div className="tc-wf-row">
              <button type="button" className="tc-wf-primary" disabled={workflow.busy} onClick={() => workflow.apply(turn)}>초안에 반영</button>
              <button type="button" onClick={() => setText('이 제안에서 ')}>제안 수정 요청</button>
              <button type="button" onClick={() => workflow.dismiss(turn)}>제안 취소</button>
            </div>}
            {turn.applied && <small>초안에 반영됨</small>}
          </>}
        </article>)}
      </div>}
    <form className="tc-wf-row" onSubmit={submit}>
      <textarea autoFocus aria-label={label} placeholder={answer ? '이 작업의 질문에 답하세요' : '@watch가 확인하면 @test와 @report를 동시에 실행해'}
        value={text} maxLength={6000} rows={2} onChange={event => setText(event.target.value)} />
      <button className="tc-wf-primary" type="submit" disabled={workflow.busy || !text.trim()}>
        {workflow.busy ? '처리 중' : answer ? '답변 보내기' : '설계 제안 받기'}
      </button>
    </form>
    {workflow.error && <p className="tc-error" role="alert">{workflow.error}</p>}
  </section>
}

function AgentSelect({ node, members, onChange }) {
  return <select aria-label={node.title + ' 담당 Agent'} value={node.agent ?? ''} onChange={event => onChange(event.target.value || null)}>
    <option value="">미배정</option>
    {node.agent && !members.some(member => member.id === node.agent) && <option value={node.agent}>팀에서 사라진 Agent</option>}
    {members.map(member => <option value={member.id} key={member.id}>@{member.name}</option>)}
  </select>
}

function Graph({ draft, members, layout, onChange, onSelect, selected, run, previous }) {
  const [folded, setFolded] = useState([])
  const nodeById = new Map(draft.nodes.map(node => [node.id, node]))
  const agents = new Map(members.map(member => [member.id, member.name]))
  function card(node) {
    const step = run?.steps[node.id]
    const label = step?.attention?.kind === 'approval' ? 'DSH 승인 대기' : step?.attention?.kind === 'question'
      ? 'DSH 질문 대기' : states[step?.status]
    const changed = previous && JSON.stringify(previous.nodes.find(item => item.id === node.id)) !== JSON.stringify(node)
    return <article className="tc-wf-node" data-selected={selected === node.id} data-changed={changed} key={node.id}>
      <button type="button" aria-pressed={selected === node.id} className="tc-wf-node-title" onClick={() => onSelect(node.id)}>{node.title}</button>
      {onChange ? <AgentSelect node={node} members={members} onChange={agent => onChange(node.id, { agent })} />
        : <small>@{agents.get(node.agent) ?? '미배정'}</small>}
      {label && <span className="tc-wf-status" data-state={step.status}>{label}</span>}
      {step?.waiting && <small className="tc-wf-muted">{step.waiting}</small>}
      {node.after.length > 0 && <div className="tc-wf-edges" aria-label="선행 작업">
        {node.after.map(edge => <button type="button" key={edge.from} onClick={() => onSelect(edge.from)}>
          ↖ {nodeById.get(edge.from)?.title ?? edge.from} · {edgeLabels[edge.when]}
        </button>)}
      </div>}
    </article>
  }
  function group(parent) {
    return draft.groups.filter(item => item.parent === parent).map(item => <section className="tc-wf-group" key={item.id}>
      <button aria-expanded={!folded.includes(item.id)} onClick={() => setFolded(folded.includes(item.id)
        ? folded.filter(id => id !== item.id) : [...folded, item.id])} type="button">{item.title}</button>{item.agent && <small> · @{agents.get(item.agent) ?? '미배정'}</small>}
      {!folded.includes(item.id) && <div>{draft.nodes.filter(node => node.group === item.id).map(card)}{group(item.id)}</div>}
    </section>)
  }
  if (layout === 'hierarchy') return <div className="tc-wf-graph">{group(null)}{draft.nodes.filter(node => !node.group).map(card)}</div>
  let graph
  try { graph = layout === 'parallel' || layout === 'mixed' ? lanes(draft) : orderNodes(draft).map(node => [node]) }
  catch { graph = draft.nodes.map(node => [node]) }
  return <div className="tc-wf-graph">{graph.map((nodes, index) => <section className="tc-wf-lane" key={index}>
    <div className="tc-wf-lane-head">단계 {index + 1}{nodes.length > 1 && <span>병렬 {nodes.length}개</span>}</div>
    <div className={nodes.length > 1 ? 'tc-wf-lane-branches' : ''}>{nodes.map(card)}</div>
  </section>)}</div>
}

function NodeEditor({ draft, node, patch, onRemove }) {
  const [dependency, setDependency] = useState('')
  const options = draft.nodes.filter(item => item.id !== node.id && !node.after.some(edge => edge.from === item.id))
  return <fieldset className="tc-wf-fieldset">
    <legend>작업 세부 설정</legend>
    <label>작업 이름<input value={node.title} maxLength={100} onChange={event => patch({ title: event.target.value })} /></label>
    <label>소속 그룹<select aria-label="소속 그룹" value={node.group ?? ''} onChange={event => patch({ group: event.target.value || null })}>
      <option value="">그룹 없음</option>{draft.groups.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>
    <label>작업 지시<textarea value={node.instruction} maxLength={1200} onChange={event => patch({ instruction: event.target.value })} /></label>
    <label>완료 조건<input value={node.completion} maxLength={1200} onChange={event => patch({ completion: event.target.value })} /></label>
    <label>필수 결과 파일
      <input defaultValue={node.outputs.join(', ')} placeholder="결과 파일 상대 경로, 쉼표로 구분" onBlur={event => patch({
        outputs: event.target.value.split(',').map(item => item.trim()).filter(Boolean),
      })} />
    </label>
    <label className="tc-wf-check"><input type="checkbox" checked={node.needsDevice} onChange={event => patch({ needsDevice: event.target.checked })} /> 대상 장비 점유</label>
    <label className="tc-wf-check"><input type="checkbox" checked={node.tools} onChange={event => patch({ tools: event.target.checked })} /> DSH 도구 필요</label>
    <div className="tc-wf-deps">
      <strong>선행 작업</strong>
      {node.after.map(edge => <div className="tc-wf-row" key={edge.from}>
        <span>{draft.nodes.find(item => item.id === edge.from)?.title}</span>
        <select aria-label="연결 실행 조건" value={edge.when} onChange={event => patch({ after: node.after.map(item =>
          item.from === edge.from ? { ...item, when: event.target.value } : item) })}>
          {Object.entries(edgeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button type="button" onClick={() => patch({ after: node.after.filter(item => item.from !== edge.from) })}>연결 삭제</button>
      </div>)}
      <div className="tc-wf-row"><select aria-label="추가할 선행 작업" value={dependency} onChange={event => setDependency(event.target.value)}>
        <option value="">선행 작업 선택</option>{options.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select><button type="button" disabled={!options.some(item => item.id === dependency)} onClick={() => {
        patch({ after: [...node.after, { from: dependency, when: 'success' }] })
        setDependency('')
      }}>연결 추가</button></div>
    </div>
    <button type="button" className="tc-wf-danger" onClick={onRemove}>작업 삭제</button>
  </fieldset>
}

function GroupEditor({ draft, edit, members }) {
  return <details className="tc-wf-fieldset"><summary>계층 그룹 편집</summary>
    {draft.groups.map(group => <div className="tc-wf-group-edit" key={group.id}>
      <label>그룹 이름<input value={group.title} onChange={event => edit({ ...draft, groups: draft.groups.map(item =>
        item.id === group.id ? { ...item, title: event.target.value } : item) })} /></label>
      <label>그룹 담당 Agent<select aria-label="그룹 담당 Agent" value={group.agent ?? ''} onChange={event => edit({ ...draft, groups: draft.groups.map(item =>
        item.id === group.id ? { ...item, agent: event.target.value || null } : item) })}>
        <option value="">미배정</option>{members.map(item => <option key={item.id} value={item.id}>@{item.name}</option>)}
      </select></label>
      <label>상위 그룹<select aria-label="상위 그룹" value={group.parent ?? ''} onChange={event => edit({ ...draft, groups: draft.groups.map(item =>
        item.id === group.id ? { ...item, parent: event.target.value || null } : item) })}>
        <option value="">최상위</option>{draft.groups.filter(item => item.id !== group.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <button type="button" onClick={() => edit({
        ...draft, groups: draft.groups.filter(item => item.id !== group.id).map(item => item.parent === group.id ? { ...item, parent: group.parent } : item),
        nodes: draft.nodes.map(node => node.group === group.id ? { ...node, group: group.parent } : node),
      })}>그룹 삭제</button>
    </div>)}
    <button type="button" disabled={draft.groups.length >= 12} onClick={() => edit({
      ...draft, groups: [...draft.groups, { id: newKey('group'), title: '새 그룹', parent: null }],
    })}>그룹 추가</button>
  </details>
}

function Conflict({ workflow }) {
  const [choices, setChoices] = useState({})
  const merge = mergeEdits(workflow.local.original, workflow.draft, workflow.server.draft, choices)
  const pending = mergeEdits(workflow.local.original, workflow.draft, workflow.server.draft).conflicts
  return <div className="tc-wf-notice">
    <strong>다른 창에서 초안을 변경했습니다</strong>
    {pending.map(item => <label key={item.key}>{item.label}
      <select value={choices[item.key] ?? ''} onChange={event => setChoices({ ...choices, [item.key]: event.target.value })}>
        <option value="">유지할 값 선택</option>
        <option value="local">이 창 · {JSON.stringify(item.local)?.slice(0, 100) ?? '삭제'}</option>
        <option value="remote">최신 · {JSON.stringify(item.remote)?.slice(0, 100) ?? '삭제'}</option>
      </select>
    </label>)}
    <button type="button" disabled={!!merge.conflicts.length} onClick={() => workflow.rebase(merge.draft)}>변경 합치기</button>
    <button type="button" onClick={() => workflow.rebase(workflow.server.draft)}>최신 초안 불러오기</button>
  </div>
}

function FolderForm({ folder, versions, save }) {
  const [value, setValue] = useState(folder ?? { directory: '.', suffix: '.bin', device: '', enabled: false })
  const patch = fields => setValue(previous => ({ ...previous, ...fields }))
  return <details className="tc-wf-fieldset"><summary>폴더 트리거{folder?.enabled ? ' · 사용 중' : ''}</summary>
    {folder?.version && <small>지정 버전 v{folder.version}</small>}
    <label>감시 폴더<input value={value.directory} onChange={event => patch({ directory: event.target.value })} /></label>
    <label>파일 확장자<input value={value.suffix} onChange={event => patch({ suffix: event.target.value })} /></label>
    <label>트리거 대상 장비<input value={value.device} onChange={event => patch({ device: event.target.value })} /></label>
    <label className="tc-wf-check"><input type="checkbox" checked={value.enabled} onChange={event => patch({ enabled: event.target.checked })} /> 폴더 감시 켜기</label>
    <button type="button" disabled={!versions.length} onClick={() => save({
      directory: value.directory, suffix: value.suffix, device: value.device, enabled: value.enabled,
    })}>최신 저장 버전으로 적용</button>
  </details>
}

function RunDetails({ run, node, workflow, openAgent, openMessage, ask }) {
  const step = node && run.steps[node.id]
  if (!step) return null
  return <section className="tc-wf-fieldset">
    <strong>{node.title} · {states[step.status]}</strong>
    {step.detail && <p>{step.detail}</p>}
    {step.native && <p><small>DSH {step.native} · 시도 {step.attempt}회</small></p>}
    {step.summary && <p>{step.summary}</p>}
    {step.artifacts?.length > 0 && <ul className="tc-wf-artifacts">{step.artifacts.map(item => <li key={item.path}>
      <code>{item.path}</code> <small title={item.sha256}>{item.bytes} B · SHA-256 {item.sha256.slice(0, 10)}…</small>
    </li>)}</ul>}
    <div className="tc-wf-row">
      {step.messageId && <button type="button" onClick={() => openMessage(step.messageId)}>채팅 기록 보기</button>}
      {node.agent && <button type="button" onClick={() => openAgent(node.agent)}>DSH 원본 세션</button>}
    </div>
    {step.question && step.status === 'question' && <div className="tc-wf-notice">
      <p>{step.question.text}</p>
      <button className="tc-wf-primary" type="button" onClick={() => ask({ run, node, question: step.question })}>채팅에서 답변</button>
    </div>}
    <TaskControls key={step.token ?? 0} run={run} node={node} step={step} command={workflow.command} />
  </section>
}

export function WorkflowPanel({ workflow, selected, onSelect, runId, onRun, tab, setTab, onDesign, ask, onClose, openAgent, openMessage }) {
  const [view, setView] = useState('')
  const [version, setVersion] = useState('')
  const [input, setInput] = useState('')
  const [device, setDevice] = useState('')
  const [tools, setTools] = useState(false)
  const [applying, setApplying] = useState(false)
  const [publishNote, setPublishNote] = useState('')
  const { server, draft, edit } = workflow
  const members = server?.members ?? []
  const run = server?.runs.find(item => item.id === runId) ?? server?.runs[0]
  const graph = tab === 'run' && run ? run.draft : draft
  const node = graph.nodes.find(node => node.id === selected)
  let validation
  try { checkDraft(draft, members) } catch (cause) { validation = cause.message }
  const patch = (id, fields) => edit({ ...draft, nodes: draft.nodes.map(item => item.id === id ? { ...item, ...fields } : item) })
  const move = offset => {
    const index = draft.nodes.findIndex(item => item.id === selected)
    const destination = index + offset
    if (destination < 0 || destination >= draft.nodes.length) return
    const nodes = [...draft.nodes]
    nodes.splice(destination, 0, ...nodes.splice(index, 1))
    edit({ ...draft, nodes })
  }
  return <aside className="tc-wf-panel" aria-label="워크플로우 패널">
    <header className="tc-wf-panel-head"><div><h2>워크플로우</h2><small>{server?.versions.at(-1) ? '저장 v' + server.versions.at(-1).version : '저장된 버전 없음'}</small></div>
      <button type="button" onClick={onClose} aria-label="워크플로우 닫기">닫기</button></header>
    <nav className="tc-wf-tabs" aria-label="워크플로우 메뉴">
      <button type="button" aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>편집</button>
      <button type="button" aria-pressed={tab === 'run'} onClick={() => setTab('run')}>실행 상태</button>
      <button type="button" onClick={onDesign}>채팅으로 설계</button>
    </nav>
    <div className="tc-wf-panel-scroll">
      {workflow.error && <p className="tc-error" role="alert">{workflow.error}</p>}
      {!server ? <p>워크플로우 불러오는 중</p> : <>
        {server.unavailable && <p className="tc-error">{server.unavailable}</p>}
        {tab === 'edit' ? <>
          {workflow.preview && <details className="tc-wf-fieldset tc-wf-preview" open><summary>제안 그래프 미리 보기</summary>
            <Graph draft={workflow.preview.result.draft} members={members}
              layout={workflow.preview.result.draft.layout} selected={selected} onSelect={onSelect} previous={draft} />
          </details>}
          <div className="tc-wf-fieldset">
            <label>워크플로우 이름<input value={draft.title} maxLength={100} onChange={event => edit({ ...draft, title: event.target.value })} /></label>
            <label>{draft.nodes.length ? '초안의 기본 보기' : '시작 형태'}<select aria-label={draft.nodes.length ? '초안의 기본 보기' : '시작 형태'} value={draft.layout} onChange={event => {
              const layout = event.target.value
              edit(draft.nodes.length ? { ...draft, layout } : { ...draftFromLayout(layout), title: draft.title })
              setView('')
            }}>{Object.entries(layoutLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          <GroupEditor draft={draft} edit={edit} members={members} />
          <div className="tc-wf-row tc-wf-edit-actions">
            <button type="button" disabled={draft.nodes.length >= 16} onClick={() => {
              const node = initialNode(newKey('step'))
              edit({ ...draft, nodes: [...draft.nodes, node] })
              onSelect(node.id)
            }}>작업 추가</button>
            <button type="button" disabled={!workflow.canUndo} onClick={workflow.revert}>되돌리기</button>
          </div>
        </> : <div className="tc-wf-fieldset">
          <form onSubmit={async event => {
            event.preventDefault()
            const chosen = Number(version || server.versions.at(-1)?.version)
            const result = await workflow.command({ action: 'start', version: chosen, id: crypto.randomUUID(), input, device, tools })
            if (result) { onRun(result.id); onSelect('') }
          }}>
            <label>실행할 버전<select aria-label="실행할 버전" value={version || server.versions.at(-1)?.version || ''} onChange={event => setVersion(event.target.value)}>
              <option value="" disabled>버전 선택</option>{server.versions.map(item => <option key={item.version} value={item.version}>v{item.version} · {item.title}</option>)}
            </select></label>
            <label>입력 파일<input value={input} onChange={event => setInput(event.target.value)} placeholder="작업 공간 상대 경로" /></label>
            <label>대상 장비 ID<input value={device} onChange={event => setDevice(event.target.value)} /></label>
            <label className="tc-wf-check"><input type="checkbox" checked={tools} onChange={event => setTools(event.target.checked)} /> 이 실행의 DSH 도구 허용</label>
            <button type="submit" className="tc-wf-primary" disabled={!server.versions.length || workflow.busy}>워크플로우 실행</button>
          </form>
          {run && <label>실행 이력<select aria-label="실행 이력" value={run.id} onChange={event => { onRun(event.target.value); onSelect('') }}>
            {server.runs.map(item => <option key={item.id} value={item.id}>{item.draft.title} · {states[item.status]} · {new Date(item.created).toLocaleTimeString()}</option>)}
          </select></label>}
          {run?.setupError && <div><p className="tc-error">{run.setupError}</p>
            <button type="button" disabled={workflow.busy} onClick={() => workflow.command({
              action: 'repair', id: run.id, runRevision: run.revision,
            })}>DSH 작업 보드 다시 연결</button></div>}
        </div>}
        <label className="tc-wf-view">관계 보기<select aria-label="관계 보기" value={view || graph.layout} onChange={event => setView(event.target.value)}>
          {Object.entries(layoutLabels).filter(([key]) => key !== 'blank' || graph.layout === 'blank').map(([key, label]) =>
            <option key={key} value={key}>{label}</option>)}
        </select></label>
        <Graph draft={graph} members={members} layout={view || graph.layout} selected={selected} onSelect={onSelect}
          onChange={tab === 'edit' ? patch : null} run={tab === 'run' ? run : null} />
        {tab === 'edit' ? <>
          {node && <>
            <div className="tc-wf-row">
              <button type="button" onClick={() => move(-1)}>표시 순서 위로</button><button type="button" onClick={() => move(1)}>표시 순서 아래로</button>
              <button type="button" onClick={onDesign}>이 작업을 채팅으로 편집</button>
            </div>
            <NodeEditor key={node.id} draft={draft} node={node} patch={fields => patch(node.id, fields)} onRemove={() => {
              edit({ ...draft, nodes: draft.nodes.filter(item => item.id !== node.id).map(item => ({
                ...item, after: item.after.filter(edge => edge.from !== node.id),
              })) })
              onSelect('')
            }} />
          </>}
          {validation && <p className="tc-error">{validation}</p>}
          {workflow.conflict && <Conflict key={server.revision} workflow={workflow} />}
          <div className="tc-wf-row tc-wf-save">
            <button type="button" disabled={!!validation || workflow.busy || !workflow.local || workflow.conflict}
              onClick={workflow.persist}>초안 저장</button>
            <button type="button" className="tc-wf-primary" disabled={!!validation || workflow.busy || workflow.conflict || !draft.nodes.length}
              onClick={async () => { const result = await workflow.publish(); if (result) setPublishNote('v' + result.version + ' 저장됨') }}>버전 저장</button>
            {publishNote && <small role="status">{publishNote}</small>}
          </div>
          <FolderForm key={server.folder?.since ?? 'new'} folder={server.folder} versions={server.versions} save={workflow.folder} />
          <details className="tc-wf-fieldset"><summary>DSH 원본 작업 {server.native.length}건</summary>
            <ul>{server.native.map(item => <li key={item.id}>{item.subject} · {item.id} · {item.ownerName ?? '미배정'} · {item.status}</li>)}</ul>
          </details>
        </> : run && <>
          <RunDetails key={run.id + '/' + (node?.id ?? '')} run={run} node={node} workflow={workflow} openAgent={openAgent} openMessage={openMessage} ask={ask} />
          <details className="tc-wf-fieldset"><summary>실행 타임라인 {run.events.length}건</summary>
            <ol>{run.events.map(event => <li key={event.seq}>{new Date(event.time).toLocaleTimeString()} · {run.draft.nodes.find(node => node.id === event.nodeId)?.title ?? run.draft.title} · {states[event.status] ?? event.status}{event.detail ? ' · ' + event.detail : ''}</li>)}</ol>
          </details>
          {run.status !== 'complete' && run.status !== 'failed' && <section className="tc-wf-fieldset">
            <button type="button" onClick={() => setApplying(!applying)}>현재 실행에 초안 변경 미리 보기</button>
            {applying && <><ul>{changedDraft(run.draft, draft, members).map((item, index) => <li key={index}>{item}</li>)}</ul>
              <button type="button" disabled={workflow.busy || !!validation || !changedDraft(run.draft, draft, members).length}
                onClick={async () => { if (await workflow.reviseRun(run)) setApplying(false) }}>미실행 작업에 적용</button></>}
          </section>}
        </>}
      </>}
    </div>
  </aside>
}
