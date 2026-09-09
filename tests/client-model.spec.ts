import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import type {
  FileManagerListValue,
  FileManagerReadValue,
  FileManagerWriteValue,
} from '../src/types.ts'
import {
  clientError,
  FileManagerSessionModel,
  type FileManagerRemoteAdapter,
} from '../src/client/model.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

function listValue(name: string, showHidden = false): FileManagerListValue {
  return {
    path: '',
    entries: [{ name, path: name, kind: 'file', symlink: false, size: 1 }],
    truncated: false,
    showHidden,
    editable: true,
  }
}

function unusedRemote(): FileManagerRemoteAdapter {
  return {
    list: async () => ({ ok: true, value: listValue('unused') }),
    read: async () => { throw new Error('unexpected read') },
    write: async () => { throw new Error('unexpected write') },
  }
}

describe('FileManagerSessionModel', () => {
  it('aborts a superseded directory request and ignores its late result', async () => {
    const first = deferred<RemoteResult<FileManagerListValue>>()
    const second = deferred<RemoteResult<FileManagerListValue>>()
    const signals: AbortSignal[] = []
    const list = vi.fn((_request, requestSignal: AbortSignal) => {
      signals.push(requestSignal)
      return signals.length === 1 ? first.promise : second.promise
    })
    const remote = { ...unusedRemote(), list }
    const model = new FileManagerSessionModel(SessionId('race'), remote)

    const oldLoad = model.loadDirectory('', false, true)
    const newLoad = model.loadDirectory('', true, true)
    expect(signals[0]?.aborted).toBe(true)
    second.resolve({ ok: true, value: listValue('.new', true) })
    await newLoad
    first.resolve({ ok: true, value: listValue('old') })
    await oldLoad

    expect(model.snapshot.getSnapshot().directories['']).toMatchObject({
      status: 'ready',
      showHidden: true,
      entries: [{ name: '.new' }],
    })
  })

  it('reuses a ready default directory and reloads when the explicit filter changes', async () => {
    const list = vi.fn(async (request): Promise<RemoteResult<FileManagerListValue>> => ({
      ok: true,
      value: listValue(request.showHidden ? '.hidden' : 'visible', request.showHidden ?? false),
    }))
    const model = new FileManagerSessionModel(SessionId('cache'), { ...unusedRemote(), list })
    await model.loadDirectory('')
    await model.loadDirectory('')
    await model.loadDirectory('', true)
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('cancels the previous file read and all work on dispose', async () => {
    const reads: AbortSignal[] = []
    const read = vi.fn((_request, requestSignal: AbortSignal) => {
      reads.push(requestSignal)
      return new Promise<RemoteResult<FileManagerReadValue>>((_resolve, reject) => {
        requestSignal.addEventListener('abort', () => {
          reject(new DOMException('cancelled', 'AbortError'))
        }, { once: true })
      })
    })
    const model = new FileManagerSessionModel(SessionId('read'), { ...unusedRemote(), read })
    const first = model.readFile('a.ts').catch(error => error)
    const second = model.readFile('b.ts').catch(error => error)
    expect(reads[0]?.aborted).toBe(true)
    model.dispose()
    expect(reads[1]?.aborted).toBe(true)
    expect((await first).name).toBe('AbortError')
    expect((await second).name).toBe('AbortError')
    await expect(model.readFile('again.ts')).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('forwards guarded writes and normalizes Remote errors for state snapshots', async () => {
    const write = vi.fn(async (): Promise<RemoteResult<FileManagerWriteValue>> => ({
      ok: true,
      value: { path: 'a.ts', version: 'v2', size: 3 },
    }))
    const model = new FileManagerSessionModel(SessionId('write'), { ...unusedRemote(), write })
    await expect(model.writeFile('a.ts', 'new', 'v1')).resolves.toEqual({
      path: 'a.ts', version: 'v2', size: 3,
    })
    expect(write.mock.calls[0]?.[0]).toMatchObject({
      path: 'a.ts', content: 'new', expectedVersion: 'v1',
    })
    expect(clientError(new RemoteError('gateway/cancelled', 'cancelled', {}))).toEqual({
      code: 'gateway/cancelled', message: 'cancelled',
    })
  })
})
