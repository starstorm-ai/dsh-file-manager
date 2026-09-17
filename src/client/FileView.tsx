/** Complete File conversation view: tab toolbar, explorer, editor, status, and conflict UI. */

import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsStore, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { Explorer } from './Explorer.tsx'
import {
  createFileManagerViewStore,
  isFileDirty,
  type FileManagerOpenFile,
} from './file-store.ts'
import { FileToolbar } from './FileToolbar.tsx'
import { languageForPath, languageLabel } from './language.ts'
import type { FileManagerClientError } from './model.ts'
import { MonacoEditor } from './MonacoEditor.tsx'
import { fileManagerErrorText, NS, type FileManagerTranslate } from './locales.ts'
import type { FileManagerContextSelectionUpdate } from './context-selection.ts'
import css from './styles.module.css'

type FileManagerViewStore = ReturnType<typeof createFileManagerViewStore>

/** Session-specific operations and global presentation source bound at registration. */
export interface FileManagerViewInjected {
  readonly hooks: { readonly theme: SnapshotStore<ThemeSnapshot> }
  readonly loadDirectory: (path: string) => Promise<void>
  readonly openFile: (path: string) => void
  readonly closeFile: (path: string) => void
  readonly saveFile: (path: string, content: string, expectedVersion: string) => Promise<boolean>
  readonly publishContextSelection: (selection: FileManagerContextSelectionUpdate | null) => void
}

export type FileManagerViewProps = ConvViewProps
  & PropsStore<FileManagerViewStore>
  & InjectFace<FileManagerViewInjected>
  & PropsLocale<typeof NS>

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}

/** Full-bleed view whose state and I/O lifetimes live outside the component. */
export function FileView({
  sessionId, viewRequest, completeViewRequest,
  useFileManager, useTheme, useStore, actions,
  loadDirectory, openFile, closeFile, saveFile, publishContextSelection, t,
}: FileManagerViewProps) {
  const model = useFileManager(value => value)
  const theme = useTheme(value => value)
  const expandedPaths = useStore(state => state.expandedPaths)
  const selectedPath = useStore(state => state.selectedPath)
  const treeWidth = useStore(state => state.treeWidth)
  const explorerVisible = useStore(state => state.explorerVisible)
  const activePath = useStore(state => state.activePath)
  const openFiles = useStore(state => state.openFiles)
  const active = useMemo(
    () => openFiles.find(file => file.path === activePath) ?? null,
    [activePath, openFiles],
  )
  const [requestedClosePath, setRequestedClosePath] = useState<string | null>(null)
  const requestedClose = useMemo(
    () => openFiles.find(file => file.path === requestedClosePath) ?? null,
    [openFiles, requestedClosePath],
  )
  const dirty = isFileDirty(active)
  const hasDirtyFiles = openFiles.some(isFileDirty)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const resizeCleanup = useRef<(() => void) | null>(null)

  const requestOpen = useCallback((path: string): void => {
    if (openFiles.some(file => file.path === path)) {
      actions.activateFile(path)
      return
    }
    openFile(path)
  }, [actions, openFile, openFiles])

  useEffect(() => {
    if (viewRequest?.view !== 'file') return
    if (viewRequest.focus !== '') requestOpen(viewRequest.focus)
    completeViewRequest()
  }, [completeViewRequest, requestOpen, viewRequest])

  useEffect(() => {
    if (!hasDirtyFiles) return
    const beforeUnload = (event: BeforeUnloadEvent): void => { event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { window.removeEventListener('beforeunload', beforeUnload) }
  }, [hasDirtyFiles])

  useEffect(() => { setCursor({ line: 1, column: 1 }) }, [activePath])
  useEffect(() => {
    if (active === null || active.loading || active.version === undefined) {
      publishContextSelection(null)
    }
  }, [active, publishContextSelection])
  useEffect(() => () => { resizeCleanup.current?.() }, [])

  const save = useCallback(async (file: FileManagerOpenFile): Promise<boolean> => {
    if (file.loading || file.saving || file.version === undefined
      || !file.editable || !isFileDirty(file)) return false
    return saveFile(file.path, file.content, file.version)
  }, [saveFile])

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    if (active === null) return false
    return save(active)
  }, [active, save])

  const requestClose = useCallback((path: string): void => {
    const file = openFiles.find(candidate => candidate.path === path)
    if (file === undefined || file.saving) return
    if (isFileDirty(file)) {
      setRequestedClosePath(path)
      return
    }
    closeFile(path)
  }, [closeFile, openFiles])

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    resizeCleanup.current?.()
    const startX = event.clientX
    const startWidth = treeWidth
    const move = (moveEvent: PointerEvent): void => {
      actions.setTreeWidth(startWidth + moveEvent.clientX - startX)
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      resizeCleanup.current = null
    }
    resizeCleanup.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  const language = active === null ? 'plaintext' : languageForPath(active.path)

  return (
    <div className={css.root} data-conversation-composer-overlay="">
      <FileToolbar
        files={openFiles}
        activePath={activePath}
        explorerVisible={explorerVisible}
        activeSaving={active?.saving === true}
        saveDisabled={!dirty || active?.saving === true || active?.editable !== true}
        t={t}
        onToggleExplorer={() => { actions.setExplorerVisible(!explorerVisible) }}
        onActivateFile={actions.activateFile}
        onCloseFile={requestClose}
        onSave={() => { void saveCurrent() }}
      />

      <div className={css.content}>
        {explorerVisible && (
          <aside className={css.explorer} style={{ width: treeWidth }}>
            <Explorer
              snapshot={model}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              t={t}
              loadDirectory={loadDirectory}
              setExpanded={actions.setExpanded}
              selectFile={requestOpen}
            />
          </aside>
        )}
        {explorerVisible && (
          <div
            className={css.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label={t('explorer.resize')}
            aria-valuemin={220}
            aria-valuemax={420}
            aria-valuenow={treeWidth}
            tabIndex={0}
            onPointerDown={beginResize}
            onDoubleClick={() => { actions.setTreeWidth(280) }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              actions.setTreeWidth(treeWidth + (event.key === 'ArrowRight' ? 16 : -16))
            }}
          />
        )}

        <main className={css.editorPane}>
          {active === null
            ? <EmptyEditor t={t} />
            : active.loading
              ? <div className={css.centerState} role="status">{t('editor.loading')}</div>
              : active.error !== undefined && active.version === undefined
                ? <ErrorState error={active.error} t={t} onRetry={() => { openFile(active.path) }} />
                : (
                  <>
                    {active.error !== undefined && (
                      <EditorErrorBanner
                        file={active}
                        t={t}
                        onReload={() => { openFile(active.path) }}
                        onDismiss={() => { actions.dismissFileError(active.path) }}
                      />
                    )}
                    <MonacoEditor
                      key={`${active.path}:${active.loadRequestId}`}
                      sessionId={sessionId}
                      path={active.path}
                      value={active.content}
                      readOnly={!active.editable || active.saving}
                      ariaLabel={active.path}
                      colorScheme={theme.active.colorScheme}
                      themeRevision={theme.revision}
                      fontSize={theme.fontSize}
                      initialViewState={active.viewState}
                      onChange={(content) => { actions.editContent(active.path, content) }}
                      onSave={() => { void saveCurrent() }}
                      onPositionChange={(line, column) => { setCursor({ line, column }) }}
                      onSelectionChange={(selection) => {
                        publishContextSelection(selection === null
                          ? null
                          : {
                              path: active.path,
                              language,
                              text: selection.text,
                              range: selection.range,
                              revision: `monaco:${active.loadRequestId}:${selection.modelVersion}`,
                            })
                      }}
                      onViewStateChange={(viewState) => {
                        actions.setEditorViewState(active.path, viewState)
                      }}
                    />
                  </>
                )}
        </main>
      </div>

      <footer className={css.statusBar}>
        <span>{t('status.workspaceLocked')}</span>
        <span className={css.statusRight}>
          {active !== null && !active.loading && (
            <>
              <span>{active.editable ? t('editor.editable') : t('editor.readOnly')}</span>
              <span>{languageLabel(language)}</span>
              <span>{t('editor.encoding')}</span>
              <span>{t('editor.position', cursor)}</span>
            </>
          )}
        </span>
      </footer>

      {requestedClosePath !== null && requestedClose !== null && (
        <UnsavedCloseDialog
          current={requestedClose}
          t={t}
          onCancel={() => { setRequestedClosePath(null) }}
          onDiscard={() => {
            closeFile(requestedClose.path)
            setRequestedClosePath(null)
          }}
          onSave={async () => {
            if (!await save(requestedClose)) return
            closeFile(requestedClose.path)
            setRequestedClosePath(null)
          }}
        />
      )}
    </div>
  )
}

function EmptyEditor({ t }: { t: FileManagerTranslate }) {
  return (
    <div className={css.emptyEditor}>
      <strong>{t('editor.emptyTitle')}</strong>
      <span>{t('editor.emptyBody')}</span>
    </div>
  )
}

function ErrorState({
  error, t, onRetry,
}: { error: FileManagerClientError; t: FileManagerTranslate; onRetry: () => void }) {
  return (
    <div className={css.errorState} role="alert">
      <strong>{t('error.title')}</strong>
      <span>{fileManagerErrorText(error, t)}</span>
      <button type="button" className={css.toolbarButton} onClick={onRetry}>{t('action.retry')}</button>
    </div>
  )
}

function EditorErrorBanner({
  file, t, onReload, onDismiss,
}: {
  file: FileManagerOpenFile
  t: FileManagerTranslate
  onReload: () => void
  onDismiss: () => void
}) {
  if (file.error === undefined) return null
  return (
    <div className={css.errorBanner} role="alert">
      <span>{fileManagerErrorText(file.error, t)}</span>
      <span className={css.bannerActions}>
        {file.conflict && <button type="button" onClick={onReload}>{t('action.reload')}</button>}
        <button type="button" onClick={onDismiss}>{t('action.dismiss')}</button>
      </span>
    </div>
  )
}

function UnsavedCloseDialog({
  current, t, onCancel, onDiscard, onSave,
}: {
  current: FileManagerOpenFile
  t: FileManagerTranslate
  onCancel: () => void
  onDiscard: () => void
  onSave: () => Promise<void>
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => {
      if (previous?.isConnected === true) previous.focus()
    }
  }, [])

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    if (buttons.length === 0) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) {
      event.preventDefault()
      if (event.shiftKey) buttons.at(-1)?.focus()
      else buttons[0]?.focus()
    } else if (event.shiftKey && index === 0) {
      event.preventDefault()
      buttons.at(-1)?.focus()
    } else if (!event.shiftKey && index === buttons.length - 1) {
      event.preventDefault()
      buttons[0]?.focus()
    }
  }

  return (
    <div className={css.modalBackdrop} role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className={css.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={event => { event.stopPropagation() }}
        onKeyDown={onDialogKeyDown}
      >
        <h2 id={titleId}>{t('confirm.title')}</h2>
        <p id={descriptionId}>{t('confirm.closeBody')}</p>
        {current.error !== undefined && (
          <p className={css.modalError} role="alert">{fileManagerErrorText(current.error, t)}</p>
        )}
        <div className={css.modalPaths} title={current.path}>{basename(current.path)}</div>
        <div className={css.modalActions}>
          <button ref={cancelRef} type="button" className={css.toolbarButton} onClick={onCancel}>
            {t('confirm.cancel')}
          </button>
          <button type="button" className={css.toolbarButton} onClick={onDiscard}>
            {t('confirm.discardAndClose')}
          </button>
          <button
            type="button"
            className={css.saveButton}
            disabled={current.saving || !current.editable}
            onClick={() => { void onSave() }}
          >
            {current.saving ? t('toolbar.saving') : t('confirm.saveAndClose')}
          </button>
        </div>
      </section>
    </div>
  )
}
