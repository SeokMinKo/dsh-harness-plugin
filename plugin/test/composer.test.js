import test from 'node:test'
import assert from 'node:assert/strict'
import { mentionAt, insertMention, requestIdentity } from '../src/composer.js'

test('mention completion respects the caret, replaces its suffix and keeps the remaining sentence', () => {
  const text = '봐줘 @tes-old 지금'
  const range = mentionAt(text, text.indexOf('-old'))
  assert.equal(range.query, 'tes')
  const result = insertMention(text, 'test', range)
  assert.equal(result.text, '봐줘 @test 지금')
  assert.equal(result.caret, '봐줘 @test '.length)
  assert.equal(mentionAt('x@example', 9), undefined)
  assert.equal(mentionAt('````md\n```\n@lead', 16), undefined)
  assert.equal(mentionAt('    @lead', 9), undefined)
})

test('an uncertain submission reuses its ID only for exactly the same draft and recipient', () => {
  const a = { text: 'hello', tools: false, replyTo: 'old' }
  const first = requestIdentity(undefined, a, () => 'id1')
  assert.equal(requestIdentity(first, a, () => 'id2').id, 'id1')
  assert.equal(requestIdentity(first, { ...a, tools: true }, () => 'id2').id, 'id2')
  assert.equal(requestIdentity(first, { ...a, replyTo: 'new' }, () => 'id2').id, 'id2')
})

test('search matches author or message text and retries preserve an explicit original recipient', async () => {
  const { matchesMessage, retryDraft } = await import('../src/composer.js')
  const rows = [{ id: '1', author: 'Test', text: '검증 완료' }, { id: '2', author: 'lead', text: '다음 작업' }]
  assert.deepEqual(rows.filter(item => matchesMessage(item, '@test')).map(item => item.id), ['1'])
  assert.deepEqual(rows.filter(item => matchesMessage(item, '완료')).map(item => item.id), ['1'])
  const draft = retryDraft({ text: '계속', recipients: ['t'] }, [
    { id: 'l', name: 'lead', role: 'lead' }, { id: 't', name: 'test' },
  ])
  assert.equal(draft, '@test 계속')
  assert.equal(retryDraft({ text: '@test 확인', recipients: ['t'] }, [{ id: 't', name: 'test' }]), '@test 확인')
  assert.equal(retryDraft({ text: '계속', recipients: ['gone'] }, [{ id: 't', name: 'test' }]), undefined)
})
