export const HARNESS_INTERFACE_VERSION: 1

export type TurnPolicy = 'text-only' | 'native-approval'
export interface AgentRef {
  id: string
  name: string
  role: 'lead' | 'teammate'
  description?: string
}
export interface TeamRef {
  id: string
  leadId: string
  members: AgentRef[]
  workspace: string | null
}
export interface TurnRequest {
  turnId: string
  agentId: string
  text: string
  policy: TurnPolicy
  signal: AbortSignal
  timeoutMs?: number
  silent?: boolean
  replyTo?: string
  task?: { runId: string; nodeId: string }
}
export interface TurnHandle {
  result: Promise<{
    id?: string
    status: 'complete' | 'failed' | 'stopped' | 'interrupted'
    text: string
    error?: string
    truncated?: boolean
  }>
  activity(): { phase: 'queued' | 'running' | 'approval' | 'question'; toolName?: string } | null
  drained(): Promise<void>
}
type MaybePromise<T> = T | Promise<T>
export interface TaskSnapshot {
  id: string
  revision: number
  status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  blockedBy: string[]
  ready: boolean
  ownerName?: string
  subject: string
  description: string
}
export interface TaskBoard {
  list(): MaybePromise<TaskSnapshot[]>
  get(id: string): MaybePromise<TaskSnapshot>
  create(input: { subject: string; description: string; blockedBy: string[] }): MaybePromise<TaskSnapshot>
  update(input: { taskId: string; expectedRevision: number } & (
    { action: 'edit'; subject: string; description: string }
    | { action: 'set_dependencies'; blockedBy: string[] }
    | { action: 'reassign'; owner: string }
    | { action: 'complete' }
  )): MaybePromise<TaskSnapshot>
}
export interface WorkspaceFiles {
  checkPath(workspace: string | null, path: string): string
  hash(workspace: string | null, path: string, signal?: AbortSignal): Promise<{
    path: string; bytes: number; sha256: string; stamp: string
  }>
  info?(workspace: string | null, path: string, signal?: AbortSignal): Promise<{ stamp: string; bytes: number }>
  checkFolder?(workspace: string | null, folder: string): Promise<void>
  listFiles?(workspace: string | null, folder: string, suffix: string): Promise<{
    path: string; stamp: string; changedAt: number
  }[]>
}
export interface HarnessAdapterV1 {
  id: string
  version: 1
  capabilities: { isolatedTurns: true; scopedCancellation: true; tools: 'none' | 'native-approval' }
  team(teamId: string): Promise<TeamRef>
  busy(agentId: string): boolean
  startTurn(teamId: string, request: TurnRequest): TurnHandle
  taskBoard?(teamId: string): MaybePromise<TaskBoard | undefined>
  files?: WorkspaceFiles
}
export function validateHarness<T extends HarnessAdapterV1>(adapter: T): T
export function turnPolicy(adapter: HarnessAdapterV1, tools: boolean): TurnPolicy
