import { createHash } from 'node:crypto'
import { stat as hostStat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

const reserved = /^(?:con|conin\$|conout\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i

export function workspaceRelative(input) {
  const path = input.replaceAll('\\', '/')
  const parts = path.split('/').filter(part => part !== '.' && part !== '')
  if (!path || path.startsWith('/') || path.startsWith('~') || /[\x00-\x1f<>:"|?*]/u.test(path)
    || parts.some(part => part === '..' || /[. ]$/.test(part) || reserved.test(part))) {
    throw new Error('작업 공간 내부의 상대 경로를 사용하세요. ' + input)
  }
  return parts.join('/') || '.'
}

export function createWorkspaceFiles(provider, lifetime) {
  function checkPath(workspace, input) {
    if (!workspace) throw new Error('원본 세션에 작업 공간을 지정하세요.')
    return workspaceRelative(input)
  }

  async function target(workspace, input, type, signal) {
    const path = checkPath(workspace, input)
    const fs = provider()
    if (!fs) throw new Error('Harness 파일 서비스가 없습니다.')
    const root = await fs.resolve(workspace, { signal })
    const parts = path.split('/')
    for (let index = 1; index <= parts.length; index++) {
      const part = await fs.lstat(parts.slice(0, index).join('/'), { cwd: workspace }, signal)
      if (!part) throw new Error('파일 또는 폴더를 찾을 수 없습니다. ' + input)
      if (part.type !== (index === parts.length ? type : 'directory')) throw new Error('심볼릭 링크나 다른 종류의 경로는 사용할 수 없습니다. ' + input)
    }
    const file = await fs.resolve(path, { cwd: workspace, signal })
    if (!fs.contains(root, file)) throw new Error('작업 공간 밖을 가리키는 경로입니다.')
    const info = await fs.stat(file, signal)
    if (info?.type !== type) throw new Error('파일 또는 폴더가 변경됐습니다. ' + input)
    return { fs, file, info, path }
  }

  function budget(signal) {
    return AbortSignal.any([lifetime, AbortSignal.timeout(120_000), ...(signal ? [signal] : [])])
  }

  return {
    checkPath,
    async info(workspace, input, requestSignal) {
      const { info } = await target(workspace, input, 'file', budget(requestSignal))
      return { stamp: String(info.version), bytes: info.size }
    },
    async hash(workspace, input, requestSignal) {
      const signal = budget(requestSignal)
      const before = await target(workspace, input, 'file', signal)
      const bytes = before.info.size
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('파일 크기를 확인할 수 없습니다. ' + input)
      const hash = createHash('sha256')
      let offset = 0
      do {
        signal.throwIfAborted()
        const length = Math.min(1024 * 1024, bytes - offset)
        const block = await before.fs.readByteRange(before.file, { offset, length: Math.max(1, length) }, signal)
        if (block.byteLength !== length) throw new Error('파일이 읽는 동안 바뀌었습니다. ' + input)
        hash.update(block)
        offset += length
      } while (offset < bytes)
      const after = await target(workspace, input, 'file', signal)
      if (before.file.targetKey !== after.file.targetKey || before.info.version !== after.info.version || bytes !== after.info.size) {
        throw new Error('파일이 읽는 동안 바뀌었습니다. ' + input)
      }
      return { path: input, bytes, sha256: hash.digest('hex'), stamp: String(after.info.version) }
    },
    async checkFolder(workspace, input) {
      await target(workspace, input, 'directory', budget())
    },
    async listFiles(workspace, input, suffix) {
      const signal = budget()
      const { fs, file, path } = await target(workspace, input, 'directory', signal)
      const files = []
      for (const entry of await fs.listDir(file, signal)) {
        if (entry.type !== 'file' || entry.name.startsWith('.') || !entry.name.endsWith(suffix)) continue
        const relative = path === '.' ? entry.name : path + '/' + entry.name
        try {
          const checked = await target(workspace, relative, 'file', signal)
          const hostPath = fs.processPath(checked.file)
          const mapped = isAbsolute(hostPath) && fs.processPathFromHostPath(hostPath)
          if (!mapped || (await fs.resolve(mapped, { signal })).targetKey !== checked.file.targetKey) continue
          const observed = await hostStat(hostPath)
          const after = await fs.stat(checked.file, signal)
          if (after?.version !== checked.info.version) continue
          files.push({ path: relative, stamp: String(after.version), changedAt: Math.max(observed.mtimeMs, observed.ctimeMs) })
        } catch (error) {
          if (signal.aborted) throw error
          // One inaccessible or replaced entry does not prevent other files from being observed.
        }
      }
      return files
    },
  }
}
