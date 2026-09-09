/** Session-scoped explorer and editor state retained across top-level tab remounts. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { editor } from 'monaco-editor'
import type { FileManagerReadValue } from '../types.ts'
import type { FileManagerClientError } from './model.ts'

/** Current editor buffer and its last persisted baseline. */
export interface FileManagerActiveFile {
  readonly path: string
  readonly loadRequestId: number
  loading: boolean
  content: string
  savedContent: string
  version?: string
  size?: number
  editable: boolean
  saving: boolean
  saveRequestId?: number
  error?: FileManagerClientError
  conflict: boolean
  /** Cursor, selection and scroll state retained when the top-level tab remounts. */
  viewState?: editor.ICodeEditorViewState
}

/** Per-Session view state. File content is intentionally memory-only. */
export interface FileManagerViewState {
  expandedPaths: string[]
  selectedPath: string | null
  showHidden: boolean | null
  treeWidth: number
  explorerVisible: boolean
  activeFile: FileManagerActiveFile | null
}

type FileManagerViewActions = {
  setExpanded: (draft: FileManagerViewState, path: string, expanded: boolean) => void
  setSelected: (draft: FileManagerViewState, path: string | null) => void
  setShowHidden: (draft: FileManagerViewState, value: boolean) => void
  setTreeWidth: (draft: FileManagerViewState, value: number) => void
  setExplorerVisible: (draft: FileManagerViewState, value: boolean) => void
  startOpen: (draft: FileManagerViewState, path: string, requestId: number) => void
  resolveOpen: (
    draft: FileManagerViewState,
    requestId: number,
    value: FileManagerReadValue,
  ) => void
  failOpen: (
    draft: FileManagerViewState,
    requestId: number,
    error: FileManagerClientError,
  ) => void
  editContent: (draft: FileManagerViewState, content: string) => void
  setEditorViewState: (
    draft: FileManagerViewState,
    path: string,
    viewState: editor.ICodeEditorViewState,
  ) => void
  startSave: (draft: FileManagerViewState, requestId: number) => void
  resolveSave: (
    draft: FileManagerViewState,
    requestId: number,
    version: string,
    size: number,
    savedContent: string,
  ) => void
  failSave: (
    draft: FileManagerViewState,
    requestId: number,
    error: FileManagerClientError,
  ) => void
  dismissFileError: (draft: FileManagerViewState) => void
}

/** Whether the active buffer differs from the successful read/save baseline. */
export function isActiveFileDirty(file: FileManagerActiveFile | null): boolean {
  return file !== null && !file.loading && file.content !== file.savedContent
}

/** Create the HMR-safe handle used by the File view registration. */
export function createFileManagerViewStore(): EngineStoreHandle<FileManagerViewState, FileManagerViewActions> {
  return defineStore({
    init: (): FileManagerViewState => ({
      expandedPaths: [''],
      selectedPath: null,
      showHidden: null,
      treeWidth: 280,
      explorerVisible: true,
      activeFile: null,
    }),
    actions: {
      setExpanded: (draft, path: string, expanded: boolean) => {
        const paths = new Set(draft.expandedPaths)
        if (expanded) paths.add(path)
        else paths.delete(path)
        paths.add('')
        draft.expandedPaths = [...paths]
      },
      setSelected: (draft, path: string | null) => { draft.selectedPath = path },
      setShowHidden: (draft, value: boolean) => { draft.showHidden = value },
      setTreeWidth: (draft, value: number) => { draft.treeWidth = Math.max(220, Math.min(420, value)) },
      setExplorerVisible: (draft, value: boolean) => { draft.explorerVisible = value },
      startOpen: (draft, path: string, requestId: number) => {
        draft.selectedPath = path
        draft.activeFile = {
          path,
          loadRequestId: requestId,
          loading: true,
          content: '',
          savedContent: '',
          editable: false,
          saving: false,
          conflict: false,
        }
      },
      resolveOpen: (draft, requestId: number, value: FileManagerReadValue) => {
        const file = draft.activeFile
        if (file === null || file.loadRequestId !== requestId || file.path !== value.path) return
        file.loading = false
        file.content = value.content
        file.savedContent = value.content
        file.version = value.version
        file.size = value.size
        file.editable = value.editable
        delete file.error
        file.conflict = false
      },
      failOpen: (draft, requestId: number, error: FileManagerClientError) => {
        const file = draft.activeFile
        if (file === null || file.loadRequestId !== requestId) return
        file.loading = false
        file.error = error
      },
      editContent: (draft, content: string) => {
        const file = draft.activeFile
        if (file === null || file.loading || !file.editable || file.saving) return
        file.content = content
        if (file.conflict) file.conflict = false
        delete file.error
      },
      setEditorViewState: (draft, path: string, viewState: editor.ICodeEditorViewState) => {
        const file = draft.activeFile
        if (file === null || file.path !== path) return
        file.viewState = viewState
      },
      startSave: (draft, requestId: number) => {
        const file = draft.activeFile
        if (file === null || file.loading || file.saving) return
        file.saving = true
        file.saveRequestId = requestId
        delete file.error
        file.conflict = false
      },
      resolveSave: (draft, requestId: number, version: string, size: number, savedContent: string) => {
        const file = draft.activeFile
        if (file === null || file.saveRequestId !== requestId) return
        file.saving = false
        delete file.saveRequestId
        file.version = version
        file.size = size
        file.savedContent = savedContent
        delete file.error
        file.conflict = false
      },
      failSave: (draft, requestId: number, error: FileManagerClientError) => {
        const file = draft.activeFile
        if (file === null || file.saveRequestId !== requestId) return
        file.saving = false
        delete file.saveRequestId
        file.error = error
        file.conflict = error.code === 'file-manager/stale-version'
      },
      dismissFileError: (draft) => {
        const file = draft.activeFile
        if (file === null) return
        delete file.error
        file.conflict = false
      },
    },
  })
}
