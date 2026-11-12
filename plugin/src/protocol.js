import { z } from 'zod'
import { workflowRequest } from './workflow-model.js'

export const packageName = 'dsh-team-chat'
export const namespace = 'teamChat'
export const roomId = z.string().min(1).max(128)
export const member = z.object({
  id: roomId, name: z.string().min(1).max(64), role: z.enum(['lead', 'teammate']),
  description: z.string().max(500),
})
const id = z.uuid()
const text = z.string().max(12_000)
const mode = z.number().int().min(1).max(3)
const roomSettings = {
  teamId: roomId,
  title: z.string().trim().min(1).max(100),
  members: z.array(roomId).min(2).max(6),
  rounds: mode,
}
export const requestSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('list') }),
  z.strictObject({ op: z.literal('view'), teamId: roomId, before: id.optional() }),
  z.strictObject({ op: z.literal('save'), ...roomSettings }),
  z.strictObject({
    op: z.literal('send'), teamId: roomId, id, text: text.trim().min(1),
    replyTo: id.optional(), tools: z.boolean(), allocation: z.boolean().optional(),
  }),
  z.strictObject({ op: z.literal('resume'), teamId: roomId, questionId: id }),
  z.strictObject({ op: z.literal('workflow'), teamId: roomId, input: workflowRequest }),
  z.strictObject({
    op: z.literal('stop'), teamId: roomId, mode: z.enum(['current', 'all']).optional(), activeId: id.optional(), runId: id.optional(),
  }),
])

const baseMessage = {
  id, author: z.string().max(64), text, time: z.number(), replyTo: id.optional(),
}
const user = z.object({
  ...baseMessage, kind: z.literal('user'), tools: z.boolean(), allocation: z.literal(true).optional(), recipients: z.array(roomId),
  status: z.enum(['queued', 'running', 'waiting', 'complete', 'partial', 'stopped', 'interrupted', 'failed']),
})
const bot = z.object({
  ...baseMessage, kind: z.literal('bot'), memberId: roomId,
  status: z.enum(['running', 'complete', 'stopped', 'interrupted', 'failed']),
  workflowRunId: id.optional(), workflowNodeId: z.string().max(64).optional(),
  error: z.string().max(800).optional(), asksUser: z.boolean().optional(), truncated: z.boolean().optional(),
  handoffWarnings: z.array(z.object({
    name: z.string().max(64), reason: z.enum(['unknown', 'self', 'broadcast', 'round-limit', 'budget']),
  })).max(8).optional(),
  handoffWarningCount: z.number().int().positive().optional(),
})
const messageSchema = z.discriminatedUnion('kind', [user, bot])
export const archiveSchema = z.array(messageSchema).length(64)
const step = z.object({
  id: roomId, round: mode, replyTo: id, messageId: id.optional(), handoffFrom: id.optional(), handoffIds: z.array(id).max(12).optional(),
})
const continuation = z.object({
  rootId: id, steps: z.array(step).min(1).max(12), cursor: z.number().int().min(1).max(12),
  passed: z.number().int().min(0).max(12), failed: z.number().int().min(0).max(12), skipped: z.number().int().nonnegative().optional(),
  question: z.object({ messageId: id, memberId: roomId, step: z.number().int().min(0).max(11) }),
  answerId: id.optional(),
})
export const roomSchema = z.object({
  teamId: roomId, title: roomSettings.title, members: z.array(member).min(2).max(6),
  rounds: mode, continuation: continuation.optional(), awaiting: z.object({ messageId: id, memberId: roomId }).optional(), priorityId: id.optional(), base: z.number().int().nonnegative().multipleOf(64).optional(), messages: z.array(messageSchema),
})

function codec(name, schema) {
  return { mode: 'strict', typeSymbol: packageName + '#' + name, create: () => schema }
}

const jsonCodec = codec('Json', z.json())
export const descriptors = [{
  id: packageName + '#teamChat/request',
  service: namespace, namespace, method: 'request',
  invocation: { kind: 'direct' },
  parameters: [{ name: 'input', wire: 'input', source: 'json', codec: codec('Request', requestSchema) }],
  result: jsonCodec,
}, {
  id: packageName + '#teamChat/watch',
  service: namespace, namespace, method: 'watch', mode: 'stream',
  invocation: { kind: 'direct' },
  parameters: [{ name: 'teamId', wire: 'teamId', source: 'json', codec: codec('TeamId', roomId) }],
  cancellation: { parameter: 'signal' },
  result: jsonCodec,
}]
