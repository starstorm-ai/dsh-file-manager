import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FileManagerOperations,
  joinWirePath,
  validateWirePath,
} from '../src/host/operations.ts'

const sessionId = SessionId('file-manager-test')
const signal = (): AbortSignal => new AbortController().signal

describe('FileManagerOperations', () => {
  let container: string
  let workspace: string
  let outside: string
  let fs: LocalFileSystem

  beforeEach(() => {
    container = mkdtempSync(join(tmpdir(), 'dsh-file-manager-'))
    workspace = join(container, 'workspace')
    outside = join(container, 'outside')
    mkdirSync(workspace)
    mkdirSync(outside)
    fs = new LocalFileSystem(new Context(), {
      cwd: workspace,
      diffBasisMaxBytes: 1024 * 1024,
    })
  })

  afterEach(() => {
    rmSync(container, { recursive: true, force: true })
  })

  function operations(overrides: Partial<ConstructorParameters<typeof FileManagerOperations>[2]> = {}) {
    return new FileManagerOperations(
      fs,
      async () => ({ meta: { cwd: workspace } }),
      {
        maxFileBytes: 64,
        maxEntriesPerDirectory: 100,
        showHiddenByDefault: false,
        editable: true,
        ...overrides,
      },
    )
  }

  it('accepts only canonical root-relative wire paths', () => {
    expect(validateWirePath('', true)).toBe('')
    expect(validateWirePath('src/index.ts', false)).toBe('src/index.ts')
    expect(joinWirePath('src', 'index.ts')).toBe('src/index.ts')
    expect(joinWirePath('', 'README.md')).toBe('README.md')
    for (const path of [
      '', '/etc/passwd', '../secret', 'src/../secret', 'src/./file', 'src//file',
      'C:/secret', 'a\\b', 'nul\0name',
    ]) {
      try {
        validateWirePath(path, path !== '')
        throw new Error(`expected ${JSON.stringify(path)} to be rejected`)
      } catch (error: unknown) {
        expect(error).toMatchObject({ code: 'file-manager/invalid-path' })
      }
    }
  })

  it('sorts directories first, hides dotfiles, and filters escaping symlinks', async () => {
    mkdirSync(join(workspace, 'src'))
    writeFileSync(join(workspace, 'z.txt'), 'z')
    writeFileSync(join(workspace, '.env'), 'secret')
    writeFileSync(join(outside, 'outside.txt'), 'outside')
    symlinkSync(join(outside, 'outside.txt'), join(workspace, 'escape.txt'))
    symlinkSync(join(workspace, 'z.txt'), join(workspace, 'inside-link.txt'))

    const hidden = await operations().list({ sessionId, path: '' }, signal())
    expect(hidden.entries.map(entry => entry.name)).toEqual(['src', 'inside-link.txt', 'z.txt'])
    expect(hidden.entries.find(entry => entry.name === 'inside-link.txt')).toMatchObject({
      kind: 'file',
      symlink: true,
    })
    expect(hidden.entries.some(entry => entry.name === 'escape.txt')).toBe(false)

    const shown = await operations().list({ sessionId, path: '', showHidden: true }, signal())
    expect(shown.entries.map(entry => entry.name)).toContain('.env')
    expect(shown.showHidden).toBe(true)
  })

  it('bounds directory results and reports truncation', async () => {
    for (const name of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(workspace, name), name)
    const result = await operations({ maxEntriesPerDirectory: 2 })
      .list({ sessionId, path: '' }, signal())
    expect(result.entries).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('reads UTF-8 text and rejects binary or oversized content', async () => {
    writeFileSync(join(workspace, 'ok.ts'), 'export const ok = true\n')
    writeFileSync(join(workspace, 'nul.bin'), Buffer.from([0x61, 0, 0x62]))
    writeFileSync(join(workspace, 'invalid.bin'), Buffer.from([0xff, 0xfe]))
    writeFileSync(join(workspace, 'large.txt'), 'x'.repeat(65))

    await expect(operations().read({ sessionId, path: 'ok.ts' }, signal())).resolves.toMatchObject({
      path: 'ok.ts',
      content: 'export const ok = true\n',
      editable: true,
    })
    await expect(operations().read({ sessionId, path: 'nul.bin' }, signal()))
      .rejects.toMatchObject({ code: 'file-manager/not-text' })
    await expect(operations().read({ sessionId, path: 'invalid.bin' }, signal()))
      .rejects.toMatchObject({ code: 'file-manager/not-text' })
    await expect(operations().read({ sessionId, path: 'large.txt' }, signal()))
      .rejects.toMatchObject({ code: 'file-manager/too-large' })
  })

  it('rejects directory/file shape mismatches and reports read-only metadata', async () => {
    mkdirSync(join(workspace, 'src'))
    writeFileSync(join(workspace, 'note.txt'), 'one')
    const readOnly = operations({ editable: false })
    await expect(readOnly.read({ sessionId, path: 'note.txt' }, signal()))
      .resolves.toMatchObject({ editable: false })
    await expect(readOnly.read({ sessionId, path: 'src' }, signal()))
      .rejects.toMatchObject({ code: 'file-manager/not-file' })
    await expect(readOnly.list({ sessionId, path: 'note.txt' }, signal()))
      .rejects.toMatchObject({ code: 'file-manager/not-directory' })
    await expect(readOnly.read({ sessionId, path: 'missing.txt' }, signal()))
      .rejects.toMatchObject({ code: 'file-manager/not-found' })
  })

  it('rejects oversized save payloads and malformed version guards', async () => {
    writeFileSync(join(workspace, 'note.txt'), 'one')
    const api = operations()
    await expect(api.write({
      sessionId,
      path: 'note.txt',
      content: 'x'.repeat(65),
      expectedVersion: 'version',
    }, signal())).rejects.toMatchObject({ code: 'file-manager/too-large' })
    await expect(api.write({
      sessionId,
      path: 'note.txt',
      content: 'two',
      expectedVersion: '',
    }, signal())).rejects.toMatchObject({ code: 'file-manager/invalid-path' })
  })

  it('saves atomically with a version guard and workspace-write policy', async () => {
    writeFileSync(join(workspace, 'note.txt'), 'one')
    const api = operations()
    const opened = await api.read({ sessionId, path: 'note.txt' }, signal())
    const write = vi.spyOn(fs, 'writeText')

    const saved = await api.write({
      sessionId,
      path: 'note.txt',
      content: 'two',
      expectedVersion: opened.version,
    }, signal())

    expect(readFileSync(join(workspace, 'note.txt'), 'utf8')).toBe('two')
    expect(saved.version).not.toBe(opened.version)
    expect(write.mock.calls[0]?.[4]).toMatchObject({
      mode: 'workspace-write',
      workspaceRoot: realpathSync(workspace),
      sessionId,
    })
  })

  it('rejects stale saves, read-only deployments, and paths outside the workspace', async () => {
    writeFileSync(join(workspace, 'note.txt'), 'one')
    writeFileSync(join(outside, 'outside.txt'), 'outside')
    symlinkSync(join(outside, 'outside.txt'), join(workspace, 'escape.txt'))
    const api = operations()
    const opened = await api.read({ sessionId, path: 'note.txt' }, signal())
    writeFileSync(join(workspace, 'note.txt'), 'changed elsewhere')

    await expect(api.write({
      sessionId,
      path: 'note.txt',
      content: 'mine',
      expectedVersion: opened.version,
    }, signal())).rejects.toMatchObject({ code: 'file-manager/stale-version' })
    await expect(operations({ editable: false }).write({
      sessionId,
      path: 'note.txt',
      content: 'mine',
      expectedVersion: opened.version,
    }, signal())).rejects.toMatchObject({ code: 'file-manager/read-only' })
    await expect(api.read({ sessionId, path: 'escape.txt' }, signal()))
      .rejects.toMatchObject({ code: 'file-manager/outside-workspace' })
  })

  it('maps missing workspaces and cancellation to stable Remote errors', async () => {
    const unavailable = new FileManagerOperations(
      fs,
      async () => ({ meta: {} }),
      operations().config,
    )
    await expect(unavailable.list({ sessionId, path: '' }, signal()))
      .rejects.toMatchObject({ code: 'file-manager/no-workspace' })

    const controller = new AbortController()
    controller.abort()
    await expect(operations().list({ sessionId, path: '' }, controller.signal))
      .rejects.toMatchObject({ code: 'gateway/cancelled' })
  })
})
