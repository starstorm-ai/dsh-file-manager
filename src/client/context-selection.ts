/** Session-keyed exact Monaco selections exposed to optional context consumers. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface FileManagerSelectionRange {
  readonly startLine: number
  readonly startColumn: number
  readonly endLine: number
  readonly endColumn: number
}

export interface FileManagerContextSelection {
  readonly sessionId: SessionId
  readonly path: string
  readonly language: string
  readonly text: string
  readonly range: FileManagerSelectionRange
  /** Changes whenever Monaco's selected buffer revision changes. */
  readonly revision: string
}

export type FileManagerContextSelectionUpdate = Omit<FileManagerContextSelection, 'sessionId'>

/** Small UI-owned registry; it retains the last selection while the File view is unmounted. */
export class FileManagerContextSelections {
  private readonly values = new Map<SessionId, FileManagerContextSelection>()

  publish(selection: FileManagerContextSelection): void {
    if (selection.text.length === 0) {
      this.values.delete(selection.sessionId)
      return
    }
    this.values.set(selection.sessionId, structuredClone(selection))
  }

  get(sessionId: SessionId): FileManagerContextSelection | undefined {
    return this.values.get(sessionId)
  }

  clear(sessionId: SessionId): void {
    this.values.delete(sessionId)
  }

  dispose(): void {
    this.values.clear()
  }
}
