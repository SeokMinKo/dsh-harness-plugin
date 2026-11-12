import { HARNESS_INTERFACE_VERSION } from './harness-adapter.js'
import { createWorkspaceFiles } from './workflow-files.js'
import { nativeAttention } from './turn.js'

/** Map Cordis, native Agent sessions, and the DSH Team task board to the scheduler contract. */
export function createDshAdapter(chat) {
  return {
    id: 'deepseek-harness',
    version: HARNESS_INTERFACE_VERSION,
    capabilities: { isolatedTurns: true, scopedCancellation: true, tools: 'native-approval' },
    async team(teamId) {
      const lead = await chat.resolveLead(teamId)
      return { id: teamId, leadId: lead.id, members: chat.roster(lead), workspace: lead.session.header.cwd ?? null }
    },
    busy: agentId => chat.memberClaims.has(agentId),
    async taskBoard(teamId) {
      const lead = await chat.resolveLead(teamId)
      const board = chat.teamService()
      return {
        list: () => board.listTasks(lead),
        get: id => board.getTask(lead, id),
        create: input => board.createTask(lead, input),
        update: input => board.updateTask(lead, input),
      }
    },
    files: createWorkspaceFiles(() => chat.host.get('fs'), chat.lifetime.signal),
    startTurn(teamId, request) {
      if (!['text-only', 'native-approval'].includes(request.policy)) throw new Error('잘못된 턴 정책입니다.')
      const work = { controller: { signal: request.signal }, timeoutMs: request.timeoutMs }
      const result = (async () => {
        request.signal.throwIfAborted()
        const lead = await chat.resolveLead(teamId)
        const target = chat.roster(lead).find(member => member.id === request.agentId)
        if (!target) throw new Error('담당 Agent가 현재 팀에 없습니다.')
        return chat.runMember(lead, teamId, work, target, request.replyTo, request.text,
          request.policy === 'native-approval', undefined, {
            silent: request.silent, turnId: request.turnId,
            ...(request.task ? { workflow: { workflowRunId: request.task.runId, workflowNodeId: request.task.nodeId } } : {}),
          })
      })()
      return {
        result,
        activity() {
          if (!work.turn) return null
          const attention = nativeAttention(work.turn)
          return attention ? { phase: attention.kind, ...attention }
            : { phase: work.turn.claimed === undefined ? 'queued' : 'running' }
        },
        drained: () => work.drained ?? Promise.resolve(),
      }
    },
  }
}
