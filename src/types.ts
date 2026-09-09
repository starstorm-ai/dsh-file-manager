/** Browser-safe request, response, and failure vocabulary for the File Manager Remote. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Kind of a workspace entry presented by the explorer. */
export type FileManagerEntryKind = 'file' | 'directory' | 'other'

/** One direct child of a listed workspace directory. */
export interface FileManagerEntry {
  /** Basename of the child. */
  readonly name: string
  /** Normalized, root-relative path using forward slashes. */
  readonly path: string
  /** Resolved kind of the child. */
  readonly kind: FileManagerEntryKind
  /** Whether the path itself is a symbolic link. */
  readonly symlink: boolean
  /** Byte size when the backend reports it. */
  readonly size?: number
}

/** Request one directory level from a Session workspace. */
export interface FileManagerListRequest {
  readonly sessionId: SessionId
  /** Empty string addresses the workspace root. */
  readonly path: string
  /** Include dot-prefixed entries for this request. */
  readonly showHidden?: boolean
}

/** Bounded directory listing. */
export interface FileManagerListValue {
  readonly path: string
  readonly entries: readonly FileManagerEntry[]
  readonly truncated: boolean
  /** Effective visibility mode used for this listing. */
  readonly showHidden: boolean
  /** Whether this deployment permits explicit user saves. */
  readonly editable: boolean
}

/** Request one complete UTF-8 text file. */
export interface FileManagerReadRequest {
  readonly sessionId: SessionId
  readonly path: string
}

/** Complete editor buffer and its opaque stale-write guard. */
export interface FileManagerReadValue {
  readonly path: string
  readonly content: string
  readonly version: string
  readonly size: number
  readonly editable: boolean
}

/** Guarded replacement of one previously read text file. */
export interface FileManagerWriteRequest {
  readonly sessionId: SessionId
  readonly path: string
  readonly content: string
  readonly expectedVersion: string
}

/** Result of one atomically published replacement. */
export interface FileManagerWriteValue {
  readonly path: string
  readonly version: string
  readonly size: number
}

/** Error details shared by path-addressed failures. */
export interface FileManagerPathErrorDetails {
  readonly path: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'file-manager/no-workspace': { readonly sessionId: SessionId }
    'file-manager/invalid-path': FileManagerPathErrorDetails
    'file-manager/outside-workspace': FileManagerPathErrorDetails
    'file-manager/not-found': FileManagerPathErrorDetails
    'file-manager/not-directory': FileManagerPathErrorDetails
    'file-manager/not-file': FileManagerPathErrorDetails
    'file-manager/not-text': FileManagerPathErrorDetails
    'file-manager/too-large': FileManagerPathErrorDetails & {
      readonly maxBytes: number
      readonly actualBytes?: number
    }
    'file-manager/read-only': FileManagerPathErrorDetails
    'file-manager/stale-version': FileManagerPathErrorDetails
    'file-manager/changed': FileManagerPathErrorDetails
    'file-manager/permission-denied': FileManagerPathErrorDetails
    'file-manager/io': FileManagerPathErrorDetails
  }
}
