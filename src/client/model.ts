/** React-free per-Session directory cache and Remote request ownership. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  FileManagerListRequest,
  FileManagerListValue,
  FileManagerReadRequest,
  FileManagerReadValue,
  FileManagerWriteRequest,
  FileManagerWriteValue,
} from '../types.ts'

/** Serializable error snapshot retained by the tree or editor state. */
export interface FileManagerClientError {
  readonly code: string
  readonly message: string
}

/** State of one lazy directory request. */
export type FileManagerDirectoryState =
  | { readonly status: 'loading'; readonly showHidden?: boolean }
  | {
    readonly status: 'ready'
    readonly entries: FileManagerListValue['entries']
    readonly truncated: boolean
    readonly showHidden: boolean
    readonly editable: boolean
  }
  | { readonly status: 'error'; readonly error: FileManagerClientError; readonly showHidden?: boolean }

/** Observable directory cache for one Session. */
export interface FileManagerModelSnapshot {
  readonly directories: Readonly<Record<string, FileManagerDirectoryState>>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SessionStandardProps {
    /** Lazy directory cache for this Session's workspace. */
    useFileManager: SnapshotSelectorHook<FileManagerModelSnapshot>
  }
}

/** Generated Remote subset consumed by the model. */
export interface FileManagerRemoteAdapter {
  list(request: FileManagerListRequest, signal: AbortSignal): Promise<RemoteResult<FileManagerListValue>>
  read(request: FileManagerReadRequest, signal: AbortSignal): Promise<RemoteResult<FileManagerReadValue>>
  write(request: FileManagerWriteRequest, signal: AbortSignal): Promise<RemoteResult<FileManagerWriteValue>>
}

/** Owns cancellation and cache generations for one logical Client Session. */
export class FileManagerSessionModel {
  readonly snapshot: SnapshotStore<FileManagerModelSnapshot> = createSnapshotStore({ directories: {} })

  private readonly directoryRequests = new Map<string, { controller: AbortController; generation: number }>()
  private readRequest: AbortController | undefined
  private readonly writeRequests = new Set<AbortController>()
  private generation = 0
  private disposed = false

  constructor(
    private readonly sessionId: FileManagerListRequest['sessionId'],
    private readonly remote: FileManagerRemoteAdapter,
  ) {}

  /** Load or refresh one directory without allowing an older response to win. */
  async loadDirectory(path: string, showHidden?: boolean, force = false): Promise<void> {
    if (this.disposed) return
    const current = this.snapshot.getSnapshot().directories[path]
    if (!force && current !== undefined) {
      if (current.status === 'loading' && current.showHidden === showHidden) return
      if (current.status === 'ready'
        && (showHidden === undefined || current.showHidden === showHidden)) return
    }

    this.directoryRequests.get(path)?.controller.abort()
    const controller = new AbortController()
    const generation = ++this.generation
    this.directoryRequests.set(path, { controller, generation })
    this.setDirectory(path, { status: 'loading', ...(showHidden === undefined ? {} : { showHidden }) })
    try {
      const result = await this.remote.list(
        { sessionId: this.sessionId, path, ...(showHidden === undefined ? {} : { showHidden }) },
        controller.signal,
      )
      if (!this.isCurrentDirectory(path, controller, generation)) return
      if (!result.ok) {
        if (result.error.code === 'gateway/cancelled') return
        this.setDirectory(path, {
          status: 'error',
          error: clientError(result.error),
          ...(showHidden === undefined ? {} : { showHidden }),
        })
        return
      }
      this.setDirectory(path, {
        status: 'ready',
        entries: result.value.entries,
        truncated: result.value.truncated,
        showHidden: result.value.showHidden,
        editable: result.value.editable,
      })
    } catch (error: unknown) {
      if (!this.isCurrentDirectory(path, controller, generation) || controller.signal.aborted) return
      this.setDirectory(path, {
        status: 'error',
        error: clientError(error),
        ...(showHidden === undefined ? {} : { showHidden }),
      })
    } finally {
      if (this.isCurrentDirectory(path, controller, generation)) this.directoryRequests.delete(path)
    }
  }

  /** Drop every cached directory and abort its in-flight request. */
  resetDirectories(): void {
    for (const request of this.directoryRequests.values()) request.controller.abort()
    this.directoryRequests.clear()
    this.snapshot.set({ directories: {} })
  }

  /** Read one file, superseding any earlier file selection. */
  async readFile(path: string): Promise<FileManagerReadValue> {
    this.ensureLive()
    this.readRequest?.abort()
    const controller = new AbortController()
    this.readRequest = controller
    try {
      const result = await this.remote.read({ sessionId: this.sessionId, path }, controller.signal)
      if (!result.ok) throw result.error
      return result.value
    } finally {
      if (this.readRequest === controller) this.readRequest = undefined
    }
  }

  /** Save one guarded editor snapshot. */
  async writeFile(
    path: string,
    content: string,
    expectedVersion: string,
  ): Promise<FileManagerWriteValue> {
    this.ensureLive()
    const controller = new AbortController()
    this.writeRequests.add(controller)
    try {
      const result = await this.remote.write(
        { sessionId: this.sessionId, path, content, expectedVersion },
        controller.signal,
      )
      if (!result.ok) throw result.error
      return result.value
    } finally {
      this.writeRequests.delete(controller)
    }
  }

  /** Abort all activity when the Session binding or plugin goes away. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.resetDirectories()
    this.readRequest?.abort()
    this.readRequest = undefined
    for (const request of this.writeRequests) request.abort()
    this.writeRequests.clear()
  }

  private setDirectory(path: string, value: FileManagerDirectoryState): void {
    const current = this.snapshot.getSnapshot()
    this.snapshot.set({ directories: { ...current.directories, [path]: value } })
  }

  private isCurrentDirectory(path: string, controller: AbortController, generation: number): boolean {
    const current = this.directoryRequests.get(path)
    return !this.disposed && current?.controller === controller && current.generation === generation
  }

  private ensureLive(): void {
    if (this.disposed) throw new DOMException('File Manager Session was disposed', 'AbortError')
  }
}

/** Convert Remote and transport failures without retaining mutable error objects. */
export function clientError(error: unknown): FileManagerClientError {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : 'file-manager/io'
    return { code, message: error.message }
  }
  return { code: 'file-manager/io', message: String(error) }
}
