import { mkdir, writeFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const fromRuntime = createRequire(resolve(process.env.TEAM_CHAT_E2E_RUNTIME, 'package.json'))
const { defineTool } = await import(pathToFileURL(fromRuntime.resolve('@deepseek-ai/dsh-tools')).href)
const { LlmAdapter } = await import(pathToFileURL(fromRuntime.resolve('@deepseek-ai/dsh-llm')).href)

export const inject = ['agents', 'agentLoop', 'agentTeams', 'llm', 'sessionController', 'typert', 'sessionPersistence', 'tools', 'approval']
const leadId = '4ef3f882-2688-4e7d-8bc0-10a98c0b1fc6'
const teamNames = ['watch', 'test', 'report']
const content = text => [{ type: 'text', text }]

async function workflowFixture(text, signal) {
  if (text.startsWith('TEAM_CHAT_ALLOCATION')) {
    const { request, roster } = JSON.parse(text.split('\n').at(-1))
    const task = (id, title, name, instruction, after = []) => ({
      id, title, agent: roster.find(item => item.name === name).id, instruction, after,
      completion: title + ' 결과를 남깁니다.',
    })
    if (request.includes('중지 시험')) return { title: '작업 제어 검증', nodes: [
      task('probe', '입력 검증', 'test', 'wf-checkpoint'),
      task('independent', '독립 분석', 'report', 'wf-independent'),
      task('follow', '최종 확인', 'lead', 'wf-simple', ['probe']),
    ] }
    return { title: '팀 로그 분석', nodes: [
      task('cause', '원인 분석', 'test', 'wf-simple'),
      task('reproduce', '재현 조건', 'watch', 'wf-simple'),
      task('final', '결과 취합', 'lead', 'wf-simple', ['cause', 'reproduce']),
    ] }
  }
  if (text.startsWith('TEAM_CHAT_WORKFLOW_DESIGN')) {
    const { draft, roster, selected, request: raw } = JSON.parse(text.split('\n').at(-1))
    let request = raw
    try { request = JSON.parse(raw).request ?? raw } catch {}
    if (request.includes('모호한 설계')) return { question: '검증을 어느 Agent에게 맡길까요?' }
    if (request.includes('종료 후 보고') && draft.nodes.length) {
      const node = draft.nodes.find(item => item.id === (selected ?? 'report'))
      node.after = node.after.map(edge => ({ ...edge, when: 'settled' }))
      return { draft, note: '실패를 포함한 종료 후 보고로 변경합니다.' }
    }
    const agent = name => roster.find(item => item.name === name).id
    const node = (id, title, name, after = []) => ({
      id, title, agent: agent(name), group: null, instruction: 'wf-simple', completion: '', tools: false,
      needsDevice: false, outputs: [], after: after.map(from => ({ from, when: 'success' })),
    })
    return {
      draft: { title: '펌웨어 검증 흐름', layout: 'mixed', groups: [], nodes: [
        node('watch', '펌웨어 확인', 'watch'), node('test', '펌웨어 검증', 'test', ['watch']),
        node('metadata', '메타데이터 정리', 'lead', ['watch']), node('report', '최종 보고', 'report', ['test', 'metadata']),
      ] },
      note: '검증과 메타데이터 정리를 병렬 실행하고 결과를 합칩니다.',
    }
  }
  const data = JSON.parse(text.split('\n').at(-1).slice('Task details: '.length))
  const result = (summary, artifacts = []) => ({ status: 'complete', summary, artifacts })
  switch (data.instruction) {
    case 'wf-checkpoint': {
      if (data.correctedInput === 'corrected') return result('수정 입력으로 새로 실행 완료')
      if (!data.checkpoint) {
        await mkdir('out', { recursive: true })
        await writeFile('out/resume.txt', 'saved phase output')
        return { status: 'checkpoint', state: 'fixture-phase-1', files: ['out/resume.txt'] }
      }
      if (data.checkpoint !== 'fixture-phase-1') return { status: 'failed', summary: '체크포인트가 전달되지 않았습니다.' }
      try { await access('resume-probe'); return result('저장된 지점부터 재개 완료') } catch {}
      console.log('ALLOCATION_CHECKPOINT_RUNNING')
      await new Promise((_, reject) => {
        if (signal.aborted) return reject(signal.reason)
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      break
    }
    case 'wf-ask':
      if (!data.userAnswer) return { status: 'question', question: '가짜 장비 ID를 알려 주세요.' }
      return result('장비 확인 · ' + data.userAnswer)
    case 'wf-ask-second':
      if (!data.userAnswer) return { status: 'question', question: '보고서 형식을 알려 주세요.' }
      return result('보고 형식 · ' + data.userAnswer)
    case 'wf-independent':
      return result('독립 작업 완료')
    case 'wf-artifact': {
      console.log('WF_PARALLEL_START', data.id)
      await new Promise(resolve => setTimeout(resolve, 1050))
      await mkdir('out', { recursive: true })
      const name = 'out/' + data.id + '.txt'
      await writeFile(name, 'artifact for ' + data.id)
      console.log('WF_PARALLEL_END', data.id)
      return result(data.title + ' 완료', [name])
    }
    case 'wf-join':
      if (data.sources.length !== 2 || data.sources.some(source => !source.artifacts?.[0]?.sha256)) {
        return { status: 'failed', summary: '누락된 선행 결과' }
      }
      return result('두 결과와 SHA-256 확인')
    case 'wf-failure':
      return { status: 'failed', summary: '가상 검증 실패' }
    case 'wf-missing':
      return result('필수 결과를 만들지 않은 경우')
    case 'wf-crash': {
      try { await access('resume-fixture'); return result('가상 장비 상태 확인 후 완료') } catch {}
      console.log('WF_CRASH_START')
      await new Promise((_, reject) => {
        if (signal.aborted) return reject(signal.reason)
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      break
    }
    case 'wf-input':
      if (!data.inputSha256) return { status: 'failed', summary: '입력 해시 없음' }
      return result('안정된 입력 파일 확인')
    default:
      return result(data.title + ' 완료')
  }
}

class FixtureAdapter extends LlmAdapter {
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, defaultMaxTokens: 2048 }
  }
  async *stream(options) {
    const direct = block => block.type === 'text' && (
      block.text.startsWith('TEAM_CHAT_WORKFLOW_') || block.text.startsWith('TEAM_CHAT_ALLOCATION') || block.text.startsWith('You are @') || block.text === '원본 별도 입력')
    const tail = options.messages.slice(options.messages.findLastIndex(message => message.role === 'assistant') + 1)
    const noticeOnly = tail.some(message => message.role === 'user' && (
      message.source?.kind === 'subagent-settled' || message.content.some(block =>
        block.type === 'text' && block.text.startsWith('Background subagent '))))
      && !tail.some(message => message.role === 'user' && message.content.some(direct))
    if (noticeOnly) {
      const answer = '팀원 상태 확인'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: answer }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const request = options.messages.findLast(message => message.role === 'user' && message.content.some(direct))
      ?.content.find(direct)?.text
    if (request?.startsWith('TEAM_CHAT_WORKFLOW_') || request?.startsWith('TEAM_CHAT_ALLOCATION')) {
      let result
      if (request.includes('"instruction":"wf-native-boundary"')) {
        if (options.messages.at(-1)?.role !== 'tool') {
          const block = { type: 'tool-call', id: 'native-boundary', name: 'team_task_create',
            arguments: JSON.stringify({ subject: 'isolated scope test', description: 'Test native task mutation' }) }
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
          yield { type: 'block-end', index: 0, block }
          yield { type: 'finish', reason: { kind: 'tool-calls' } }
          return
        }
        result = { status: 'complete', summary: JSON.stringify(options.messages.at(-1).content), artifacts: [] }
      } else result = await workflowFixture(request, options.signal)
      const answer = JSON.stringify(result)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: answer }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const last = options.messages.findLast(message => message.role === 'user'
      && message.content.some(block => block.type === 'text' && block.text.startsWith('You are @')))
      ?? options.messages.findLast(message => message.role === 'user')
    const text = last?.content.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
    const latestUser = options.messages.findLast(message => message.role === 'user'
      && (message.source?.kind === 'user' || message.content.some(block => block.type === 'text'
        && (block.text.startsWith('You are @') || block.text === '원본 별도 입력'))))
    const latestText = latestUser?.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    const trigger = text.split('\n').at(-1) ?? ''
    const member = /You are @([a-z-]+)/.exec(text)?.[1]
    let answer = 'fixture 준비 완료'
    if (member === 'watch') answer = '새 이미지 발견\n[[team-chat: @test]]'
    if (member === 'test') answer = '검증 7건 통과\n[[team-chat: @report]]'
    if (member === 'report') answer = trigger.includes('보고서 형식') ? '보고서 형식 답변 반영' : '리포트 완료. 보고 형식은 어떻게 할까요?\n[[team-chat: @user]]'
    if (member === 'lead') answer = '리드 확인 완료'
    if (trigger.includes('원본 동시 검증') && latestText?.startsWith('You are @')) {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '방 응답 생성 중' }
      await new Promise(resolve => setTimeout(resolve, 1400))
      yield { type: 'text-delta', index: 0, text: ' · 방 응답 완료' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '방 응답 생성 중 · 방 응답 완료' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    if (trigger.includes('도구 전 문장 검증') && latestText?.startsWith('You are @')) {
      if (options.messages.at(-1)?.role === 'tool') {
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const preamble = '검증 도구 시작\n[[team-chat: @test]]'
      const block = { type: 'tool-call', id: 'audit-' + Math.random().toString(16).slice(2),
        name: 'team_chat_audit_noop', arguments: '{}' }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: preamble }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: preamble } }
      yield { type: 'block-start', index: 1, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 1, id: block.id, name: block.name, argumentsDelta: block.arguments }
      yield { type: 'block-end', index: 1, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (member === 'lead' && trigger.includes('긴 답변 인계')) answer = '앞부분 ' + '한'.repeat(15000) + ' 뒷부분\n[[team-chat: @test]]'
    if (member === 'test' && trigger.includes('뒷부분')) answer = '긴 응답 끝부분 확인'
    if (trigger.includes('둘 다 인계')) {
      if (member === 'watch') answer = 'watch의 입력\n[[team-chat: @report]]'
      if (member === 'test') answer = 'test의 결과\n[[team-chat: @report]]'
      if (member === 'report') {
        if (!text.includes('Peer handoff from @watch') || !text.includes('Peer handoff from @test')
          || !text.includes('watch의 입력') || !text.includes('test의 결과')) throw new Error('missing a handoff')
        answer = 'report 두 인계 확인'
      }
    }
    if (trigger.includes('전원 확인')) answer = member + ' 전체 확인'
    if (trigger.includes('답장 단일')) answer = member + ' 답장 확인'
    if (trigger.includes('두 창 검증')) answer = '두 창 동기화 응답'
    if (trigger.includes('재연결 검증')) answer = '재연결 동기화 응답'
    if (trigger.includes('기록 재연결 검증')) answer = '기록 재연결 동기화 응답'
    if (member === 'lead' && trigger.includes('라운드 한도')) answer = 'report를 호출합니다.\n[[team-chat: @report]]'
    if (member === 'lead' && trigger.includes('대기열 한도')) answer = '대기열 시험 질문\n[[team-chat: @user]]'
    if (member === 'lead' && trigger.includes('중첩 질문 시작')) answer = '첫 번째 질문\n[[team-chat: @user @report]]'
    if (member === 'lead' && trigger.includes('추가 질문 요청')) answer = '두 번째 질문\n[[team-chat: @user]]'
    if (member === 'report' && trigger.includes('두 번째 질문')) answer = '남은 report 실행 완료'
    if (member === 'lead' && trigger.includes('자동 인계 도구')) answer = '자동 인계 도구 검사\n[[team-chat: @test]]'
    if (trigger.includes('권한 없는 도구') || (member === 'test' && trigger.includes('자동 인계 도구'))) {
      if (options.messages.at(-1)?.role === 'tool') answer = '도구 결과 확인: ' + JSON.stringify(options.messages.at(-1).content)
      else {
        const block = { type: 'tool-call', id: 'fixture-deny-' + Math.random().toString(16).slice(2),
          name: 'team_chat_audit_noop', arguments: '{}' }
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
        yield { type: 'block-end', index: 0, block }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
    }
    if (member === 'lead' && trigger.includes('미등록 인계')) answer = '잘못 지정한 팀원 검증\n[[team-chat: @missing]]'

    if (trigger.includes('도구 승인 테스트')) {
      if (options.messages.at(-1)?.role !== 'tool') {
        const block = { type: 'tool-call', id: 'fixture-' + Math.random().toString(16).slice(2),
          name: 'team_chat_fixture_action', arguments: '{}' }
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
        yield { type: 'block-end', index: 0, block }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
      answer = '도구 결과: ' + JSON.stringify(options.messages.at(-1).content)
    }
    if (trigger.includes('중지 테스트') || trigger.includes('강제 종료 검증') || trigger.includes('답변 슬롯 확인')) {
      if (trigger.includes('강제 종료 검증')) console.log('E2E_CRASH_REQUEST_STARTED')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '작업 중입니다.' }
      await new Promise((_, reject) => {
        if (options.signal.aborted) return reject(options.signal.reason)
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
      return
    }
    if (member === 'watch' && trigger.includes('그룹 인계 질문')) answer = '어떤 조건으로 진행할까요?\n[[team-chat: @user @test @report]]'
    if (member === 'watch' && trigger.includes('조건 확정 42')) answer = 'watch 답변: 확정 조건 42'
    if (member === 'test' && trigger.includes('그룹 인계 질문')) {
      if (!text.includes('Peer handoff from @watch') || !text.includes('watch 답변: 확정 조건 42')) {
        throw new Error('Missing watch handoff in the directly addressed test turn')
      }
      answer = 'test 검증: 확정 조건 42 확인\n[[team-chat: @report]]'
    }
    if (member === 'report' && trigger.includes('확정 조건 42')) {
      if (!text.includes('Peer handoff from @test') || !text.includes('test 검증: 확정 조건 42 확인')) {
        throw new Error('Missing test handoff in report turn')
      }
      answer = 'report 요약: 조건 42 검증 완료'
    }
    if (member === 'test' && trigger.includes('부분 실패')) throw new Error('테스트용 팀원 실패')
    if (member === 'watch' && (trigger.includes('그룹 인계 질문') || trigger.includes('조건 확정 42'))) {
      await new Promise(resolve => setTimeout(resolve, 600))
    }
    const truncated = member === 'lead' && trigger.includes('출력 한도 검증')
    if (truncated) answer = '잘린 응답 예시\n[[team-chat: @test]]'
    if (latestText === '원본 별도 입력') answer = '원본 세션 전용 응답'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: answer }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
    yield { type: 'usage', usage: { inputTokens: 15, outputTokens: 8 } }
    yield { type: 'finish', reason: { kind: truncated ? 'max-tokens' : 'stop' } }
  }
}

export async function apply(ctx) {
  ctx.llm.registerAdapter(['team-chat-fixture'], new FixtureAdapter())
  const currentTurn = new Map()
  ctx.on('session/event', (session, event) => {
    if (session.id !== leadId) return
    if (event.type === 'turn/start') currentTurn.set(session.id, event.data.turn)
    if (event.type === 'user/message') {
      for (const block of event.data.content) {
        if (block.type !== 'text') continue
        if (block.text === '원본 별도 입력') console.log('AUDIT_ORIGINAL_TURN', currentTurn.get(session.id))
        if (block.text.startsWith('You are @lead') && block.text.split('\n').at(-1).includes('원본 동시 검증')) {
          console.log('AUDIT_ROOM_TURN', currentTurn.get(session.id))
        }
      }
    }
  }, { global: true })
  ctx.tools.register(defineTool({
    name: 'team_chat_audit_noop', description: 'Synthetic no-op for final-response checks', parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => content(JSON.stringify(value)) },
    async execute() { console.log('AUDIT_NOOP_EXECUTED'); return { fixture: true } },
  }))

  ctx.tools.register(defineTool({
    name: 'team_chat_fixture_action',
    description: 'Synthetic approval with no side effect',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => content(JSON.stringify(value)) },
    async execute(_args, exec) {
      const decision = await ctx.approval.request({ agent: exec.agent, toolName: 'team_chat_fixture_action',
        callId: exec.callId, reason: 'Synthetic action approval', signal: exec.signal })
      return { decision, fixture: true }
    },
  }))
  let lead
  try { lead = await ctx.typert.lookups.get('agent').resolve(leadId) }
  catch (cause) {
    if (await ctx.sessionPersistence.stat(leadId)) {
      console.log('TEAM_CHAT_COLD_FIXTURE', cause.message)
      console.log('TEAM_CHAT_FIXTURE_READY')
      return
    }
    lead = await ctx.agentLoop.create(leadId, { provider: 'team-chat-fixture', model: 'fixture' }, { cwd: process.cwd() })
    lead.session.append('session/title', { title: '검증 팀', messageSeqs: [], source: { kind: 'user' } })
    lead.model.select({ provider: 'team-chat-fixture', model: 'fixture' })
  }
  const current = new Set(ctx.agentTeams.listMembers(lead).map(member => member.name))
  for (const name of teamNames) {
    if (current.has(name)) continue
    await ctx.agentTeams.spawnTeammate(lead, { name, description: name + ' fixture', prompt: content('준비'), context: 'fresh', provider: 'spawn', signal: new AbortController().signal })
  }
  console.log('TEAM_CHAT_FIXTURE_READY')
}
