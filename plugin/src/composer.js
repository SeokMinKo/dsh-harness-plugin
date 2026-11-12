import { outsideCode, routeUser } from './routing.js'

export function mentionAt(text, caret) {
  const line = outsideCode(text.slice(0, caret)).at(-1)
  const match = /(?<![\p{L}\p{N}_@])@([a-z0-9-]*)$/iu.exec(line)
  if (!match) return undefined
  const suffix = /^[a-z0-9-]*/i.exec(text.slice(caret))[0]
  return { start: caret - match[0].length, end: caret + suffix.length, query: match[1].toLowerCase() }
}

export function insertMention(text, name, range) {
  const before = text.slice(0, range.start)
  const after = text.slice(range.end)
  const gap = before && /[\p{L}\p{N}_@]$/u.test(before) ? ' ' : ''
  const following = /^\s|^[,.;:!?)]/.test(after) ? '' : ' '
  const head = before + gap + '@' + name + following
  return { text: head + after, caret: head.length + Number(after.startsWith(' ')) }
}

export function requestIdentity(previous, { text, tools, replyTo, allocation }, createId) {
  const signature = JSON.stringify([text, tools, replyTo ?? null, Boolean(allocation)])
  return previous?.signature === signature ? previous : { text, signature, id: createId() }
}

export function matchesMessage(message, query) {
  const value = query.trim().toLowerCase()
  return !value || message.text.toLowerCase().includes(value) || ('@' + message.author.toLowerCase()).includes(value)
}

export function retryDraft(message, members) {
  if (message.allocation) return message.text
  const recipients = message.recipients.map(id => members.find(member => member.id === id))
  if (!recipients.length || recipients.some(member => !member)) return undefined
  const original = routeUser(message.text, members)
  if (original.join(' ') === message.recipients.join(' ')) return message.text
  return recipients.map(member => '@' + member.name).join(' ') + ' ' + message.text
}
