/** Workspace-bound filesystem operations behind the Host Remote service. */

import type { FileSystem, FsInfo, FsTarget } from '@deepseek-ai/dsh-fs'
import { FsError, FsVersion } from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type {
  FileManagerEntry,
  FileManagerListRequest,
  FileManagerListValue,
  FileManagerReadRequest,
  FileManagerReadValue,
  FileManagerWriteRequest,
  FileManagerWriteValue,
} from '../types.ts'

/** Resolved deployment limits used by the operation layer. */
export interface ResolvedFileManagerConfig {
  readonly maxFileBytes: number
  readonly maxEntriesPerDirectory: number
  readonly showHiddenByDefault: boolean
  readonly editable: boolean
}

/** Minimal cold Session shape needed to establish the workspace root. */
export interface FileManagerSessionInspection {
  readonly meta: { readonly cwd?: string }
}

/** Replaceable Session inspector used by production and hermetic tests. */
export type FileManagerSessionInspector = (
  sessionId: SessionId,
  signal?: AbortSignal,
) => Promise<FileManagerSessionInspection>

interface WorkspaceTarget {
  readonly root: FsTarget
  readonly target: FsTarget
  readonly path: string
}

const MAX_WIRE_PATH_LENGTH = 16_384
const MAX_VERSION_LENGTH = 16_384

/** Join two already validated wire paths without exposing platform separators. */
export function joinWirePath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

/** Validate and normalize one browser-supplied root-relative path. */
export function validateWirePath(path: string, allowRoot: boolean): string {
  if (path.length > MAX_WIRE_PATH_LENGTH
    || path.includes('\0')
    || path.includes('\\')
    || path.startsWith('/')
    || /^[A-Za-z]:/.test(path)
    || (!allowRoot && path === '')) {
    throw new RemoteError('file-manager/invalid-path', 'invalid workspace-relative path', { path })
  }
  if (path === '') return ''
  const segments = path.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new RemoteError('file-manager/invalid-path', 'invalid workspace-relative path', { path })
  }
  return segments.join('/')
}

/** Host filesystem implementation with no browser-authoritative absolute paths. */
export class FileManagerOperations {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true })
  private readonly encoder = new TextEncoder()

  constructor(
    private readonly fs: FileSystem,
    private readonly inspectSession: FileManagerSessionInspector,
    readonly config: ResolvedFileManagerConfig,
  ) {}

  /** List one level, filtering hidden and root-escaping entries. */
  async list(request: FileManagerListRequest, signal: AbortSignal): Promise<FileManagerListValue> {
    const path = validateWirePath(request.path, true)
    const workspace = await this.workspaceTarget(request.sessionId, path, signal)
    try {
      const info = await this.statRequired(workspace.target, path, signal)
      if (info.type !== 'directory') {
        throw new RemoteError('file-manager/not-directory', 'the requested path is not a directory', { path })
      }
      const listed = await this.fs.listDir(workspace.target, signal)
      const showHidden = request.showHidden ?? this.config.showHiddenByDefault
      const entries: FileManagerEntry[] = []
      let truncated = false
      for (const entry of listed) {
        this.throwIfAborted(signal)
        if (!validEntryName(entry.name) || (!showHidden && entry.name.startsWith('.'))) continue
        // listDir returns a resolved target. Canonical containment is the
        // authoritative symlink-escape check, independent of path spelling.
        if (!this.fs.contains(workspace.root, entry.target)) continue
        const childPath = joinWirePath(path, entry.name)
        if (entries.length >= this.config.maxEntriesPerDirectory) {
          truncated = true
          continue
        }
        let symlink = false
        try {
          const pathInfo = await this.fs.lstat(
            entry.name,
            { cwd: this.fs.processPath(workspace.target) },
            signal,
          )
          if (pathInfo === undefined) continue
          symlink = pathInfo.type === 'symlink'
        } catch (error: unknown) {
          if (isNotFound(error)) continue
          throw error
        }
        entries.push({
          name: entry.name,
          path: childPath,
          kind: entry.type,
          symlink,
          ...(entry.size === undefined ? {} : { size: entry.size }),
        })
      }
      entries.sort(compareEntries)
      return { path, entries, truncated, showHidden, editable: this.config.editable }
    } catch (error: unknown) {
      throw this.mapFsFailure(error, path, signal)
    }
  }

  /** Read one whole, stable UTF-8 file under the configured byte cap. */
  async read(request: FileManagerReadRequest, signal: AbortSignal): Promise<FileManagerReadValue> {
    const path = validateWirePath(request.path, false)
    const workspace = await this.workspaceTarget(request.sessionId, path, signal)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const before = await this.statRequired(workspace.target, path, signal)
        this.assertReadableFile(before, path)
        const bytes = await this.fs.readBytes(workspace.target, signal, this.config.maxFileBytes)
        let content: string
        try {
          content = this.decoder.decode(bytes)
        } catch {
          throw new RemoteError('file-manager/not-text', 'the requested file is not valid UTF-8 text', { path })
        }
        if (content.includes('\0')) {
          throw new RemoteError('file-manager/not-text', 'the requested file contains binary data', { path })
        }
        const after = await this.statRequired(workspace.target, path, signal)
        this.assertReadableFile(after, path)
        if (before.version !== after.version) {
          if (attempt === 0) continue
          throw new RemoteError('file-manager/changed', 'the file changed while it was being read', { path })
        }
        return {
          path,
          content,
          version: String(after.version),
          size: bytes.byteLength,
          editable: this.config.editable,
        }
      } catch (error: unknown) {
        throw this.mapFsFailure(error, path, signal)
      }
    }
    // The loop either returns or throws on its second pass.
    throw new RemoteError('file-manager/changed', 'the file changed while it was being read', { path })
  }

  /** Atomically replace one existing file if its read version is still current. */
  async write(request: FileManagerWriteRequest, signal: AbortSignal): Promise<FileManagerWriteValue> {
    const path = validateWirePath(request.path, false)
    if (!this.config.editable) {
      throw new RemoteError('file-manager/read-only', 'this File Manager is configured read-only', { path })
    }
    if (request.expectedVersion === '' || request.expectedVersion.length > MAX_VERSION_LENGTH) {
      throw new RemoteError('file-manager/invalid-path', 'invalid file version token', { path })
    }
    const bytes = this.encoder.encode(request.content).byteLength
    if (bytes > this.config.maxFileBytes) {
      throw new RemoteError('file-manager/too-large', 'the edited file exceeds the configured byte limit', {
        path,
        maxBytes: this.config.maxFileBytes,
        actualBytes: bytes,
      })
    }
    const workspace = await this.workspaceTarget(request.sessionId, path, signal)
    try {
      const info = await this.statRequired(workspace.target, path, signal)
      if (info.type !== 'file') {
        throw new RemoteError('file-manager/not-file', 'only existing regular files can be saved', { path })
      }
      const policy: SandboxExecutionPolicy = {
        mode: 'workspace-write',
        workspaceRoot: this.fs.processPath(workspace.root),
        sessionId: request.sessionId,
      }
      const outcome = await this.fs.writeText(
        workspace.target,
        request.content,
        { kind: 'replaceIfVersion', version: FsVersion(request.expectedVersion) },
        signal,
        policy,
      )
      return { path, version: String(outcome.version), size: bytes }
    } catch (error: unknown) {
      throw this.mapFsFailure(error, path, signal)
    }
  }

  private async workspaceTarget(
    sessionId: SessionId,
    path: string,
    signal: AbortSignal,
  ): Promise<WorkspaceTarget> {
    this.throwIfAborted(signal)
    let cwd: string | undefined
    try {
      const inspection = await this.inspectSession(sessionId, signal)
      cwd = inspection.meta.cwd
    } catch (error: unknown) {
      if (signal.aborted || isAborted(error)) {
        throw new RemoteError('gateway/cancelled', 'file operation was cancelled', {})
      }
      throw new RemoteError('file-manager/no-workspace', 'the Session workspace is unavailable', { sessionId })
    }
    if (cwd === undefined || cwd.trim() === '') {
      throw new RemoteError('file-manager/no-workspace', 'the Session has no workspace directory', { sessionId })
    }
    let root: FsTarget
    try {
      root = await this.fs.resolve(cwd, { signal })
      const rootInfo = await this.fs.stat(root, signal)
      if (rootInfo?.type !== 'directory') {
        throw new RemoteError('file-manager/no-workspace', 'the Session workspace directory is unavailable', { sessionId })
      }
    } catch (error: unknown) {
      if (error instanceof RemoteError) throw error
      if (signal.aborted || isAborted(error)) {
        throw new RemoteError('gateway/cancelled', 'file operation was cancelled', {})
      }
      throw new RemoteError('file-manager/no-workspace', 'the Session workspace directory is unavailable', { sessionId })
    }
    try {
      const target = path === ''
        ? root
        : await this.fs.resolve(path, { cwd: this.fs.processPath(root), signal })
      if (!this.fs.contains(root, target)) {
        throw new RemoteError('file-manager/outside-workspace', 'the requested path leaves the Session workspace', { path })
      }
      return { root, target, path }
    } catch (error: unknown) {
      if (error instanceof RemoteError) throw error
      throw this.mapFsFailure(error, path, signal)
    }
  }

  private async statRequired(target: FsTarget, path: string, signal: AbortSignal): Promise<FsInfo> {
    const info = await this.fs.stat(target, signal)
    if (info === undefined) {
      throw new RemoteError('file-manager/not-found', 'the requested workspace path no longer exists', { path })
    }
    return info
  }

  private assertReadableFile(info: FsInfo, path: string): void {
    if (info.type !== 'file') {
      throw new RemoteError('file-manager/not-file', 'the requested path is not a regular file', { path })
    }
    if (info.size !== undefined && info.size > this.config.maxFileBytes) {
      throw new RemoteError('file-manager/too-large', 'the requested file exceeds the configured byte limit', {
        path,
        maxBytes: this.config.maxFileBytes,
        actualBytes: info.size,
      })
    }
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new RemoteError('gateway/cancelled', 'file operation was cancelled', {})
    }
  }

  private mapFsFailure(error: unknown, path: string, signal: AbortSignal): Error {
    if (error instanceof RemoteError) return error
    if (signal.aborted || isAborted(error)) {
      return new RemoteError('gateway/cancelled', 'file operation was cancelled', {})
    }
    if (error instanceof FsError) {
      switch (error.code) {
        case 'FS_NOT_FOUND':
          return new RemoteError('file-manager/not-found', 'the requested workspace path no longer exists', { path })
        case 'FS_NOT_DIRECTORY':
          return new RemoteError('file-manager/not-directory', 'the requested path is not a directory', { path })
        case 'FS_NOT_REGULAR_FILE':
          return new RemoteError('file-manager/not-file', 'the requested path is not a regular file', { path })
        case 'FS_NOT_TEXT':
          return new RemoteError('file-manager/not-text', 'the requested file is not UTF-8 text', { path })
        case 'FS_TOO_LARGE':
          return new RemoteError('file-manager/too-large', 'the requested file exceeds the configured byte limit', {
            path,
            maxBytes: this.config.maxFileBytes,
          })
        case 'FS_PERMISSION_DENIED':
        case 'FS_SANDBOX_DENIED':
          return new RemoteError('file-manager/permission-denied', 'permission was denied for this workspace path', { path })
        case 'FS_STALE_VERSION':
        case 'FS_NOT_OBSERVED':
          return new RemoteError('file-manager/stale-version', 'the file changed since it was opened', { path })
        case 'FS_ABORTED':
          return new RemoteError('gateway/cancelled', 'file operation was cancelled', {})
        case 'FS_IO_ERROR':
        case 'FS_AMBIGUOUS_EDIT':
        case 'FS_EDIT_NOT_FOUND':
          return new RemoteError('file-manager/io', 'the filesystem operation failed', { path })
      }
    }
    return new RemoteError('file-manager/io', 'the filesystem operation failed', { path })
  }
}

function validEntryName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..'
    && !name.includes('/') && !name.includes('\\') && !name.includes('\0')
}

function compareEntries(left: FileManagerEntry, right: FileManagerEntry): number {
  const rank = (kind: FileManagerEntry['kind']): number => kind === 'directory' ? 0 : kind === 'file' ? 1 : 2
  return rank(left.kind) - rank(right.kind)
    || left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })
}

function isAborted(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError')
}

function isNotFound(error: unknown): boolean {
  return error instanceof FsError && error.code === 'FS_NOT_FOUND'
}
