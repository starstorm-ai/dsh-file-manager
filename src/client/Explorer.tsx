/** Accessible flattened projection of the lazy directory cache. */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { FileManagerEntry } from '../types.ts'
import type { FileManagerDirectoryState, FileManagerModelSnapshot } from './model.ts'
import { fileManagerErrorText, type FileManagerTranslate } from './locales.ts'
import css from './styles.module.css'

interface ExplorerRow {
  readonly entry: FileManagerEntry
  readonly depth: number
  readonly parent: string
}

export interface ExplorerProps {
  readonly snapshot: FileManagerModelSnapshot
  readonly expandedPaths: readonly string[]
  readonly selectedPath: string | null
  readonly showHidden: boolean | undefined
  readonly t: FileManagerTranslate
  readonly loadDirectory: (path: string, showHidden?: boolean, force?: boolean) => Promise<void>
  readonly setExpanded: (path: string, expanded: boolean) => void
  readonly selectFile: (path: string) => void
}

/** Build only rows made reachable by explicit expansion state. */
export function flattenExplorerRows(
  directories: FileManagerModelSnapshot['directories'],
  expandedPaths: ReadonlySet<string>,
  parent = '',
  depth = 0,
): ExplorerRow[] {
  const state = directories[parent]
  if (state?.status !== 'ready') return []
  const rows: ExplorerRow[] = []
  for (const entry of state.entries) {
    rows.push({ entry, depth, parent })
    if (entry.kind === 'directory' && expandedPaths.has(entry.path)) {
      rows.push(...flattenExplorerRows(directories, expandedPaths, entry.path, depth + 1))
    }
  }
  return rows
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

/** Root-level tree with WAI-ARIA keyboard movement and lazy directory loads. */
export function Explorer({
  snapshot, expandedPaths, selectedPath, showHidden, t,
  loadDirectory, setExpanded, selectFile,
}: ExplorerProps) {
  const treeRef = useRef<HTMLDivElement>(null)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const expanded = useMemo(() => new Set(expandedPaths), [expandedPaths])
  const rows = useMemo(
    () => flattenExplorerRows(snapshot.directories, expanded),
    [expanded, snapshot.directories],
  )
  const root = snapshot.directories['']
  const tabStopPath = rows.some(row => row.entry.path === focusedPath)
    ? focusedPath
    : rows.some(row => row.entry.path === selectedPath)
      ? selectedPath
      : rows[0]?.entry.path

  useEffect(() => { void loadDirectory('', showHidden) }, [loadDirectory, showHidden])

  const toggle = (entry: FileManagerEntry, next?: boolean): void => {
    if (entry.kind !== 'directory') return
    const open = next ?? !expanded.has(entry.path)
    setExpanded(entry.path, open)
    if (open) void loadDirectory(entry.path, showHidden)
  }

  const activate = (entry: FileManagerEntry): void => {
    if (entry.kind === 'directory') toggle(entry)
    else if (entry.kind === 'file') selectFile(entry.path)
  }

  const focusRow = (index: number): void => {
    const elements = treeRef.current?.querySelectorAll<HTMLButtonElement>('[data-tree-row]')
    elements?.item(Math.max(0, Math.min((elements.length || 1) - 1, index))).focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, row: ExplorerRow, index: number): void => {
    const { entry } = row
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRow(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusRow(0)
        break
      case 'End':
        event.preventDefault()
        focusRow(rows.length - 1)
        break
      case 'ArrowRight':
        if (entry.kind !== 'directory') break
        event.preventDefault()
        if (!expanded.has(entry.path)) toggle(entry, true)
        else {
          const child = [...(treeRef.current?.querySelectorAll<HTMLButtonElement>('[data-tree-row]') ?? [])]
            .find(element => element.dataset.treeParent === entry.path)
          child?.focus()
        }
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (entry.kind === 'directory' && expanded.has(entry.path)) toggle(entry, false)
        else {
          const parent = parentPath(entry.path)
          if (parent !== '') {
            const parentRow = [...(treeRef.current?.querySelectorAll<HTMLButtonElement>('[data-tree-row]') ?? [])]
              .find(element => element.dataset.treePath === parent)
            parentRow?.focus()
          }
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        activate(entry)
        break
    }
  }

  if (root?.status === 'error') {
    return <ExplorerState state={root} t={t} />
  }
  if (root === undefined || root.status === 'loading') {
    return <div className={css.treeState} role="status">{t('explorer.loading')}</div>
  }
  if (rows.length === 0) {
    return <div className={css.treeState}>{t('explorer.empty')}</div>
  }

  return (
    <div ref={treeRef} className={css.tree} role="tree" aria-label={t('explorer.title')}>
      {rows.map((row, index) => {
        const { entry } = row
        const isDirectory = entry.kind === 'directory'
        const isExpanded = isDirectory && expanded.has(entry.path)
        const directoryState = isExpanded ? snapshot.directories[entry.path] : undefined
        return (
          <div key={entry.path}>
            <button
              type="button"
              role="treeitem"
              data-tree-row=""
              data-tree-path={entry.path}
              data-tree-parent={row.parent}
              aria-level={row.depth + 1}
              aria-selected={selectedPath === entry.path}
              aria-expanded={isDirectory ? isExpanded : undefined}
              tabIndex={entry.path === tabStopPath ? 0 : -1}
              className={css.treeRow}
              style={{ paddingInlineStart: 10 + row.depth * 16 }}
              title={entry.path}
              onClick={() => { activate(entry) }}
              onFocus={() => { setFocusedPath(entry.path) }}
              onKeyDown={event => { onKeyDown(event, row, index) }}
            >
              <span aria-hidden className={css.chevron}>
                {isDirectory ? (isExpanded ? '⌄' : '›') : ''}
              </span>
              <span aria-hidden className={css.fileIcon}>
                {isDirectory ? '▣' : entry.kind === 'file' ? '·' : '◇'}
              </span>
              <span className={css.entryName}>{entry.name}</span>
              {entry.symlink && <span aria-hidden className={css.symlink}>↗</span>}
            </button>
            {directoryState?.status === 'loading' && (
              <div className={css.inlineTreeState} style={{ paddingInlineStart: 34 + row.depth * 16 }} role="status">
                {t('explorer.loading')}
              </div>
            )}
            {directoryState?.status === 'error' && (
              <div className={css.inlineTreeError} style={{ paddingInlineStart: 34 + row.depth * 16 }}>
                {fileManagerErrorText(directoryState.error, t)}
              </div>
            )}
            {directoryState?.status === 'ready' && directoryState.truncated && (
              <div className={css.inlineTreeState} style={{ paddingInlineStart: 34 + row.depth * 16 }}>
                {t('explorer.truncated')}
              </div>
            )}
          </div>
        )
      })}
      {root.truncated && <div className={css.treeState}>{t('explorer.truncated')}</div>}
    </div>
  )
}

function ExplorerState({ state, t }: { state: FileManagerDirectoryState; t: FileManagerTranslate }) {
  if (state.status !== 'error') return null
  return (
    <div className={css.treeState} role="alert">
      <strong>{t('error.title')}</strong>
      <span>{fileManagerErrorText(state.error, t)}</span>
    </div>
  )
}
