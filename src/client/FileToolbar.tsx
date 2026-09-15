/** Compact File toolbar using the same 20px action treatment as Trajectory filters. */

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { isFileDirty, type FileManagerOpenFile } from './file-store.ts'
import { FileTypeIcon } from './FileTypeIcon.tsx'
import type { FileManagerTranslate } from './locales.ts'
import css from './styles.module.css'

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}

function WorkspaceIcon() {
  return (
    <svg className={css.toolbarIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.25h10M3 8h10M3 11.75h10" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg className={css.toolbarIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 2.75h8.25L13 4.5v8.75H3z" />
      <path d="M5 2.75v3.5h5.5v-3.5M5.25 13.25V9h5.5v4.25" />
    </svg>
  )
}

interface ToolbarActionProps {
  readonly children: ReactNode
  readonly icon: ReactNode
  readonly pressed?: boolean
  readonly disabled?: boolean
  readonly title: string
  readonly onClick: () => void
}

/** Shared Trajectory-style action chrome for the fixed toolbar controls. */
function ToolbarAction({ children, icon, pressed, disabled, title, onClick }: ToolbarActionProps) {
  return (
    <button
      type="button"
      className={css.toolbarAction}
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  )
}

export interface FileToolbarProps {
  readonly files: readonly FileManagerOpenFile[]
  readonly activePath: string | null
  readonly explorerVisible: boolean
  readonly activeSaving: boolean
  readonly saveDisabled: boolean
  readonly t: FileManagerTranslate
  readonly onToggleExplorer: () => void
  readonly onActivateFile: (path: string) => void
  readonly onCloseFile: (path: string) => void
  readonly onSave: () => void
}

/** Render workspace, open-file tabs, and save as one compact action bar. */
export function FileToolbar({
  files,
  activePath,
  explorerVisible,
  activeSaving,
  saveDisabled,
  t,
  onToggleExplorer,
  onActivateFile,
  onCloseFile,
  onSave,
}: FileToolbarProps) {
  const tabsRef = useRef<HTMLDivElement>(null)

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number | undefined
    if (event.key === 'ArrowLeft') next = (index - 1 + files.length) % files.length
    else if (event.key === 'ArrowRight') next = (index + 1) % files.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = files.length - 1
    if (next === undefined) return
    event.preventDefault()
    const file = files[next]
    if (file === undefined) return
    onActivateFile(file.path)
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next).focus()
  }

  return (
    <header className={css.toolbar} role="toolbar" aria-label={t('toolbar.aria')}>
      <div className={css.toolbarInner}>
        <div className={css.toolbarItems}>
          <ToolbarAction
            icon={<WorkspaceIcon />}
            pressed={explorerVisible}
            title={explorerVisible ? t('explorer.hide') : t('explorer.show')}
            onClick={onToggleExplorer}
          >
            {t('explorer.root')}
          </ToolbarAction>

          <div ref={tabsRef} className={css.fileTabs} role="tablist" aria-label={t('tabs.aria')}>
            {files.map((file, index) => {
              const active = file.path === activePath
              const dirty = isFileDirty(file)
              return (
                <div
                  key={file.path}
                  className={css.fileTab}
                  data-active={active || undefined}
                  data-loading={file.loading || undefined}
                  title={file.path}
                >
                  <button
                    type="button"
                    className={css.fileTabSelect}
                    role="tab"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => { onActivateFile(file.path) }}
                    onKeyDown={(event) => { onTabKeyDown(event, index) }}
                  >
                    <FileTypeIcon path={file.path} />
                    <span className={css.fileTabLabel}>{basename(file.path)}</span>
                    {dirty && <span className={css.dirtyMark} title={t('toolbar.dirty')}>●</span>}
                  </button>
                  <button
                    type="button"
                    className={css.fileTabClose}
                    disabled={file.saving}
                    aria-label={t('tabs.close', { file: basename(file.path) })}
                    title={t('tabs.close', { file: basename(file.path) })}
                    onClick={() => { onCloseFile(file.path) }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <ToolbarAction
          icon={<SaveIcon />}
          disabled={saveDisabled}
          title={activeSaving ? t('toolbar.saving') : t('toolbar.save')}
          onClick={onSave}
        >
          {activeSaving ? t('toolbar.saving') : t('toolbar.save')}
        </ToolbarAction>
      </div>
    </header>
  )
}
