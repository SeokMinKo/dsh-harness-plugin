import React, { useState } from 'react'
import { TaskControls, taskStates } from './task-controls.jsx'

export function AllocationCard({ id, assignment, members, command, openAgent, ask }) {
  const [chosen, setChosen] = useState({})
  const [file, setFile] = useState('')
  const [device, setDevice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const plan = assignment?.draft
  const run = assignment?.run
  const agentName = agent => members.find(member => member.id === agent)?.name ?? '팀원'
  const taskName = id => plan.nodes.find(node => node.id === id)?.title ?? id

  async function approve(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await command({ action: 'approveAllocation', id, revision: assignment.revision, input: file, device,
        assignments: plan.nodes.map(node => ({ nodeId: node.id, agent: chosen[node.id] ?? node.agent })) })
    } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }

  if (!assignment || assignment.status === 'planning') return <p className="tc-allocation-note" role="status">리드가 배분안을 작성하고 있습니다.</p>
  if (assignment.status === 'failed' || assignment.status === 'stopped') {
    return <p className="tc-allocation-note" role="status">{assignment.detail}</p>
  }
  if (run) return <section className="tc-allocation" aria-label="Agent별 실행 결과">
    <header><strong>Agent별 결과</strong><span className="tc-wf-status" data-state={run.status}>{taskStates[run.status]}</span></header>
    <ul className="tc-allocation-tasks">
      {run.draft.nodes.map(node => {
        const step = run.steps[node.id]
        return <li key={node.id} aria-label={node.title + ' 결과'}>
          <div className="tc-allocation-task"><strong>{node.title}</strong><small>@{agentName(node.agent)}</small>
            <span className="tc-wf-status" data-state={step.status}>{step.attention?.kind === 'approval' ? 'DSH 승인 대기'
              : step.attention?.kind === 'question' ? 'DSH 질문 대기' : taskStates[step.status]}</span></div>
          {(step.summary || step.waiting || step.detail) && <p>{step.summary || step.waiting || step.detail}</p>}
          {step.artifacts?.length > 0 && <ul className="tc-wf-artifacts">{step.artifacts.map(file => <li key={file.path}>
            <code>{file.path}</code> <small title={file.sha256}>SHA-256 {file.sha256.slice(0, 10)}…</small>
          </li>)}</ul>}
          {step.question && step.status === 'question' && <div className="tc-wf-notice">
            <p>{step.question.text}</p><button type="button" onClick={() => ask({ run, node, question: step.question })}>채팅에서 답변</button>
          </div>}
          {step.messageId && <button className="tc-allocation-session" type="button" onClick={() => openAgent(node.agent)}>
            @{agentName(node.agent)} 원본 세션
          </button>}
          <TaskControls key={step.token ?? 0} run={run} node={node} step={step} command={command} />
        </li>
      })}
    </ul>
  </section>

  if (assignment.status !== 'review' || !plan) return null
  const valid = plan.nodes.every(node => members.some(member => member.id === (chosen[node.id] ?? node.agent)))
  const needsDevice = plan.nodes.some(node => node.needsDevice)
  return <form className="tc-allocation" aria-label="리드 배분안" onSubmit={approve}>
    <header><strong>{plan.title}</strong><span className="tc-wf-status">승인 대기</span></header>
    <ul className="tc-allocation-tasks">
      {plan.nodes.map(node => {
        const selected = chosen[node.id] ?? node.agent
        return <li key={node.id}>
          <div className="tc-allocation-task"><strong>{node.title}</strong>
            <select aria-label={node.title + ' 담당 Agent'} value={selected} onChange={event => setChosen({ ...chosen, [node.id]: event.target.value })}>
              {!members.some(member => member.id === selected) && <option value={selected}>담당 Agent 선택</option>}
              {members.map(member => <option key={member.id} value={member.id}>@{member.name}</option>)}
            </select>
          </div>
          <p>{node.instruction}</p>
          {node.completion && <small>완료 조건 · {node.completion}</small>}
          {node.after.length > 0 && <small>선행 · {node.after.map(edge => taskName(edge.from)).join(', ')}</small>}
          {node.tools && <small>DSH 도구 필요 · 실행 단계에서 허용</small>}
        </li>
      })}
    </ul>
    <details><summary>입력 파일{needsDevice ? ' · 대상 장비 필수' : ''}</summary>
      <label>입력 파일<input maxLength={240} value={file} onChange={event => setFile(event.target.value)} /></label>
      {needsDevice && <label>대상 장비 ID<input maxLength={96} value={device} onChange={event => setDevice(event.target.value)} /></label>}
    </details>
    <button className="tc-wf-primary" type="submit" disabled={busy || !valid || needsDevice && !device.trim()}>배분안 전체 승인</button>
    {error && <p className="tc-error" role="alert">{error}</p>}
  </form>
}
