import { fork } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'

const support = process.env.TEAM_CHAT_DESKTOP_SUPPORT
const child = fork(new URL('./index.ts', import.meta.url), [
  process.env.TEAM_CHAT_E2E_RUNTIME,
  join(process.env.DSH_HOME, 'profiles', 'desktop'),
  join(support, 'primary-runtime'),
  join(support, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'),
  join(support, 'bin'),
], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
const input = createInterface({ input: process.stdin })
input.on('line', line => { if (child.connected) child.send(JSON.parse(line)) })
child.on('message', message => {
  if (message.type === 'ready') {
    console.log('DESKTOP_HOST_READY')
    console.log('dsh web:', message.url)
  }
  if (message.type === 'fatal') console.error('Desktop host startup failed:', message.message)
  if (message.type === 'shutdown-complete') console.log('DESKTOP_IPC_SHUTDOWN')
  if (message.type === 'update-tasks' || message.type === 'quit-inspection') console.log('DESKTOP_CONTROL', JSON.stringify(message))
})
child.once('exit', code => {
  input.close()
  process.stdin.pause()
  process.exitCode = code ?? 1
})
process.once('SIGTERM', () => { if (child.connected) child.send({ type: 'shutdown' }) })
