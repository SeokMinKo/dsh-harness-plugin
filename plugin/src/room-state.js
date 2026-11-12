import { routeUser } from './routing.js'

export const isPending = message => ['queued', 'running', 'waiting'].includes(message.status)

export function acceptSend(room, { id, text, replyTo, tools, allocation }, time, find = id => room.messages.find(message => message.id === id)) {
  const existing = find(id)
  if (existing) {
    if (existing.kind === 'user' && existing.text === text && existing.tools === tools && existing.replyTo === replyTo
      && Boolean(existing.allocation) === Boolean(allocation)) return false
    throw new Error('이미 다른 메시지에 사용된 요청 ID입니다.')
  }
  const reply = replyTo ? find(replyTo) : undefined
  if (replyTo && reply?.kind !== 'bot') throw new Error('답장할 팀원 메시지를 찾을 수 없습니다.')
  if (allocation && (replyTo || tools)) throw new Error('배분안은 새 메시지에서 도구 사용 없이 요청하세요.')
  const recipients = allocation ? [room.teamId] : routeUser(text, room.members, reply?.memberId, tools)
  const answering = replyTo && replyTo === room.awaiting?.messageId
  if (answering && (recipients.length !== 1 || recipients[0] !== room.awaiting.memberId)) {
    throw new Error('질문한 팀원에게 직접 답장하세요.')
  }
  if (!answering && room.messages.filter(isPending).length >= 24) throw new Error('대기 중인 메시지가 너무 많습니다.')
  if (answering) {
    if (room.continuation) {
      room.continuation.answerId = id
      requeueContinuation(room)
    } else room.priorityId = id
    delete room.awaiting
  }
  room.messages.push({
    id, kind: 'user', author: '나', text, time, ...(replyTo ? { replyTo } : {}),
    status: 'queued', recipients, tools, ...(allocation ? { allocation: true } : {}),
  })
  return true
}

export function selectStop(room, { mode = 'all', activeId }, currentId) {
  if (activeId && activeId !== currentId) return false
  if (mode === 'current') return Boolean(currentId)
  for (const message of room.messages) if (message.status === 'queued' || message.status === 'waiting') message.status = 'stopped'
  delete room.priorityId
  delete room.awaiting
  delete room.continuation
  return true
}

export function toolEnabledFor(message, turn) {
  return message.tools && turn.round === 1 && message.recipients.length === 1 && message.recipients[0] === turn.id
}

export function nextQueued(room) {
  if (room.awaiting) return undefined
  const urgent = room.priorityId && room.messages.find(message => message.id === room.priorityId && message.status === 'queued')
  return urgent || room.messages.find(message => message.status === 'queued')
}

export function resumeQuestion(room, questionId) {
  if (room.awaiting?.messageId !== questionId) return false
  if (room.continuation) requeueContinuation(room)
  delete room.awaiting
  return true
}

function requeueContinuation(room) {
  const root = room.messages.find(message => message.id === room.continuation.rootId && message.status === 'waiting')
  if (!root) throw new Error('중단된 요청을 찾을 수 없습니다.')
  root.status = 'queued'
  room.priorityId = root.id
}

export function recoverInterrupted(room) {
  const waitingId = room.continuation && room.awaiting?.messageId === room.continuation.question.messageId
    && room.messages.find(message => message.id === room.continuation.rootId && message.status === 'waiting')?.id
  for (const message of room.messages) {
    if (isPending(message) && message.id !== waitingId) message.status = 'interrupted'
  }
  delete room.priorityId
  if (room.continuation && !waitingId) {
    delete room.continuation
    delete room.awaiting
  }
}

export function roomSummary({ messages, base: _base, priorityId: _priority, awaiting, continuation, ...room }) {
  return { ...room,
    awaiting: awaiting ? { ...awaiting, remaining: continuation ? continuation.steps.length - continuation.cursor : 0 } : null,
    updated: messages.at(-1)?.time ?? 0,
  }
}
