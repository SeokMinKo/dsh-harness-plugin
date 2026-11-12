import { outsideCode } from './routing.js'

export function requestsAllocation(text, replyTo) {
  if (replyTo) return false
  const command = outsideCode(text).join(' ')
  const targets = [...command.matchAll(/(?<![\p{L}\p{N}_@])@([a-z0-9-]+)/giu)].map(match => match[1].toLowerCase())
  if (targets.some(name => name !== 'lead')) return false
  return /나눠|나누어|(?:분담|분배|배분|분업)\s*(?:을\s*)?(?:해|하|시켜)|\b(?:delegate|split|divide|distribute)\b/i.test(command)
}
