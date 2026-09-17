/** Direct Monaco editor bridge with DSH theme and lifecycle ownership. */

import { useEffect, useLayoutEffect, useRef } from 'react'
import * as monaco from './monaco-runtime.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { languageForPath } from './language.ts'
import { normalizeMonacoColor } from './monaco-theme.ts'
import css from './styles.module.css'

export interface MonacoTextSelection {
  readonly text: string
  readonly range: {
    readonly startLine: number
    readonly startColumn: number
    readonly endLine: number
    readonly endColumn: number
  }
  readonly modelVersion: number
}

export interface MonacoEditorProps {
  readonly sessionId: SessionId
  readonly path: string
  readonly value: string
  readonly readOnly: boolean
  readonly ariaLabel: string
  readonly colorScheme: 'light' | 'dark'
  readonly themeRevision: number
  readonly fontSize: number
  readonly initialViewState: monaco.editor.ICodeEditorViewState | undefined
  readonly onChange: (value: string) => void
  readonly onSave: () => void
  readonly onPositionChange: (line: number, column: number) => void
  readonly onSelectionChange: (selection: MonacoTextSelection | null) => void
  readonly onViewStateChange: (viewState: monaco.editor.ICodeEditorViewState) => void
}

interface LiveEditor {
  readonly editor: monaco.editor.IStandaloneCodeEditor
  readonly model: monaco.editor.ITextModel
}

/** Resolve a CSS token from the File view, with a Monaco-safe fallback. */
function token(element: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  return normalizeMonacoColor(value === '' ? fallback : value)
}

/** Rebuild a Monaco theme from the currently resolved DSH CSS variables. */
function applyDshTheme(element: HTMLElement, scheme: 'light' | 'dark'): string {
  const dark = scheme === 'dark'
  const name = dark ? 'dsh-file-dark' : 'dsh-file-light'
  monaco.editor.defineTheme(name, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': token(element, '--dsw-alias-bg-layer-1', dark ? '#1f2023' : '#ffffff'),
      'editor.foreground': token(element, '--dsw-alias-label-primary', dark ? '#f2f2f2' : '#202020'),
      'editorLineNumber.foreground': token(element, '--dsw-alias-label-tertiary', dark ? '#858585' : '#777777'),
      'editorLineNumber.activeForeground': token(element, '--dsw-alias-label-secondary', dark ? '#c6c6c6' : '#444444'),
      'editor.selectionBackground': token(element, '--dsw-alias-interactive-bg-active', dark ? '#264f78' : '#add6ff'),
      'editor.inactiveSelectionBackground': token(element, '--dsw-alias-interactive-bg-hover', dark ? '#3a3d41' : '#e5ebf1'),
      'editor.lineHighlightBackground': token(element, '--dsw-alias-bg-layer-2', dark ? '#252526' : '#f7f7f7'),
      'editorCursor.foreground': token(element, '--dsw-alias-state-business-primary', '#2f7cf6'),
      'editorWhitespace.foreground': token(element, '--dsw-alias-border-l2', dark ? '#404040' : '#d7d7d7'),
      'editorIndentGuide.background1': token(element, '--dsw-alias-border-l1', dark ? '#404040' : '#d7d7d7'),
      'editorIndentGuide.activeBackground1': token(element, '--dsw-alias-border-l3', dark ? '#707070' : '#999999'),
      'editorWidget.background': token(element, '--dsw-alias-bg-overlay', dark ? '#252526' : '#ffffff'),
      'editorWidget.border': token(element, '--dsw-alias-border-l2', dark ? '#454545' : '#d4d4d4'),
    },
  })
  monaco.editor.setTheme(name)
  return name
}

/** Monaco owns its DOM and model; React owns only their deterministic lifetime. */
export function MonacoEditor(props: MonacoEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef<LiveEditor | undefined>(undefined)
  const onChangeRef = useRef(props.onChange)
  const onSaveRef = useRef(props.onSave)
  const onPositionRef = useRef(props.onPositionChange)
  const onSelectionRef = useRef(props.onSelectionChange)
  const onViewStateRef = useRef(props.onViewStateChange)
  onChangeRef.current = props.onChange
  onSaveRef.current = props.onSave
  onPositionRef.current = props.onPositionChange
  onSelectionRef.current = props.onSelectionChange
  onViewStateRef.current = props.onViewStateChange

  useLayoutEffect(() => {
    const element = hostRef.current
    if (element === null) return
    const language = languageForPath(props.path)
    const uri = monaco.Uri.from({
      scheme: 'dsh-file',
      authority: encodeURIComponent(String(props.sessionId)),
      path: `/${props.path.split('/').map(encodeURIComponent).join('/')}`,
    })
    // A prior hot-reload can leave a model registered for a tick. The view is
    // the sole owner of this URI, so retire the orphan before creating anew.
    monaco.editor.getModel(uri)?.dispose()
    const model = monaco.editor.createModel(props.value, language, uri)
    const theme = applyDshTheme(element, props.colorScheme)
    const editor = monaco.editor.create(element, {
      model,
      theme,
      ariaLabel: props.ariaLabel,
      readOnly: props.readOnly,
      fontSize: Math.max(12, props.fontSize),
      fontFamily: 'var(--dsw-font-family), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      automaticLayout: false,
      minimap: { enabled: true, autohide: 'mouseover' },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderWhitespace: 'selection',
      wordWrap: 'off',
      bracketPairColorization: { enabled: true },
      padding: { top: 10, bottom: 10 },
    })
    liveRef.current = { editor, model }
    if (props.initialViewState !== undefined) editor.restoreViewState(props.initialViewState)
    const publishSelection = (): void => {
      const selection = editor.getSelection()
      if (selection === null || selection.isEmpty()) {
        onSelectionRef.current(null)
        return
      }
      const start = selection.getStartPosition()
      const end = selection.getEndPosition()
      onSelectionRef.current({
        text: model.getValueInRange(selection),
        range: {
          startLine: start.lineNumber,
          startColumn: start.column,
          endLine: end.lineNumber,
          endColumn: end.column,
        },
        modelVersion: model.getVersionId(),
      })
    }
    const initialPosition = editor.getPosition()
    if (initialPosition !== null) {
      onPositionRef.current(initialPosition.lineNumber, initialPosition.column)
    }
    publishSelection()
    const change = model.onDidChangeContent(() => {
      onChangeRef.current(model.getValue())
      publishSelection()
    })
    const cursor = editor.onDidChangeCursorPosition(({ position }) => {
      onPositionRef.current(position.lineNumber, position.column)
    })
    const selection = editor.onDidChangeCursorSelection(publishSelection)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current()
    })
    const observer = new ResizeObserver(() => { editor.layout() })
    observer.observe(element)
    editor.focus()
    return () => {
      const viewState = editor.saveViewState()
      if (viewState !== null) onViewStateRef.current(viewState)
      observer.disconnect()
      change.dispose()
      cursor.dispose()
      selection.dispose()
      editor.dispose()
      model.dispose()
      liveRef.current = undefined
    }
    // A path/load change remounts this component from FileView; callback and
    // presentation updates are handled by refs/effects below.
  }, [props.path, props.sessionId])

  useEffect(() => {
    const live = liveRef.current
    if (live === undefined || live.model.getValue() === props.value) return
    live.model.setValue(props.value)
  }, [props.value])

  useEffect(() => {
    liveRef.current?.editor.updateOptions({
      readOnly: props.readOnly,
      fontSize: Math.max(12, props.fontSize),
    })
  }, [props.fontSize, props.readOnly])

  useEffect(() => {
    const element = hostRef.current
    if (element !== null) applyDshTheme(element, props.colorScheme)
  }, [props.colorScheme, props.themeRevision])

  return <div ref={hostRef} className={css.monaco} />
}
