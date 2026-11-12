/**
 * Version 1 contract between the workflow scheduler and a harness.
 *
 * Identity and session IDs are stable strings. A team is a JSON object
 * { id, leadId, members: [{ id, name, role, description }], workspace }.
 * startTurn(teamId, request) returns { result, activity(), drained() }. The
 * request carries an AbortSignal, exact Agent ID, text, policy, and optional
 * presentation metadata. Only the requested turn may be cancelled.
 * A successful result carries the final assistant text for that turn only.
 * drained() resolves once its owned work cannot start another tool call.
 *
 * taskBoard and files are optional. taskBoard(teamId) returns
 * { list(), get(id), create(input), update(input) }; snapshots carry id,
 * revision, status, blockedBy, ready, ownerName, subject and description.
 * The files object provides checkPath and hash; folder support adds checkFolder and listFiles.
 * Policies are text-only and native-approval. A harness without scoped native
 * tool authorization must refuse native-approval; text-only always denies tools.
 */
export const HARNESS_INTERFACE_VERSION = 1

export function validateHarness(adapter) {
  if (adapter?.version !== HARNESS_INTERFACE_VERSION || !adapter.id
    || typeof adapter.team !== 'function' || typeof adapter.startTurn !== 'function'
    || typeof adapter.busy !== 'function') throw new Error('지원하는 Harness 인터페이스가 필요합니다.')
  const { isolatedTurns, scopedCancellation, tools } = adapter.capabilities ?? {}
  if (!isolatedTurns || !scopedCancellation || !['none', 'native-approval'].includes(tools)) {
    throw new Error('Harness가 턴 분리와 작업 단위 취소를 보장해야 합니다.')
  }
  if (adapter.taskBoard && typeof adapter.taskBoard !== 'function') throw new Error('잘못된 작업 보드 인터페이스입니다.')
  if (adapter.files && (['checkPath', 'hash'].some(key => typeof adapter.files[key] !== 'function')
    || Boolean(adapter.files.checkFolder) !== Boolean(adapter.files.listFiles)
    || (adapter.files.checkFolder && ['checkFolder', 'listFiles'].some(key => typeof adapter.files[key] !== 'function')))) {
    throw new Error('잘못된 파일 인터페이스입니다.')
  }
  return adapter
}

export function turnPolicy(adapter, tools) {
  if (!tools) return 'text-only'
  if (adapter.capabilities.tools !== 'native-approval') throw new Error('이 Harness는 작업별 도구 승인을 지원하지 않습니다.')
  return 'native-approval'
}
