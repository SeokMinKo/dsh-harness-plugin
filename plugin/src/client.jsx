import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { descriptors, packageName } from './protocol.js'
import { insertMention, matchesMessage, mentionAt, requestIdentity, retryDraft } from './composer.js'
import { routeUser } from './routing.js'
import { requestsAllocation } from './allocation-routing.js'
import { AllocationCard } from './allocation-ui.jsx'
import styles from './style.css'
import workflowStyles from './workflow.css'
import { WorkflowChat, WorkflowPanel, useWorkflow } from './workflow-ui.jsx'

const PANEL = 'team-chat'
const empty = { teams: [], rooms: [], available: true }
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const handoffWarning = {
  unknown: '방에 없는 팀원',
  self: '자기 자신에게 인계',
  broadcast: '팀원 인계에는 개별 멘션 필요',
  'round-limit': '설정된 라운드 한도 도달',
  budget: '요청당 발언 한도 도달',
}

export const inject = ['remote', 'slots', 'layout', 'uiWorkspace']

function Icon({ kind = 'chat', size = 19 }) {
  const paths = {
    chat: 'M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2v-5a7.5 7.5 0 0 1 6.5-12h2a7.5 7.5 0 0 1 7.5 7.5Z M8 11h8 M8 14h5',
    send: 'M5 12h14m-6-6 6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    stop: 'M7 7h10v10H7z',
    open: 'M13 5h6v6m0-6-9 9m7-1v6H5V7h6',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}

function avatarStyle(message, members) {
  const colors = ['mint', 'blue', 'rose', 'amber', 'lilac', 'stone']
  return message.kind === 'user' ? 'human' : colors[Math.max(0, members.findIndex(item => item.id === message.memberId))]
}

function mergeMessages(older, newer) {
  const byPosition = new Map(older.map(message => [message.position, message]))
  for (const message of newer) byPosition.set(message.position, message)
  return [...byPosition.values()].sort((left, right) => left.position - right.position)
}

function reconcileSnapshot(previous, snapshot) {
  if (previous?.teamId !== snapshot.teamId) return snapshot
  const start = snapshot.messages[0]?.position
  const first = previous.messages[0]?.position
  const last = previous.messages.at(-1)?.position
  // A snapshot contains only the latest page. Keep previously loaded pages when they are contiguous.
  if (start === undefined || first === undefined || start < first || start > last + 1) return snapshot
  return { ...snapshot, messages: mergeMessages(previous.messages, snapshot.messages), earlier: previous.earlier }
}

function RoomSettings({ source, current, onSubmit, onCancel }) {
  const [title, setTitle] = useState(current?.title ?? source.title)
  const [members, setMembers] = useState(current?.members.map(item => item.id) ?? source.members.slice(0, 6).map(item => item.id))
  const [rounds, setRounds] = useState(current?.rounds ?? 3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const chosen = members.filter(id => source.members.some(item => item.id === id))
  return <form className="tc-config" onSubmit={async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await onSubmit({ op: 'save', teamId: source.teamId, title, members: chosen, rounds }) }
    catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }}>
    <h2>{current ? '대화방 설정' : '팀 대화방 만들기'}</h2>
    <label>방 이름<input value={title} maxLength={100} required onChange={event => setTitle(event.target.value)} /></label>
    <fieldset><legend>팀원 · {chosen.length}/6</legend>
      {source.members.map(item => <label className="tc-check" key={item.id}>
        <input type="checkbox" checked={chosen.includes(item.id)} disabled={!chosen.includes(item.id) && chosen.length >= 6}
          onChange={event => setMembers(event.target.checked ? [...chosen, item.id] : chosen.filter(id => id !== item.id))} />
        <span><strong>@{item.name}</strong>{item.description && <small>{item.description}</small>}</span>
      </label>)}
    </fieldset>
    <label>최대 발언 라운드
      <select value={rounds} onChange={event => setRounds(Number(event.target.value))}>
        <option value="1">1 · 직접 부른 팀원만</option><option value="2">2</option><option value="3">3</option>
      </select>
    </label>
    {error && <p role="alert" className="tc-error">{error}</p>}
    <div className="tc-actions"><button type="button" onClick={onCancel}>취소</button>
      <button className="tc-primary" disabled={busy || chosen.length < 2 || !title.trim()}>{busy ? '저장 중' : '저장'}</button></div>
  </form>
}

function Composer({ room, draftStore, reply, onClearReply, onSend, onStop }) {
  const teamId = room.teamId
  const [draft, setDraft] = useState(() => draftStore.get(teamId)?.text ?? '')
  const [tools, setTools] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mentionMode, setMentionMode] = useState('')
  const [planMode, setPlanMode] = useState(Boolean(draftStore.get(teamId)?.allocation))
  const [caret, setCaret] = useState(draft.length)
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const sending = useRef(false)
  const field = useRef(null)
  const listId = 'tc-mentions-' + React.useId()
  useEffect(() => { if (reply) field.current?.focus() }, [reply])
  const range = mentionAt(draft, caret)
  const candidates = ['all', ...room.members.map(item => item.name)]
    .filter(name => mentionMode === 'menu' || name.toLowerCase().startsWith(range?.query ?? ''))
  const listOpen = Boolean((mentionMode === 'menu' || (mentionMode === 'typed' && range)) && candidates.length)
  const chosen = Math.min(selected, candidates.length - 1)
  const allocation = !reply && (planMode || requestsAllocation(draft))
  let toolError = ''
  if (tools && !allocation && draft.trim()) {
    try { routeUser(draft, room.members, reply?.memberId, true) }
    catch (cause) { toolError = cause.message }
  }

  function edit(text, position) {
    setDraft(text)
    setCaret(position)
    if (draftStore.get(teamId)?.text !== text) draftStore.set(teamId, { text, allocation: planMode })
  }

  async function send(event) {
    event?.preventDefault()
    if (!draft.trim() || sending.current || toolError) return
    sending.current = true
    setBusy(true)
    setError('')
    const body = { text: draft, tools: tools && !allocation, ...(reply ? { replyTo: reply.id } : {}),
      ...(allocation ? { allocation: true } : {}) }
    const identity = requestIdentity(draftStore.get(teamId), body, () => crypto.randomUUID())
    draftStore.set(teamId, { ...identity, allocation: planMode })
    try {
      await onSend({ op: 'send', teamId, id: identity.id, ...body })
      if (draftStore.get(teamId)?.id === identity.id) draftStore.delete(teamId)
      setDraft('')
      setTools(false)
      setPlanMode(false)
      setMentionMode('')
      onClearReply()
      requestAnimationFrame(() => field.current?.focus())
    } catch (cause) { setError(cause.message) }
    finally { sending.current = false; setBusy(false) }
  }

  function mention(name) {
    const at = field.current?.selectionStart ?? caret
    const match = mentionAt(draft, at) ?? { start: at, end: field.current?.selectionEnd ?? at }
    const result = insertMention(draft, name, match)
    edit(result.text, result.caret)
    setMentionMode('')
    requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.setSelectionRange(result.caret, result.caret)
    })
  }

  return <form className="tc-compose" onSubmit={send}>
    {reply && <div className="tc-replying"><span>@{reply.author}에게 답장 · {reply.text.slice(0, 80)}</span>
      <button type="button" onClick={onClearReply} aria-label="답장 취소">×</button></div>}
    {(error || toolError) && <div className="tc-error" role="alert">{error || toolError}</div>}
    <textarea ref={field} aria-label="메시지" rows={3} maxLength={12_000} disabled={busy} value={draft}
      aria-autocomplete="list" aria-controls={listOpen ? listId : undefined}
      aria-activedescendant={listOpen ? listId + '-' + chosen : undefined}
      placeholder="팀에 메시지 보내기"
      onSelect={event => {
        const position = event.currentTarget.selectionStart
        if (position !== caret && mentionMode !== 'menu') setMentionMode(mentionAt(draft, position) ? 'typed' : '')
        setCaret(position)
        setSelected(0)
      }}
      onChange={event => {
        const { value, selectionStart } = event.currentTarget
        edit(value, selectionStart)
        setMentionMode(mentionAt(value, selectionStart) ? 'typed' : '')
        setSelected(0)
        setError('')
      }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return
        if (event.key === 'Escape' && listOpen) { event.preventDefault(); setMentionMode(''); return }
        if (listOpen && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault()
          setSelected((chosen + (event.key === 'ArrowDown' ? 1 : candidates.length - 1)) % candidates.length)
          return
        }
        if (listOpen && (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey))) {
          event.preventDefault()
          mention(candidates[chosen])
          return
        }
        if (event.key === 'Enter' && !event.shiftKey) void send(event)
      }} />
    {listOpen && <div className="tc-mentions" id={listId} role="listbox" aria-label="팀원 멘션">
      {candidates.map((name, i) => <button key={name} id={listId + '-' + i} type="button" role="option"
        aria-selected={i === chosen} tabIndex={-1} onMouseDown={event => event.preventDefault()}
        onClick={() => mention(name)}>@{name}</button>)}
    </div>}
    <div className="tc-compose-foot">
      <button type="button" aria-label="팀원 멘션" title="팀원 멘션" onClick={() => {
        setMentionMode(mentionMode === 'menu' ? '' : 'menu')
        setSelected(0)
        field.current?.focus()
      }}>＠</button>
      {!reply && <button type="button" aria-pressed={planMode} onClick={() => {
        setPlanMode(!planMode)
        if (!planMode) setTools(false)
        draftStore.set(teamId, { text: draft, allocation: !planMode })
        field.current?.focus()
      }}>업무 나누기</button>}
      {allocation && <small>리드 배분안 · 승인 후 실행</small>}
      <label className="tc-tool-toggle" title="한 팀원을 직접 호출할 때 DSH 권한으로 도구 사용">
        <input type="checkbox" checked={tools && !allocation} disabled={allocation} onChange={event => setTools(event.target.checked)} /> 이번 메시지에 DSH 도구 허용
      </label>
      <span className="tc-spacer" />
      {room.activeId && <button type="button" aria-label="현재 응답만 중지" title="현재 응답만 중지" onClick={() => onStop('current')}><Icon kind="stop" size={16} /></button>}
      <button className="tc-primary tc-send" aria-label="보내기" disabled={!draft.trim() || busy || Boolean(toolError)}><Icon kind="send" size={18} /></button>
    </div>
  </form>
}

function RoomActivity({ room, open, onAnswer, onResume }) {
  const activity = room.activity
  const attention = room.awaiting
  const name = id => room.members.find(member => member.id === id)?.name ?? '팀원'
  const status = { approval: 'DSH 승인 대기', question: 'DSH 질문 대기', 'native-queue': '원본 세션 대기열', running: '응답 중', stopping: '중지 중' }
  if (!activity && !attention && !room.queued) return null
  return <section className="tc-activity" aria-label="대화방 활동">
    {attention && <div className="tc-activity-row tc-attention">
      <span role="status"><strong>사용자 답변 대기</strong> · @{name(attention.memberId)}
        {attention.remaining > 0 ? ' · 남은 팀원 작업 ' + attention.remaining + '건' : ''}</span>
      <button type="button" onClick={onAnswer}>답변하기</button>
      <button type="button" onClick={onResume}>대기열 재개</button>
    </div>}
    {activity && <div className="tc-activity-row">
      <span role="status"><strong>@{name(activity.memberId)}</strong> · {status[activity.kind]}{activity.toolName ? ' · ' + activity.toolName : ''}</span>
      {['approval', 'question', 'native-queue'].includes(activity.kind) &&
        <button type="button" onClick={() => open(room.teamId, activity.memberId)}><Icon kind="open" size={13} /> 원본 세션 열기</button>}
    </div>}
    {room.queued > 0 && <details className="tc-queue">
      <summary>대기열 {room.queued}건</summary>
      <ol>{room.queuedPreview?.map(item => <li key={item.id}>{item.text}</li>)}</ol>
    </details>}
  </section>
}

function Timeline({ room, onEarlier, messages, onReply, onRetry, onWorkflow, open, query, command, ask }) {
  const log = useRef(null)
  const follow = useRef(true)
  const [jump, setJump] = useState(false)
  const statuses = { queued: '대기 중', running: '응답 중', waiting: '사용자 답변 대기 중', partial: '일부 실패', stopped: '중지됨', interrupted: '재시작으로 중단됨', failed: '실패' }
  const authors = new Map(messages.map(message => [message.id, message]))
  const visible = query.trim() ? messages.filter(message => matchesMessage(message, query)) : messages
  useEffect(() => {
    if (log.current && follow.current && !query.trim()) log.current.scrollTop = log.current.scrollHeight
  }, [messages.at(-1)?.id, messages.at(-1)?.text, messages.at(-1)?.status])
  return <div className="tc-log-wrap"><div className="tc-log" ref={log} aria-label="공유 대화 기록" onScroll={() => {
    const node = log.current
    if (node) {
      follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70
      setJump(!follow.current)
    }
  }}>
    {room.earlier && <button className="tc-earlier" type="button" onClick={async () => {
      follow.current = false
      const node = log.current
      const previous = node?.scrollHeight
      await onEarlier()
      requestAnimationFrame(() => { if (node && previous != null) node.scrollTop += node.scrollHeight - previous })
    }}>이전 메시지 보기</button>}
    {!messages.length && <div className="tc-empty">
      <Icon size={30} /><h2>첫 메시지를 보내세요</h2>
      <p>@{room.members.find(item => item.role === 'lead')?.name ?? room.members[0].name}로 팀원 한 명을 부르거나 @all로 모두에게 물어볼 수 있습니다.</p>
    </div>}
    {query.trim() && <p className="tc-search-count" role="status">불러온 메시지 중 {visible.length}건</p>}
    {visible.map(message => <article key={message.id} data-message-id={message.id} className={'tc-message tc-' + message.kind}>
      <div className={'tc-avatar tc-' + avatarStyle(message, room.members)}>{message.author.slice(0, 1).toUpperCase()}</div>
      <div className="tc-bubble">
        <div className="tc-byline"><strong>{message.kind === 'bot' ? '@' : ''}{message.author}</strong>
          <time dateTime={new Date(message.time).toISOString()}>{clock.format(message.time)}</time>
          {message.kind === 'bot' && !message.workflowRunId && message.text && message.status !== 'running' &&
            <button type="button" onClick={() => onReply(message)}>답장</button>}
          {message.workflowRunId && <button type="button" onClick={() => onWorkflow(message)}>워크플로우 작업 보기</button>}
          {message.kind === 'user' && ['failed', 'stopped', 'interrupted'].includes(message.status) &&
            <button type="button" onClick={() => onRetry(message)}>다시 작성</button>}
          {message.kind === 'bot' && <button type="button" title="DSH 원본 세션 열기" aria-label={message.author + ' 원본 세션 열기'}
            onClick={() => open(room.teamId, message.memberId)}><Icon kind="open" size={13} /></button>}
        </div>
        {authors.get(message.replyTo)?.kind === 'bot' && <div className="tc-origin">↳ @{authors.get(message.replyTo).author}</div>}
        {message.text && <div className="tc-body">{message.text}</div>}
        {message.allocation && (message.assignment || !['failed', 'stopped', 'interrupted'].includes(message.status)) &&
          <AllocationCard id={message.id} assignment={message.assignment} members={room.members} command={command}
            openAgent={agent => open(room.teamId, agent)} ask={ask} />}
        {message.error && <div className="tc-error">{message.error}</div>}
        {message.truncated && <span className="tc-status">긴 응답 일부 생략 · 전체는 원본 세션</span>}
        {!!message.handoffWarnings?.length && <ul className="tc-handoff-warnings" aria-label="인계 미실행">
          {message.handoffWarnings.map(item => <li key={item.name}>@{item.name} · {handoffWarning[item.reason]}</li>)}
          {message.handoffWarningCount > message.handoffWarnings.length &&
            <li>외 {message.handoffWarningCount - message.handoffWarnings.length}건</li>}
        </ul>}
        {message.asksUser && <span className="tc-status tc-ask">사용자에게 질문</span>}
        {statuses[message.status] && <span className="tc-status">{statuses[message.status]}</span>}
      </div>
    </article>)}
  </div>
  {jump && !query.trim() && <button className="tc-jump" type="button" onClick={() => {
    follow.current = true
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }}>최신 메시지 ↓</button>}
  </div>
}

function TeamChat({ rpc, watch, nav, open, draftStore, replyStore }) {
  const hint = useSyncExternalStore(nav.subscribe, nav.snapshot)
  const [selection, setSelection] = useState('')
  const [directory, setDirectory] = useState(empty)
  const [room, setRoom] = useState(null)
  const [editing, setEditing] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [, renderReply] = useState(0)
  const [draftRevision, setDraftRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [error, setError] = useState('')
  const [roomError, setRoomError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [mobileList, setMobileList] = useState(true)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [design, setDesign] = useState(false)
  const [answer, setAnswer] = useState(null)
  const [workflowNode, setWorkflowNode] = useState('')
  const [workflowRun, setWorkflowRun] = useState('')
  const [workflowTab, setWorkflowTab] = useState('edit')
  const teamId = selection || hint || directory.rooms[0]?.teamId || ''
  const current = directory.rooms.find(item => item.teamId === teamId)
  const source = directory.teams.find(item => item.teamId === teamId)
  const focusRoom = room?.teamId === teamId ? room : null
  const reply = replyStore.get(teamId)
  const workflow = useWorkflow(rpc, teamId, Boolean(focusRoom) && workflowOpen, focusRoom?.workflowVersion)
  const selectedDesign = workflow.draft.nodes.find(node => node.id === workflowNode)
  useEffect(() => {
    setDesign(false)
    setAnswer(null)
    setWorkflowNode('')
    setWorkflowRun('')
    setWorkflowTab('edit')
  }, [teamId])
  function openWorkflowMessage(message) {
    setMobileList(false)
    setWorkflowOpen(true)
    setWorkflowTab('run')
    setWorkflowRun(message.workflowRunId)
    setWorkflowNode(message.workflowNodeId)
  }
  function focusMessage(id) {
    const element = document.querySelector('[data-message-id="' + CSS.escape(id) + '"]')
    if (!element) { setError('이 메시지를 보려면 이전 메시지를 더 불러오세요.'); return }
    element.scrollIntoView({ block: 'center' })
    element.animate([{ backgroundColor: 'var(--tc-accent-soft)' }, { backgroundColor: 'transparent' }], { duration: 1600 })
  }
  function leaveDesign() {
    setDesign(false)
    setAnswer(null)
  }
  function setReply(message) {
    if (message) replyStore.set(teamId, message)
    else replyStore.delete(teamId)
    renderReply(value => value + 1)
  }

  useEffect(() => {
    setSelection(hint)
    setEditing(false)
    if (hint) setMobileList(false)
  }, [hint])

  useEffect(() => {
    let disposed = false
    let timer
    async function load() {
      try {
        const result = await rpc({ op: 'list' })
        if (!disposed) { setDirectory(result); setLoaded(true); setError('') }
      } catch (cause) { if (!disposed) setError(cause.message) }
      if (!disposed) timer = setTimeout(load, 12_000)
    }
    void load()
    return () => { disposed = true; clearTimeout(timer) }
  }, [rpc, refresh, hint])

  useEffect(() => {
    setQuery('')
    setSearchOpen(false)
  }, [teamId])

  useEffect(() => {
    if (!current) return
    const controller = new AbortController()
    const signal = controller.signal
    let wake
    let timer

    async function follow() {
      let backoff = 750
      while (!signal.aborted) {
        try {
          for await (const frame of watch(teamId, signal)) {
            if (signal.aborted) return
            setRoomError('')
            backoff = 750
            if (frame.type === 'snapshot') setRoom(previous => reconcileSnapshot(previous, frame.room))
            else setRoom(previous => previous?.teamId === teamId
              ? { ...previous, ...frame.room, messages: mergeMessages(previous.messages, frame.room.messages) } : previous)
          }
        } catch {
          if (signal.aborted) return
        }
        if (signal.aborted) return
        try {
          const result = await rpc({ op: 'view', teamId })
          if (signal.aborted) return
          setRoom(previous => reconcileSnapshot(previous, result))
          setRoomError('')
        } catch (cause) {
          if (!signal.aborted) setRoomError(cause.message)
        }
        if (signal.aborted) return
        await new Promise(resolve => { wake = resolve; timer = setTimeout(resolve, backoff) })
        backoff = Math.min(backoff * 2, 8000)
      }
    }

    setRoomError('')
    void follow()
    return () => { controller.abort(); clearTimeout(timer); wake?.() }
  }, [rpc, watch, Boolean(current), teamId])

  async function mutate(input) {
    const result = await rpc(input)
    if (input.op === 'save') setRefresh(value => value + 1)
    return result
  }

  async function earlier() {
    try {
      const before = focusRoom?.earlier
      if (!before) return
      const page = await rpc({ op: 'view', teamId, before })
      setRoom(existing => existing?.teamId === teamId && existing.earlier === before
        ? { ...existing, messages: mergeMessages(page.messages, existing.messages), earlier: page.earlier } : existing)
    } catch (cause) { setError(cause.message) }
  }

  function select(id, edit = false) {
    setSelection(id)
    setEditing(edit)
    setMobileList(false)
  }

  function action(input) {
    setError('')
    void mutate(input).catch(cause => setError(cause.message))
  }

  function retry(message) {
    if (draftStore.get(teamId)?.text.trim()) {
      setError('작성 중인 초안을 지우거나 보낸 뒤 이전 메시지를 다시 작성하세요.')
      return
    }
    let text
    try { text = retryDraft(message, focusRoom.members) }
    catch (cause) { setError(cause.message); return }
    if (!text) { setError('이 메시지의 기존 참가자를 현재 방에서 찾을 수 없습니다.'); return }
    if (text.length > 12_000) { setError('이 메시지는 현재 입력 길이 한도를 넘습니다.'); return }
    setError('')
    setReply(null)
    draftStore.set(teamId, { text, allocation: Boolean(message.allocation) })
    setDraftRevision(value => value + 1)
  }

  const canConfigure = source && (!current || editing)
  return <div className={'tc-app' + (mobileList ? ' tc-show-list' : '')
    + (focusRoom && workflowOpen ? ' tc-with-workflow' : '') + (design || answer ? ' tc-workflow-compose' : '')}>
    <aside className="tc-rooms" aria-label="대화방 목록">
      <div className="tc-list-head"><Icon /><strong>Team Chat</strong>
        <button type="button" title="목록 새로고침" aria-label="목록 새로고침" onClick={() => setRefresh(value => value + 1)}>↻</button></div>
      {directory.rooms.map(item => <button className="tc-room-link" data-current={teamId === item.teamId} key={item.teamId}
        onClick={() => select(item.teamId)}><strong>{item.title}</strong><small>{item.members.length}명</small></button>)}
      {directory.teams.filter(item => !directory.rooms.some(saved => saved.teamId === item.teamId)).map(item =>
        <button type="button" className="tc-room-link" data-current={teamId === item.teamId} key={item.teamId}
          onClick={() => select(item.teamId, true)}><Icon kind="plus" size={15} /><strong>{item.title}</strong></button>)}
      {loaded && !directory.rooms.length && !directory.teams.length && <p className="tc-list-note">DSH에서 팀 리드 세션을 열면 여기에 표시됩니다.</p>}
    </aside>
    <main className="tc-room">
      <header className="tc-room-head">
        <button type="button" className="tc-back" onClick={() => setMobileList(true)}>대화방</button>
        <div><h1>{focusRoom?.title ?? current?.title ?? source?.title ?? 'Team Chat'}</h1>
          {current && <div className="tc-members">{(focusRoom ?? current).members.map(item => <button type="button" key={item.id}
            title={item.description || 'DSH 세션 열기'} data-speaking={focusRoom?.currentMember === item.id}
            onClick={() => open(teamId, item.id)}>@{item.name}</button>)}</div>}
        </div>
        {current && <div className="tc-actions">
          {focusRoom && <button type="button" aria-expanded={workflowOpen} onClick={() => {
            if (workflowOpen) leaveDesign()
            else setMobileList(false)
            setWorkflowOpen(!workflowOpen)
          }}>워크플로우</button>}
          {focusRoom && <button type="button" aria-expanded={searchOpen} onClick={() => {
            setSearchOpen(value => !value)
            setQuery('')
          }}>기록 검색</button>}
          {focusRoom && (focusRoom.active || focusRoom.queued || focusRoom.awaiting || focusRoom.workflowCanStop || focusRoom.stoppingRoom)
            ? <button type="button" className="tc-wf-danger" disabled={focusRoom.stoppingRoom}
              onClick={() => action({ op: 'stop', teamId, mode: 'all' })}>방 전체 중지</button> : null}
          {source && <button type="button" disabled={focusRoom?.active} onClick={() => setEditing(value => !value)}>방 설정</button>}
          <button type="button" onClick={() => open(teamId, teamId)} title="DSH 팀 리드 세션 열기"><Icon kind="open" size={16} /> 팀 세션</button>
        </div>}
      </header>
      {(roomError || error) && <div className="tc-error tc-banner" role="alert">{roomError || error}</div>}
      {canConfigure ? <RoomSettings key={teamId} source={source} current={focusRoom ?? current}
        onCancel={() => { setEditing(false); setMobileList(true) }}
        onSubmit={async input => {
          const saved = await mutate(input)
          setDirectory(value => ({ ...value, rooms: [saved, ...value.rooms.filter(item => item.teamId !== saved.teamId)] }))
          select(saved.teamId)
        }} />
        : focusRoom ? <>
          <RoomActivity room={focusRoom} open={open}
            onAnswer={() => {
              const { messageId, memberId } = focusRoom.awaiting
              const message = focusRoom.messages.find(item => item.id === messageId)
              setReply(message ?? { id: messageId, memberId, text: '', author: focusRoom.members.find(item => item.id === memberId)?.name ?? '팀원' })
            }}
            onResume={() => action({ op: 'resume', teamId, questionId: focusRoom.awaiting.messageId })} />
          {searchOpen && <div className="tc-search"><input type="search" aria-label="불러온 기록 검색" autoFocus
            value={query} placeholder="팀원 이름 또는 메시지" onChange={event => setQuery(event.target.value)} /></div>}
          <Timeline key={teamId} room={focusRoom} messages={focusRoom.messages} query={query}
            open={open} onReply={setReply} onRetry={retry} onEarlier={earlier} onWorkflow={openWorkflowMessage}
            command={input => rpc({ op: 'workflow', teamId, input })}
            ask={value => { setDesign(false); setAnswer(value) }} />
          {(design || answer) ? <WorkflowChat key={answer?.question.id ?? 'design'} workflow={workflow}
            selected={selectedDesign} answer={answer} onClose={leaveDesign} onAnswer={leaveDesign} /> :
          <Composer key={teamId + ':' + draftRevision} room={focusRoom} draftStore={draftStore} reply={reply}
            onClearReply={() => setReply(null)} onSend={mutate}
            onStop={mode => action({ op: 'stop', teamId, mode,
              ...(focusRoom.activeId ? { activeId: focusRoom.activeId, runId: focusRoom.activeRunId } : {}) })} />}
        </> : <div className="tc-empty"><Icon size={30} /><h2>{loaded ? '팀 대화방을 선택하세요' : '불러오는 중'}</h2>
          {loaded && <p>{directory.available ? '기존 팀의 리드 세션을 연 뒤 목록에서 대화방을 만들 수 있습니다.'
            : '플러그인에서 Agent Teams를 활성화하세요.'}</p>}</div>}
    </main>
    {focusRoom && workflowOpen && <WorkflowPanel key={teamId} workflow={workflow} selected={workflowNode}
      onSelect={setWorkflowNode} runId={workflowRun} onRun={setWorkflowRun} tab={workflowTab} setTab={setWorkflowTab}
      onDesign={() => { setAnswer(null); setDesign(true); setWorkflowTab('edit') }}
      ask={value => { setDesign(false); setAnswer(value) }}
      onClose={() => { setWorkflowOpen(false); leaveDesign() }} openAgent={agent => open(teamId, agent)} openMessage={focusMessage} />}
  </div>
}

export async function apply(ctx) {
  const dispose = await ctx.remote.$mount({ package: packageName, descriptors })
  ctx.effect(() => dispose, 'team-chat Remote contribution')
  ctx.inject(['remote.teamChat'], register)
}

function register(ctx) {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.teamChat = ''
    style.textContent = styles + workflowStyles
    document.head.appendChild(style)
    return () => style.remove()
  }, 'team-chat CSS')

  const draftStore = new Map()
  const replyStore = new Map()
  let requested = ''
  const subscribers = new Set()
  const nav = {
    snapshot: () => requested,
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback) },
    select(id) {
      requested = id
      for (const notify of subscribers) notify()
      ctx.layout.selectPanel(PANEL)
    },
  }
  const rpc = async input => {
    const result = await ctx.remote.teamChat.request(input)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const watch = (teamId, signal) => ctx.remote.teamChat.watch(teamId, signal)
  const open = (parentSessionId, childSessionId) => {
    ctx.uiWorkspace.openSession(parentSessionId === childSessionId ? parentSessionId
      : { parentSessionId, childSessionId, mode: 'continuable' })
  }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL },
    () => <TeamChat rpc={rpc} watch={watch} nav={nav} open={open} draftStore={draftStore} replyStore={replyStore} />))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 12, label: 'Team Chat' },
    () => <Icon />))
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: PANEL, order: 10,
  }, ({ sessionId, useSession, useSessions }) => {
    const lead = useSession(snapshot => snapshot.subagent?.address.parentSessionId) ?? sessionId
    const team = useSessions(state => state.projectionsBySession[lead]?.values.agentTeam)
    if (!lead || !team?.members?.some(member => member.role === 'teammate' && member.phase === 'active')) return null
    return <button className="tc-native-button" type="button" title="이 팀의 대화방 열기" aria-label="이 팀의 대화방 열기"
      onClick={() => nav.select(lead)}><Icon size={17} /></button>
  }))
}
