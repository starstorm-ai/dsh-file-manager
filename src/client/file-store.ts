/** Session-scoped explorer and editor state retained across top-level tab remounts. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { editor } from 'monaco-editor'
import type { FileManagerReadValue } from '../types.ts'
import type { FileManagerClientError } from './model.ts'

/** One open editor tab, its buffer, and its last persisted baseline. */
export interface FileManagerOpenFile {
  readonly path: string
  loadRequestId: number
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
  /** Cursor, selection and scroll state retained while another file tab is active. */
  viewState?: editor.ICodeEditorViewState
}

/** Per-Session view state. File contents are intentionally memory-only. */
export interface FileManagerViewState {
  expandedPaths: string[]
  selectedPath: string | null
  treeWidth: number
  explorerVisible: boolean
  activePath: string | null
  openFiles: FileManagerOpenFile[]
}

type FileManagerViewActions = {
  setExpanded: (draft: FileManagerViewState, path: string, expanded: boolean) => void
  setTreeWidth: (draft: FileManagerViewState, value: number) => void
  setExplorerVisible: (draft: FileManagerViewState, value: boolean) => void
  activateFile: (draft: FileManagerViewState, path: string) => void
  closeFile: (draft: FileManagerViewState, path: string) => void
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
  editContent: (draft: FileManagerViewState, path: string, content: string) => void
  setEditorViewState: (
    draft: FileManagerViewState,
    path: string,
    viewState: editor.ICodeEditorViewState,
  ) => void
  startSave: (draft: FileManagerViewState, path: string, requestId: number) => void
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
  dismissFileError: (draft: FileManagerViewState, path: string) => void
}

function findFile(state: FileManagerViewState, path: string): FileManagerOpenFile | undefined {
  return state.openFiles.find(file => file.path === path)
}

function findLoad(state: FileManagerViewState, requestId: number): FileManagerOpenFile | undefined {
  return state.openFiles.find(file => file.loadRequestId === requestId)
}

function findSave(state: FileManagerViewState, requestId: number): FileManagerOpenFile | undefined {
  return state.openFiles.find(file => file.saveRequestId === requestId)
}

/** Whether an open buffer differs from its latest successful read/save baseline. */
export function isFileDirty(file: FileManagerOpenFile | null | undefined): boolean {
  return file != null && !file.loading && file.content !== file.savedContent
}

/** Create the HMR-safe handle used by the File view registration. */
export function createFileManagerViewStore(): EngineStoreHandle<FileManagerViewState, FileManagerViewActions> {
  return defineStore({
    init: (): FileManagerViewState => ({
      expandedPaths: [''],
      selectedPath: null,
      treeWidth: 280,
      explorerVisible: true,
      activePath: null,
      openFiles: [],
    }),
    actions: {
      setExpanded: (draft, path: string, expanded: boolean) => {
        const paths = new Set(draft.expandedPaths)
        if (expanded) paths.add(path)
        else paths.delete(path)
        paths.add('')
        draft.expandedPaths = [...paths]
      },
      setTreeWidth: (draft, value: number) => { draft.treeWidth = Math.max(220, Math.min(420, value)) },
      setExplorerVisible: (draft, value: boolean) => { draft.explorerVisible = value },
      activateFile: (draft, path: string) => {
        if (findFile(draft, path) === undefined) return
        draft.activePath = path
        draft.selectedPath = path
      },
      closeFile: (draft, path: string) => {
        const index = draft.openFiles.findIndex(file => file.path === path)
        if (index < 0) return
        draft.openFiles.splice(index, 1)
        if (draft.activePath !== path) return
        const next = draft.openFiles[index] ?? draft.openFiles[index - 1]
        draft.activePath = next?.path ?? null
        draft.selectedPath = next?.path ?? null
      },
      startOpen: (draft, path: string, requestId: number) => {
        draft.selectedPath = path
        draft.activePath = path
        const existing = findFile(draft, path)
        if (existing !== undefined) {
          existing.loadRequestId = requestId
          existing.loading = true
          delete existing.error
          existing.conflict = false
          return
        }
        draft.openFiles.push({
          path,
          loadRequestId: requestId,
          loading: true,
          content: '',
          savedContent: '',
          editable: false,
          saving: false,
          conflict: false,
        })
      },
      resolveOpen: (draft, requestId: number, value: FileManagerReadValue) => {
        const file = findLoad(draft, requestId)
        if (file === undefined || file.path !== value.path) return
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
        const file = findLoad(draft, requestId)
        if (file === undefined) return
        file.loading = false
        file.error = error
      },
      editContent: (draft, path: string, content: string) => {
        const file = findFile(draft, path)
        if (file === undefined || file.loading || !file.editable || file.saving) return
        file.content = content
        if (file.conflict) file.conflict = false
        delete file.error
      },
      setEditorViewState: (draft, path: string, viewState: editor.ICodeEditorViewState) => {
        const file = findFile(draft, path)
        if (file !== undefined) file.viewState = viewState
      },
      startSave: (draft, path: string, requestId: number) => {
        const file = findFile(draft, path)
        if (file === undefined || file.loading || file.saving) return
        file.saving = true
        file.saveRequestId = requestId
        delete file.error
        file.conflict = false
      },
      resolveSave: (draft, requestId: number, version: string, size: number, savedContent: string) => {
        const file = findSave(draft, requestId)
        if (file === undefined) return
        file.saving = false
        delete file.saveRequestId
        file.version = version
        file.size = size
        file.savedContent = savedContent
        delete file.error
        file.conflict = false
      },
      failSave: (draft, requestId: number, error: FileManagerClientError) => {
        const file = findSave(draft, requestId)
        if (file === undefined) return
        file.saving = false
        delete file.saveRequestId
        file.error = error
        file.conflict = error.code === 'file-manager/stale-version'
      },
      dismissFileError: (draft, path: string) => {
        const file = findFile(draft, path)
        if (file === undefined) return
        delete file.error
        file.conflict = false
      },
    },
  })
}
