import { describe, expect, it } from 'vitest'
import type { editor } from 'monaco-editor'
import { flattenExplorerRows } from '../src/client/Explorer.tsx'
import { createFileManagerViewStore, isActiveFileDirty } from '../src/client/file-store.ts'
import { languageForPath, languageLabel } from '../src/client/language.ts'
import {
  fileManagerErrorKey,
  fileManagerErrorText,
  type FileManagerTranslate,
} from '../src/client/locales.ts'
import { normalizeMonacoColor } from '../src/client/monaco-theme.ts'
import type { FileManagerModelSnapshot } from '../src/client/model.ts'

describe('File Manager view state', () => {
  it('keeps editor dirtiness against the latest successful baseline', () => {
    const instance = createFileManagerViewStore().create('session')
    instance.actions.startOpen('src/index.ts', 1)
    instance.actions.resolveOpen(1, {
      path: 'src/index.ts',
      content: 'one',
      version: 'v1',
      size: 3,
      editable: true,
    })
    expect(isActiveFileDirty(instance.getSnapshot().activeFile)).toBe(false)

    instance.actions.editContent('two')
    expect(isActiveFileDirty(instance.getSnapshot().activeFile)).toBe(true)
    instance.actions.startSave(2)
    instance.actions.resolveSave(2, 'v2', 3, 'two')
    expect(isActiveFileDirty(instance.getSnapshot().activeFile)).toBe(false)
    expect(instance.getSnapshot().activeFile).toMatchObject({ version: 'v2', content: 'two' })
  })

  it('retains a dirty buffer and exposes a stale-version conflict', () => {
    const instance = createFileManagerViewStore().create('session')
    instance.actions.startOpen('README.md', 1)
    instance.actions.resolveOpen(1, {
      path: 'README.md', content: 'old', version: 'v1', size: 3, editable: true,
    })
    instance.actions.editContent('mine')
    instance.actions.startSave(2)
    instance.actions.failSave(2, {
      code: 'file-manager/stale-version',
      message: 'changed elsewhere',
    })

    expect(instance.getSnapshot().activeFile).toMatchObject({
      content: 'mine',
      savedContent: 'old',
      saving: false,
      conflict: true,
    })
    expect(isActiveFileDirty(instance.getSnapshot().activeFile)).toBe(true)
  })

  it('retains Monaco cursor, selection, and scroll state only for the active file', () => {
    const instance = createFileManagerViewStore().create('session')
    instance.actions.startOpen('src/index.ts', 1)
    instance.actions.resolveOpen(1, {
      path: 'src/index.ts', content: 'one', version: 'v1', size: 3, editable: true,
    })
    const viewState: editor.ICodeEditorViewState = {
      cursorState: [{
        inSelectionMode: false,
        selectionStart: { lineNumber: 2, column: 3 },
        position: { lineNumber: 2, column: 3 },
      }],
      viewState: {
        scrollLeft: 4,
        scrollTop: 12,
        scrollTopWithoutViewZones: 12,
        firstPosition: { lineNumber: 2, column: 1 },
        firstPositionDeltaTop: 0,
      },
      contributionsState: {},
    }
    instance.actions.setEditorViewState('other.ts', viewState)
    expect(instance.getSnapshot().activeFile?.viewState).toBeUndefined()
    instance.actions.setEditorViewState('src/index.ts', viewState)
    expect(instance.getSnapshot().activeFile?.viewState).toEqual(viewState)
  })

  it('ignores late open and save completions', () => {
    const instance = createFileManagerViewStore().create('session')
    instance.actions.startOpen('old.ts', 1)
    instance.actions.startOpen('new.ts', 2)
    instance.actions.resolveOpen(1, {
      path: 'old.ts', content: 'old', version: 'v1', size: 3, editable: true,
    })
    expect(instance.getSnapshot().activeFile).toMatchObject({ path: 'new.ts', loading: true })

    instance.actions.resolveOpen(2, {
      path: 'new.ts', content: 'new', version: 'v2', size: 3, editable: true,
    })
    instance.actions.startSave(3)
    instance.actions.resolveSave(999, 'wrong', 0, 'wrong')
    expect(instance.getSnapshot().activeFile).toMatchObject({ version: 'v2', saving: true })
  })

  it('flattens only expanded directory branches', () => {
    const snapshot: FileManagerModelSnapshot = {
      directories: {
        '': {
          status: 'ready',
          entries: [
            { name: 'src', path: 'src', kind: 'directory', symlink: false },
            { name: 'README.md', path: 'README.md', kind: 'file', symlink: false },
          ],
          truncated: false,
          showHidden: false,
          editable: true,
        },
        src: {
          status: 'ready',
          entries: [{ name: 'index.ts', path: 'src/index.ts', kind: 'file', symlink: false }],
          truncated: false,
          showHidden: false,
          editable: true,
        },
      },
    }
    expect(flattenExplorerRows(snapshot.directories, new Set([''])).map(row => row.entry.path))
      .toEqual(['src', 'README.md'])
    expect(flattenExplorerRows(snapshot.directories, new Set(['', 'src'])).map(row => row.entry.path))
      .toEqual(['src', 'src/index.ts', 'README.md'])
  })

  it('maps common filenames and extensions to Monaco languages', () => {
    expect(languageForPath('src/App.TSX')).toBe('typescript')
    expect(languageForPath('tsconfig.json')).toBe('json')
    expect(languageForPath('src/native.c')).toBe('cpp')
    expect(languageForPath('Dockerfile')).toBe('dockerfile')
    expect(languageForPath('.gitignore')).toBe('plaintext')
    expect(languageForPath('unknown.data')).toBe('plaintext')
    expect(languageLabel('typescript')).toBe('TypeScript')
  })

  it('expands CSS shorthand colors for Monaco token themes', () => {
    expect(normalizeMonacoColor('#fff')).toBe('#ffffff')
    expect(normalizeMonacoColor('#0f08')).toBe('#00ff0088')
    expect(normalizeMonacoColor('#1f2023')).toBe('#1f2023')
    expect(normalizeMonacoColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
  })

  it('maps Host error codes to stable localized message keys', () => {
    expect(fileManagerErrorKey('file-manager/stale-version')).toBe('error.stale')
    expect(fileManagerErrorKey('file-manager/outside-workspace')).toBe('error.outsideWorkspace')
    expect(fileManagerErrorKey('unknown')).toBe('error.generic')
  })

  it('shows diagnostics for an unknown client or transport failure', () => {
    const t = ((key: string) => key) as FileManagerTranslate
    expect(fileManagerErrorText({
      code: 'gateway/internal',
      message: 'client api: fileManager/list failed',
    }, t)).toBe('error.generic [gateway/internal] client api: fileManager/list failed')
  })
})
