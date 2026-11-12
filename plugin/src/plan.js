import { extendPlan, handoffIdsFor } from './routing.js'

export function createPlan(message, checkpoint) {
  if (checkpoint?.rootId === message.id) return structuredClone(checkpoint)
  return {
    rootId: message.id, cursor: 0, passed: 0, failed: 0, skipped: 0,
    steps: message.recipients.map(id => ({ id, round: 1, replyTo: message.id })),
  }
}

function hold(room, plan, question) {
  delete plan.answerId
  plan.question = question
  room.continuation = structuredClone(plan)
  room.awaiting = { messageId: question.messageId, memberId: question.memberId }
  room.messages.find(message => message.id === plan.rootId).status = 'waiting'
  return true
}

export function settleStep(room, plan, response, names, answer = false) {
  const index = answer ? plan.question.step : plan.cursor++
  const previousQuestion = plan.question
  if (answer) {
    const input = room.messages.find(message => message.id === plan.answerId)
    input.status = response.status
    delete plan.answerId
    if (response.status === 'failed') return hold(room, plan, previousQuestion)
  } else if (response.status === 'complete') plan.passed++
  else plan.failed++

  if (response.status !== 'complete') return false
  if (answer) {
    for (const step of plan.steps.slice(plan.cursor)) {
      if (step.replyTo === previousQuestion.messageId) step.replyTo = response.id
      const ids = handoffIdsFor(step)
      if (ids.includes(previousQuestion.messageId)) {
        step.handoffIds = [...new Set(ids.map(id => id === previousQuestion.messageId ? response.id : id))]
        delete step.handoffFrom
      }
    }
  }
  plan.steps[index].messageId = response.id
  const { ask, blocked } = extendPlan(plan.steps, index, names, room.members, room.rounds)
  if (blocked.length) {
    plan.skipped = (plan.skipped ?? 0) + blocked.length
    response.handoffWarnings = blocked.slice(0, 8)
    response.handoffWarningCount = blocked.length
  }
  if (!ask) return false
  response.asksUser = true
  return hold(room, plan, { messageId: response.id, memberId: response.memberId, step: index })
}

export function resultStatus({ passed, failed, skipped }) {
  if (!passed) return 'failed'
  return failed || skipped ? 'partial' : 'complete'
}
