import { createHash } from 'node:crypto'

export { requestsAllocation } from './allocation-routing.js'

const stoppable = new Set(['pending', 'running', 'question', 'approval'])
export const canStopTask = status => stoppable.has(status)

export function checkpointKey(run, node, input) {
  const sources = node.after.map(edge => {
    const step = run.steps[edge.from]
    return [edge.from, edge.when, step.status, step.attempt, step.summary,
      step.artifacts?.map(file => [file.path, file.sha256])]
  })
  const context = [node.id, node.agent, node.instruction, node.completion, node.tools, node.outputs,
    run.device, run.workspace, run.request, input.path, input.sha256, input.text, input.answer, sources]
  return createHash('sha256').update(JSON.stringify(context)).digest('hex')
}

export function assertCheckpoint(checkpoint, signature) {
  if (!checkpoint) throw new Error('저장된 체크포인트가 없습니다. 재실행 또는 취소를 선택하세요.')
  if (checkpoint.signature !== signature) {
    throw new Error('입력, 작업 조건 또는 선행 결과가 바뀌어 체크포인트를 재사용할 수 없습니다. 재실행 또는 취소를 선택하세요.')
  }
}

export function taskTools(run, step) {
  return step.authorized === true || run.tools && !step.requiresFreshAuth
}
