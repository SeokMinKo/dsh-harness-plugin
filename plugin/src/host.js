import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { Service } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { queueHostSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal'
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { archiveSchema, descriptors, member, namespace, packageName, requestSchema, roomSchema } from './protocol.js'
import { handoffIdsFor, parseHandoff, roomPrompt } from './routing.js'
import { acceptSend, isPending as pending, nextQueued, recoverInterrupted, resumeQuestion, roomSummary, selectStop, toolEnabledFor } from './room-state.js'
import { createPlan, resultStatus, settleStep } from './plan.js'
import { RoomUpdates } from './updates.js'
import { RoomHistory } from './history.js'
import { Workflows } from './workflow.js'
import { createDshAdapter } from './dsh-adapter.js'
import { requestsAllocation } from './allocation-routing.js'
import { claimRoomTurn, discardRoomInput, isolateRoomStep, nativeAttention, observeNativeAttention, observeRoomStream, observeRoomTurn, roomInputId, stopRoomTurn } from './turn.js'

const domainSpec = defineDomain({
  name: 'team_chat', version: 4, compatibleVersions: [1, 2, 3], layout: 'per-record',
  tables: { rooms: domainTable(roomSchema), chunks: domainTable(archiveSchema) },
})
const workflowDomain = defineDomain({
  name: 'team_chat_workflow', version: 1, layout: 'per-record', tables: { workflows: domainTable(z.json()) },
})
const coordinatingTools = new Set([
  'send_message', 'spawn_teammate', 'wait_agent', 'interrupt_agent', 'subagent', 'workflow',
  'team_task_create', 'team_task_update', 'schedule_create', 'schedule_edit', 'create_goal', 'update_goal', 'job_kill',
])
const reservedNames = new Set(['all', 'everyone', 'user'])
const describeError = error => String(error?.message ?? error).slice(0, 800)

function cleanMember(row) {
  return member.parse({ id: row.id, name: row.name, role: row.role, description: (row.description ?? '').slice(0, 500) })
}

function teamTitle(agent) {
  const event = agent.session.snapshotEvents().findLast(event => event.type === 'session/title')
  return (event?.data.title?.trim() || 'Agent Team · ' + agent.id.slice(0, 8)).slice(0, 100)
}

function publicLiveText(run) {
  const value = run.live || run.text
  const boundary = value.lastIndexOf('\n') + 1
  const lastLine = value.slice(boundary).toLowerCase()
  const tag = '[[team-chat:'
  return (lastLine.startsWith(tag) || (lastLine.startsWith('[[') && tag.startsWith(lastLine))
    ? value.slice(0, boundary) : value).trimEnd()
}

export default class TeamChat extends TypertRemoteService {
  static inject = ['typert', 'storageDomain', 'agents', 'subagents', 'tools']

  constructor(ctx) {
    super(ctx, namespace)
    this.host = ctx
    this.pumps = new Map()
    this.turns = new Map()
    this.memberClaims = new Map()
    this.creating = new Map()
    this.stops = new Map()
    this.updates = new RoomUpdates()
    this.lifetime = new AbortController()
    this.closing = false
  }

  async [Service.init]() {
    const ctx = this.host
    const domain = await ctx.storageDomain.open(domainSpec)
    this.rooms = new RoomHistory(domain.table('rooms'), domain.table('chunks'))
    const workflowStorage = await ctx.storageDomain.open(workflowDomain)
    const adapter = createDshAdapter(this)
    this.workflow = new Workflows(adapter, workflowStorage.table('workflows'), {
      legacyHarnessId: adapter.id,
      members: team => this.getRoom(team).members,
      requestText: (team, id) => this.rooms.find(team, id)?.text,
      stopping: team => this.stops.has(team),
      stopConversation: team => this.clearStoppedRoom(team),
      publish: (team, ids) => {
        const positions = ids.map(id => this.rooms.position(team, id)).filter(position => position !== undefined)
        this.updates.publish(team, positions)
      },
      annotate: (team, id, result) => this.change(team, room => {
        const message = room.messages.find(item => item.id === id)
        if (!message) return
        if (result.status === 'question') message.asksUser = true
        else Object.assign(message, { status: result.status === 'suspended' ? 'stopped' : result.status, error: result.summary })
      }),
      logger: ctx.logger,
    })
    await this.workflow.initialize()
    ctx.effect(() => async () => {
      this.closing = true
      this.lifetime.abort()
      for (const pump of this.pumps.values()) pump.controller.abort()
      await this.workflow.close()
      await Promise.allSettled([...this.pumps.values()].map(pump => pump.task).concat([...this.stops.values()]))
      await workflowStorage.close()
      await domain.close()
    }, 'team-chat storage and workers')

    for (const [key, room] of this.rooms.entries()) {
      if (room.continuation || room.messages.some(pending)) await this.change(key, recoverInterrupted)
    }
    ctx.on('session/event', (session, event) => {
      observeRoomTurn(this.turns.get(session.id), session, event)
      if (event.type === 'team/task' && this.rooms.get(session.id)) this.workflow.signal(session.id)
    }, { global: true })
    ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
      const run = this.turns.get(agent.id)
      const previous = run?.claimed
      claimRoomTurn(run, message, turn)
      if (run?.claimed !== previous) this.publishTurn(run)
    }, { global: true })
    ctx.on('agent/inbox/discarded', ({ agent, message }) => {
      discardRoomInput(this.turns.get(agent.id), message)
    }, { global: true })
    ctx.on('agent/pre-step', (step, next) => isolateRoomStep(this.turns.get(step.agent.id), step, next),
      { global: true, prepend: true })
    ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      const run = this.turns.get(agent.id)
      const previous = run?.live
      observeRoomStream(run, frame)
      if (run?.live !== previous && run.position !== undefined) this.updates.live(run.teamId, run.position)
    }, { global: true })
    ctx.on('agent/disposed', ({ agent }) => {
      const run = this.turns.get(agent.id)
      if (run && !run.finished) {
        run.finished = true
        run.done.resolve({ kind: 'interrupted' })
      }
    }, { global: true })

    ctx.on('approval/request', (request, next) => {
      const run = this.turns.get(request.agent.id)
      return observeNativeAttention(run, { kind: 'approval', toolName: String(request.toolName).slice(0, 120) }, next,
        () => this.publishTurn(run))
    }, { global: true, prepend: true })
    ctx.on('user-questions/request', (request, next) => {
      const run = request.agent && this.turns.get(request.agent.id)
      return observeNativeAttention(run, { kind: 'question' }, next, () => this.publishTurn(run))
    }, { global: true, prepend: true })

    const deny = exec => {
      const run = this.turns.get(exec.agent.id)
      if (!run || run.claimed === undefined || run.finished) return
      if (run.signal.aborted) return 'The room turn has been stopped.'
      if (!run.tools) return 'This room turn is text only. Reply without tools.'
      if (coordinatingTools.has(exec.name)) {
        return 'Use the Team Chat workflow to keep task changes and handoffs in the room.'
      }
    }
    ctx.on('tools/pre-execute', async (exec, next) => {
      const reason = deny(exec)
      return reason ? { kind: 'deny', reason } : next()
    }, { global: true, prepend: true })
    ctx.effect(() => ctx.tools.guard(deny), 'Team Chat scoped tool guard')
    ctx.typert.register({
      package: packageName, face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] }, invocations: descriptors,
    })
    this.workflow.start()
  }

  publishTurn(run) {
    if (run.workflow) {
      const id = run.workflow.workflowRunId
      this.workflow.signal(run.teamId, this.workflow.record(run.teamId).allocations?.[id] ? [id] : [])
    }
    else this.updates.publish(run.teamId)
  }

  requireOwner() {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') {
      throw new RemoteError('gateway/forbidden', '이 대화방은 DSH 소유자만 열 수 있습니다.', {})
    }
    if (this.closing) throw new Error('Team Chat을 종료하는 중입니다.')
  }

  async request(input) {
    this.requireOwner()
    const request = requestSchema.parse(input)
    switch (request.op) {
      case 'list': return this.list()
      case 'view': return this.view(request.teamId, request.before)
      case 'save': return this.save(request)
      case 'send': return this.send(request)
      case 'stop': return this.stop(request)
      case 'resume': return this.resume(request)
      case 'workflow': this.getRoom(request.teamId); return this.workflow.request(request.teamId, request.input)
    }
  }

  async *watch(teamId, signal) {
    this.requireOwner()
    this.getRoom(teamId)
    yield* this.updates.watch(teamId, AbortSignal.any([signal, this.lifetime.signal]),
      () => ({ type: 'snapshot', room: this.view(teamId) }),
      positions => {
        const room = this.getRoom(teamId)
        const run = this.pumps.get(teamId)?.turn
        const messages = positions.flatMap(position => {
          const message = this.rooms.at(teamId, position)
          return message ? [this.publicMessage(teamId, message, position, run)] : []
        })
        return { type: 'patch', room: { ...this.roomStatus(room), messages } }
      })
  }

  teamService() {
    const service = this.host.get('agentTeams')
    if (!service) throw new Error('DSH의 Agent Teams 플러그인을 먼저 활성화하세요.')
    return service
  }

  roster(agent) {
    const teams = this.teamService()
    if (teams.tryMembership(agent)?.role !== 'lead') return []
    return teams.listMembers(agent)
      .filter(row => ['running', 'inactive'].includes(row.status) && !reservedNames.has(row.name.toLowerCase()))
      .map(cleanMember)
  }

  list() {
    const teams = []
    if (this.host.get('agentTeams')) {
      for (const agent of this.host.agents.list()) {
        const members = this.roster(agent)
        if (members.length >= 2) teams.push({ teamId: agent.id, title: teamTitle(agent), members })
      }
    }
    return {
      available: Boolean(this.host.get('agentTeams')),
      rooms: [...this.rooms.entries()].map(([, room]) => roomSummary(room)).sort((a, b) => b.updated - a.updated),
      teams,
    }
  }

  getRoom(teamId) {
    const room = this.rooms.get(teamId)
    if (!room) throw new Error('대화방을 찾을 수 없습니다.')
    return room
  }

  view(teamId, before) {
    const room = this.getRoom(teamId)
    const { start, rows } = this.rooms.page(teamId, before, 24)
    const run = this.pumps.get(teamId)?.turn
    const page = rows.map((message, offset) => this.publicMessage(teamId, message, start + offset, run))
    return { ...this.roomStatus(room), messages: page, earlier: start > 0 ? page[0].id : null }
  }

  publicMessage(teamId, message, position, run) {
    const assignment = message.allocation && this.workflow.allocationView(teamId, message.id)
    return { ...message, position, ...(assignment ? { assignment } : {}),
      ...(() => {
        const active = run?.id === message.id ? run : this.turns.get(message.memberId)
        return message.status === 'running' && message.id === active?.id ? { text: publicLiveText(active) } : {}
      })(),
    }
  }

  roomStatus(room) {
    const pump = this.pumps.get(room.teamId)
    const run = pump?.turn
    const attention = nativeAttention(run)
    const queued = room.messages.filter(message => message.status === 'queued')
    if (room.priorityId) {
      const priority = queued.findIndex(message => message.id === room.priorityId)
      if (priority > 0) queued.unshift(...queued.splice(priority, 1))
    }
    return {
      ...roomSummary(room),
      workflowVersion: this.workflow.versions.get(room.teamId) ?? 0,
      workflowCanStop: this.workflow.canStopRoom(room.teamId) || Boolean(this.workflow.record(room.teamId).stopPending),
      stoppingRoom: this.stops.has(room.teamId),
      active: Boolean(pump),
      activeId: pump?.id ?? null,
      activeRunId: pump?.runId ?? null,
      queued: queued.length,
      queuedPreview: queued.slice(0, 4)
        .map(message => ({ id: message.id, text: message.text.slice(0, 88) })),
      currentMember: run?.memberId ?? null,
      activity: run ? { memberId: run.memberId, kind: run.signal.aborted ? 'stopping' : attention?.kind
        ?? (run.claimed === undefined ? 'native-queue' : 'running'), ...(attention?.toolName ? { toolName: attention.toolName } : {}) } : null,
    }
  }

  async change(teamId, mutate) {
    const result = await this.rooms.update(teamId, mutate)
    if (result.changed) this.updates.publish(teamId, result.positions)
  }

  async resolveLead(teamId) {
    const agent = this.host.agents.get(teamId)
      ?? await this.host.typert.lookups.get('agent')?.resolve(teamId)
    if (!agent) throw new Error('DSH에서 기존 팀의 리드 세션을 먼저 여세요.')
    return agent
  }

  async save({ teamId, title, members: ids, rounds }) {
    const roster = this.roster(await this.resolveLead(teamId))
    const members = ids.map(id => roster.find(row => row.id === id))
    if (new Set(ids).size !== ids.length || members.some(row => !row)) {
      throw new Error('현재 팀에 있는 팀원 2~6명을 선택하세요.')
    }
    // Reserve creation synchronously so a racing first save cannot replace history.
    if (this.creating.has(teamId)) await this.creating.get(teamId)
    if (this.rooms.get(teamId)) {
      await this.change(teamId, room => {
        if (room.messages.some(pending)) throw new Error('진행 중인 대화가 끝나면 팀원을 편집할 수 있습니다.')
        if (room.awaiting && !ids.includes(room.awaiting.memberId)) {
          throw new Error('질문에 답하거나 대기열을 재개한 뒤 질문한 팀원을 제거할 수 있습니다.')
        }
        Object.assign(room, { title, members, rounds })
      })
    } else {
      const writing = this.rooms.put(teamId, { teamId, title, members, rounds, messages: [] })
      this.creating.set(teamId, writing)
      try { await writing } finally { this.creating.delete(teamId) }
    }
    return roomSummary(this.getRoom(teamId))
  }

  async send(request) {
    this.workflow.requireRoomOpen(request.teamId)
    const allocation = request.allocation ?? requestsAllocation(request.text, request.replyTo)
    await this.change(request.teamId, room => {
      this.workflow.requireRoomOpen(request.teamId)
      acceptSend(room, { ...request, allocation }, Date.now(), id => this.rooms.find(request.teamId, id))
    })
    this.pump(request.teamId)
    return { accepted: true }
  }

  async stop(request) {
    const { teamId } = request
    const active = this.pumps.get(teamId)
    if ((request.activeId && request.activeId !== active?.id) || (request.runId && request.runId !== active?.runId)) {
      return { stopped: false }
    }
    if (request.mode === 'current') {
      if (!active) return { stopped: false }
      active.controller.abort()
      this.updates.publish(teamId)
      return { stopped: true }
    }
    const pendingStop = this.stops.get(teamId)
    if (pendingStop) return pendingStop
    const stop = Promise.resolve().then(async () => {
      await this.workflow.stopRoom(teamId)
      await this.clearStoppedRoom(teamId)
      await this.workflow.finishRoomStop(teamId)
      return { stopped: true }
    }).finally(() => {
      this.stops.delete(teamId)
      this.updates.publish(teamId)
      if (!this.workflow.record(teamId).stopPending) this.pump(teamId)
      this.workflow.kick(teamId)
    })
    this.stops.set(teamId, stop)
    this.updates.publish(teamId)
    active?.controller.abort()
    return stop
  }

  async clearStoppedRoom(teamId) {
    await this.change(teamId, room => selectStop(room, { mode: 'all' }))
  }

  async resume({ teamId, questionId }) {
    this.workflow.requireRoomOpen(teamId)
    let resumed = false
    await this.change(teamId, room => { resumed = resumeQuestion(room, questionId) })
    if (resumed) this.pump(teamId)
    return { resumed }
  }

  pump(teamId) {
    if (this.closing || this.pumps.has(teamId) || this.workflow.roomStopping(teamId)) return
    const next = nextQueued(this.getRoom(teamId))
    if (!next) return
    const work = { id: next.id, runId: randomUUID(), controller: new AbortController(), answerId: null, turn: null, task: null }
    this.pumps.set(teamId, work)
    let failed = false
    work.task = this.runQueued(teamId, work, next).catch(error => {
      failed = true
      this.host.logger.error('Team Chat room queue failed: %s', describeError(error))
    }).finally(() => {
      this.pumps.delete(teamId)
      this.updates.publish(teamId)
      if (!failed && !this.closing) this.pump(teamId)
    })
  }

  async runQueued(teamId, work, next) {
    const signal = work.controller.signal
    let admitted = false
    await this.change(teamId, room => {
      const message = room.messages.find(message => message.id === next.id)
      if (message.status !== 'queued') return
      if (signal.aborted) {
        const status = this.closing ? 'interrupted' : 'stopped'
        this.finishRun(room, work, status)
        return
      }
      if (room.priorityId === next.id) delete room.priorityId
      message.status = 'running'
      if (room.continuation?.rootId === next.id && room.continuation.answerId) {
        work.answerId = room.continuation.answerId
        room.messages.find(item => item.id === work.answerId).status = 'running'
      }
      admitted = true
    })
    if (!admitted) return
    let status = 'failed'
    try {
      status = next.allocation ? await this.workflow.prepareAllocation(teamId, next, work)
        : await this.runPlan(teamId, work, next)
    } catch (error) {
      if (!signal.aborted) {
        const room = this.getRoom(teamId)
        const target = this.planTarget(room, next.recipients[0])
        await this.addFailure(teamId, target, work.answerId ?? next.id, describeError(error))
      }
    } finally {
      if (signal.aborted) status = this.closing ? 'interrupted' : 'stopped'
      if (status !== 'waiting') await this.change(teamId, room => this.finishRun(room, work, status))
    }
  }

  finishRun(room, work, status) {
    room.messages.find(message => message.id === work.id).status = status
    const checkpoint = room.continuation?.rootId === work.id ? room.continuation : undefined
    const answerId = checkpoint?.answerId ?? work.answerId
    const answer = answerId && room.messages.find(message => message.id === answerId)
    if (answer && pending(answer)) answer.status = status === 'complete' || status === 'partial' ? 'failed' : status
    if (checkpoint) {
      if (room.awaiting?.messageId === checkpoint.question.messageId) delete room.awaiting
      if (room.priorityId === work.id) delete room.priorityId
      delete room.continuation
    }
  }

  planTarget(room, id) {
    return room.members.find(member => member.id === id) ?? { id, name: id.slice(0, 64) }
  }

  addFailure(teamId, target, replyTo, error, settle) {
    return this.change(teamId, room => {
      const response = {
        id: randomUUID(), kind: 'bot', memberId: target.id, author: target.name, text: '', time: Date.now(),
        replyTo, status: 'failed', error,
      }
      room.messages.push(response)
      settle?.(room, response, [])
    })
  }

  async runPlan(teamId, work, message) {
    const lead = await this.resolveLead(teamId)
    const plan = createPlan(message, this.getRoom(teamId).continuation)
    if (plan.answerId && !work.controller.signal.aborted) {
      const answer = this.rooms.find(teamId, plan.answerId)
      const held = await this.runPlanStep(lead, teamId, work, plan, answer,
        { id: answer.recipients[0], round: 1, replyTo: answer.id }, true)
      if (held) return 'waiting'
    }
    while (plan.cursor < plan.steps.length && !work.controller.signal.aborted) {
      const held = await this.runPlanStep(lead, teamId, work, plan, message, plan.steps[plan.cursor], false)
      if (held) return 'waiting'
    }
    return resultStatus(plan)
  }

  async runPlanStep(lead, teamId, work, plan, message, item, answer) {
    let held = false
    const settle = (room, response, names) => {
      if (!work.controller.signal.aborted) held = settleStep(room, plan, response, names, answer)
    }
    const room = this.getRoom(teamId)
    const target = this.planTarget(room, item.id)
    const trigger = this.rooms.find(teamId, item.replyTo)
    if (!this.roster(lead).some(member => member.id === target.id)) {
      await this.addFailure(teamId, target, item.replyTo, '이 팀원을 현재 DSH 팀에서 찾을 수 없습니다.', settle)
      return held
    }
    const tools = toolEnabledFor(message, item)
    const history = room.messages.filter(message => (!pending(message) || message.id === trigger.id) && message.text)
    const handoffs = handoffIdsFor(item).flatMap(id => {
      const message = this.rooms.find(teamId, id)
      return message ? [message] : []
    })
    const prompt = roomPrompt(target, room.members, history, trigger, { round: item.round, rounds: room.rounds, tools, handoffs })
    await this.runMember(lead, teamId, work, target, trigger.id, prompt, tools, settle)
    return held
  }

  async runMember(lead, teamId, work, target, replyTo, prompt, tools, settle, options = {}) {
    const signal = AbortSignal.any([work.controller.signal, AbortSignal.timeout(work.timeoutMs ?? 300_000)])
    while (this.memberClaims.has(target.id)) {
      const claim = this.memberClaims.get(target.id)
      signal.throwIfAborted()
      let cancel
      try {
        await Promise.race([claim.promise, new Promise((_, reject) => {
          cancel = () => reject(signal.reason)
          signal.addEventListener('abort', cancel, { once: true })
        })])
      } finally { signal.removeEventListener('abort', cancel) }
    }
    signal.throwIfAborted()
    const claim = Promise.withResolvers()
    this.memberClaims.set(target.id, claim)
    work.drained = claim.promise
    work.cancelledNativeTurn = false
    const release = () => {
      if (this.memberClaims.get(target.id) !== claim) return
      this.memberClaims.delete(target.id)
      claim.resolve()
      if (!this.closing) for (const [team] of this.workflow.table.entries()) this.workflow.kick(team)
    }
    try {
      return await this.executeMember(lead, teamId, work, target, replyTo, prompt, tools, settle, options, signal)
    } finally {
      const draining = this.turns.get(target.id)
      if (work.cancelledNativeTurn || draining?.claimed !== undefined && !draining.finished) {
        const agent = this.host.agents.get(target.id)
        void (agent?.whenIdle() ?? Promise.resolve()).finally(() => {
          if (this.turns.get(target.id) === draining) this.turns.delete(target.id)
          release()
        }).catch(() => undefined)
      } else release()
    }
  }

  async executeMember(lead, teamId, work, target, replyTo, prompt, tools, settle, options, signal) {
    const id = options.turnId ?? randomUUID()
    const run = {
      id, teamId, memberId: target.id, text: '', live: '', done: Promise.withResolvers(),
      signal, tools, workflow: options.workflow,
    }
    if (!options.silent) await this.change(teamId, room => {
      run.position = (room.base ?? 0) + room.messages.length
      room.messages.push({
        id, kind: 'bot', memberId: target.id, author: target.name, text: '',
        time: Date.now(), ...(replyTo ? { replyTo } : {}), status: 'running', ...(options.workflow ?? {}),
      })
    })
    work.turn = run
    this.updates.publish(teamId)
    const abort = () => {
      if (run.claimed !== undefined && !run.finished) work.cancelledNativeTurn = true
      stopRoomTurn(run, this.host.agents.get(target.id))
      run.done.resolve({ kind: 'aborted' })
    }
    this.turns.set(target.id, run)
    signal.addEventListener('abort', abort, { once: true })
    let status = 'complete'
    let error
    try {
      signal.throwIfAborted()
      const content = [{ type: 'text', text: prompt }]
      const source = { kind: 'user', rpcId: roomInputId(run) }
      if (target.id === lead.id) lead.followup(createUserMessage({ content, source }))
      else await queueHostSubagentPrompt(this.host.subagents, lead, target.id, content, source, signal)
      if (signal.aborted) abort()
      const reason = await run.done.promise
      if (signal.aborted || reason.kind === 'aborted') {
        status = this.closing ? 'interrupted' : work.controller.signal.aborted ? 'stopped' : 'failed'
        if (status === 'failed') error = signal.aborted ? '응답 대기 시간 5분을 초과했습니다.' : 'DSH 세션에서 실행을 중단했습니다.'
      } else if (reason.kind !== 'completed') {
        status = 'failed'
        error = reason.kind === 'max-tokens' ? '출력 토큰 한도에서 응답이 잘렸습니다.'
          : describeError(reason.error ?? ('DSH 실행 상태 · ' + reason.kind))
      }
    } catch (cause) {
      status = this.closing ? 'interrupted' : work.controller.signal.aborted ? 'stopped' : 'failed'
      if (status === 'failed') error = describeError(cause)
    } finally {
      signal.removeEventListener('abort', abort)
      if (run.claimed === undefined || run.finished) this.turns.delete(target.id)
      work.turn = null
    }
    if (status === 'complete' && !run.finalReply?.text) {
      status = 'failed'
      error = 'DSH 원본 세션에서 최종 텍스트 응답을 확인할 수 없습니다.'
    }
    const names = status === 'complete' ? run.finalReply.names : []
    const text = status === 'complete' ? run.finalReply.text : parseHandoff(run.text || run.live).text
    if (!options.silent) await this.change(teamId, room => {
      const message = room.messages.find(message => message.id === id)
      let display = text
      if (options.workflow && status === 'complete') {
        try {
          const { summary, question, status: resultStatus } = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/gi, ''))
          if (resultStatus === 'checkpoint') display = '작업 체크포인트 저장'
          else if (typeof (summary ?? question) === 'string') display = summary ?? question
        } catch {}
      }
      Object.assign(message, { text: display, status, ...(error ? { error } : {}),
        ...(run.finalReply?.truncated ? { truncated: true } : {}) })
      settle?.(room, message, names)
    })
    return { id, status, text, error, truncated: run.finalReply?.truncated }
  }
}
