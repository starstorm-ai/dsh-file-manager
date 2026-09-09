/** Complete File conversation view: toolbar, explorer, editor, status, and conflict UI. */

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
  isActiveFileDirty,
  type FileManagerActiveFile,
} from './file-store.ts'
import { languageForPath, languageLabel } from './language.ts'
import type { FileManagerClientError } from './model.ts'
import { MonacoEditor } from './MonacoEditor.tsx'
import { fileManagerErrorText, NS, type FileManagerTranslate } from './locales.ts'
import css from './styles.module.css'

type FileManagerViewStore = ReturnType<typeof createFileManagerViewStore>

/** Session-specific operations and global presentation source bound at registration. */
export interface FileManagerViewInjected {
  readonly hooks: { readonly theme: SnapshotStore<ThemeSnapshot> }
  readonly loadDirectory: (path: string, showHidden?: boolean, force?: boolean) => Promise<void>
  readonly reloadDirectories: (paths: readonly string[], showHidden?: boolean) => Promise<void>
  readonly openFile: (path: string) => void
  readonly saveFile: (path: string, content: string, expectedVersion: string) => Promise<boolean>
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
  loadDirectory, reloadDirectories, openFile, saveFile, t,
}: FileManagerViewProps) {
  const model = useFileManager(value => value)
  const theme = useTheme(value => value)
  const expandedPaths = useStore(state => state.expandedPaths)
  const selectedPath = useStore(state => state.selectedPath)
  const showHidden = useStore(state => state.showHidden)
  const treeWidth = useStore(state => state.treeWidth)
  const explorerVisible = useStore(state => state.explorerVisible)
  const active = useStore(state => state.activeFile)
  const dirty = isActiveFileDirty(active)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const resizeCleanup = useRef<(() => void) | null>(null)

  const root = model.directories['']
  useEffect(() => {
    if (showHidden === null && root?.status === 'ready') actions.setShowHidden(root.showHidden)
  }, [actions, root, showHidden])

  const openNow = useCallback((path: string): void => {
    setPendingPath(null)
    setCursor({ line: 1, column: 1 })
    openFile(path)
  }, [openFile])

  const requestOpen = useCallback((path: string): void => {
    if (active?.path === path && active.error === undefined) return
    if (isActiveFileDirty(active)) setPendingPath(path)
    else openNow(path)
  }, [active, openNow])

  useEffect(() => {
    if (viewRequest?.view !== 'file') return
    if (viewRequest.focus !== '') requestOpen(viewRequest.focus)
    completeViewRequest()
  }, [completeViewRequest, requestOpen, viewRequest])

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent): void => { event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { window.removeEventListener('beforeunload', beforeUnload) }
  }, [dirty])

  useEffect(() => () => { resizeCleanup.current?.() }, [])

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    if (active === null || active.loading || active.saving || active.version === undefined
      || !active.editable || !isActiveFileDirty(active)) return false
    return saveFile(active.path, active.content, active.version)
  }, [active, saveFile])

  const refreshTree = useCallback((): void => {
    void reloadDirectories(expandedPaths, showHidden ?? undefined)
  }, [expandedPaths, reloadDirectories, showHidden])

  const toggleHidden = (): void => {
    const next = !(showHidden ?? false)
    actions.setShowHidden(next)
    void reloadDirectories(expandedPaths, next)
  }

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
  const breadcrumb = useMemo(() => active?.path.split('/') ?? [], [active?.path])

  return (
    <div className={css.root} data-conversation-composer-overlay="">
      <header className={css.toolbar} aria-label={t('toolbar.aria')}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={explorerVisible ? t('explorer.hide') : t('explorer.show')}
          title={explorerVisible ? t('explorer.hide') : t('explorer.show')}
          onClick={() => { actions.setExplorerVisible(!explorerVisible) }}
        >
          ☰
        </button>
        <nav className={css.breadcrumb} aria-label={t('explorer.root')}>
          <span>{t('explorer.root')}</span>
          {breadcrumb.map((segment, index) => (
            <span key={`${segment}:${index}`} className={css.breadcrumbSegment}>
              <span aria-hidden>/</span>{segment}
            </span>
          ))}
          {dirty && <span className={css.dirtyMark} title={t('toolbar.dirty')}>●</span>}
        </nav>
        <div className={css.toolbarActions}>
          <button
            type="button"
            className={css.toolbarButton}
            aria-pressed={showHidden ?? false}
            title={(showHidden ?? false) ? t('toolbar.hideHidden') : t('toolbar.showHidden')}
            onClick={toggleHidden}
          >
            {(showHidden ?? false) ? '◉' : '○'}
            <span className={css.wideLabel}>{t('toolbar.showHidden')}</span>
          </button>
          <button type="button" className={css.toolbarButton} onClick={refreshTree}>
            ↻ <span>{t('toolbar.refresh')}</span>
          </button>
          <button
            type="button"
            className={css.saveButton}
            disabled={!dirty || active?.saving === true || active?.editable !== true}
            onClick={() => { void saveCurrent() }}
          >
            {active?.saving === true ? t('toolbar.saving') : t('toolbar.save')}
          </button>
        </div>
      </header>

      <div className={css.content}>
        {explorerVisible && (
          <aside className={css.explorer} style={{ width: treeWidth }}>
            <div className={css.explorerHeader}>{t('explorer.title')}</div>
            <Explorer
              snapshot={model}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              showHidden={showHidden ?? undefined}
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
                ? <ErrorState error={active.error} t={t} onRetry={() => { openNow(active.path) }} />
                : (
                  <>
                    {active.error !== undefined && (
                      <EditorErrorBanner
                        file={active}
                        t={t}
                        onReload={() => { openNow(active.path) }}
                        onDismiss={actions.dismissFileError}
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
                      onChange={actions.editContent}
                      onSave={() => { void saveCurrent() }}
                      onPositionChange={(line, column) => { setCursor({ line, column }) }}
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

      {pendingPath !== null && active !== null && (
        <UnsavedDialog
          current={active}
          pendingPath={pendingPath}
          t={t}
          onCancel={() => { setPendingPath(null) }}
          onDiscard={() => { openNow(pendingPath) }}
          onSave={async () => {
            if (await saveCurrent()) openNow(pendingPath)
          }}
        />
      )}
    </div>
  )
}

function EmptyEditor({ t }: { t: FileManagerTranslate }) {
  return (
    <div className={css.emptyEditor}>
      <div aria-hidden className={css.emptyIcon}>⌘</div>
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
  file: FileManagerActiveFile
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

function UnsavedDialog({
  current, pendingPath, t, onCancel, onDiscard, onSave,
}: {
  current: FileManagerActiveFile
  pendingPath: string
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
        <p id={descriptionId}>{t('confirm.body')}</p>
        {current.error !== undefined && (
          <p className={css.modalError} role="alert">{fileManagerErrorText(current.error, t)}</p>
        )}
        <div className={css.modalPaths} title={`${current.path} → ${pendingPath}`}>
          {basename(current.path)} → {basename(pendingPath)}
        </div>
        <div className={css.modalActions}>
          <button ref={cancelRef} type="button" className={css.toolbarButton} onClick={onCancel}>
            {t('confirm.cancel')}
          </button>
          <button type="button" className={css.toolbarButton} onClick={onDiscard}>{t('confirm.discardAndOpen')}</button>
          <button
            type="button"
            className={css.saveButton}
            disabled={current.saving || !current.editable}
            onClick={() => { void onSave() }}
          >
            {current.saving ? t('toolbar.saving') : t('confirm.saveAndOpen')}
          </button>
        </div>
      </section>
    </div>
  )
}
