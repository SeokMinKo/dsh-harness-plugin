import React, { useState } from 'react'

export const taskStates = {
  pending: '대기', running: '실행 중', finishing: '결과 반영 중', question: '답변 대기', approval: '승인 대기',
  complete: '완료', failed: '실패', skipped: '건너뜀', interrupted: '확인 필요',
  stopping: '중지 요청됨', suspended: '중지됨', cancelled: '취소됨', blocked: '후속 작업 보류',
}

export function TaskControls({ run, node, step, command }) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState(step.inputText ?? '')
  const [file, setFile] = useState(undefined)
  const [tools, setTools] = useState(false)
  const ready = ['pending', 'running', 'question', 'approval'].includes(step.status)
  const recoverable = ['suspended', 'interrupted', 'failed'].includes(step.status)

  async function submit(input) {
    setError('')
    setWorking(true)
    try {
      const result = await command({ id: run.id, nodeId: node.id, ...input })
      if (result) setExpanded(false)
    } catch (cause) { setError(cause.message) }
    finally { setWorking(false) }
  }

  function recover(decision) {
    return submit({
      action: 'recoverTask', token: step.token ?? 0, decision, tools,
      ...(file !== undefined ? { file } : {}), ...(text !== (step.inputText ?? '') ? { text } : {}),
    })
  }

  if (!ready && !recoverable && step.status !== 'stopping') return null
  return <div className="tc-task-actions">
    {step.hasCheckpoint && <small className="tc-wf-muted">체크포인트 저장됨</small>}
    {ready && <button className="tc-wf-danger" disabled={working} type="button"
      onClick={() => submit({ action: 'stopTask', token: step.token ?? 0 })}>이 작업만 중지</button>}
    {step.status === 'stopping' && <small role="status">Agent가 중지를 처리 중입니다.</small>}
    {step.status === 'approval' && <button type="button" disabled={working}
      onClick={() => submit({ action: 'authorize', attempt: step.attempt })}>이 작업의 DSH 도구 허용</button>}
    {recoverable && <>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>복구 선택</button>
      {expanded && <div className="tc-task-recover">
        {node.needsDevice && step.status === 'interrupted' && <p>장비 상태를 확인한 뒤 조치를 선택하세요.</p>}
        {!step.hasCheckpoint && <small>저장된 체크포인트가 없습니다.</small>}
        {!step.finishPending && <>
          <label>교정한 입력<textarea maxLength={6000} value={text} onChange={event => setText(event.target.value)} /></label>
          <label>교체 파일<input value={file ?? step.inputFile?.path ?? run.input ?? ''} onChange={event => setFile(event.target.value)}
            placeholder="작업 공간 상대 경로" /></label>
          {node.tools && <label className="tc-wf-check"><input type="checkbox" checked={tools}
            onChange={event => setTools(event.target.checked)} /> 이 시도에 DSH 도구 허용</label>}
        </>}
        <div className="tc-wf-row">
          {step.finishPending ? <button type="button" disabled={working}
            onClick={() => submit({ action: 'retry', attempt: step.attempt, decision: 'retry', tools: false })}>결과 반영 다시 시도</button>
            : <>
              <button type="button" disabled={working || !step.hasCheckpoint} onClick={() => recover('resume')}>중단 지점부터 재개</button>
              <button type="button" disabled={working} onClick={() => recover('restart')}>처음부터 재실행</button>
            </>}
          <button type="button" className="tc-wf-danger" disabled={working} onClick={() => recover('cancel')}>이 작업 취소</button>
        </div>
      </div>}
    </>}
    {error && <p className="tc-error" role="alert">{error}</p>}
  </div>
}
