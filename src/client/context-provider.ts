/** Optional Context Picker Provider for the exact active Monaco selection. */

import type { ContextPickerProvider } from 'dsh-context-picker/provider'
import type { FileManagerTranslate } from './locales.ts'
import { FileManagerContextSelections } from './context-selection.ts'

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}

export function createFileManagerContextProvider(
  selections: FileManagerContextSelections,
  t: FileManagerTranslate,
): ContextPickerProvider {
  return {
    id: 'dsh-file-manager',
    label: t('context.section'),
    order: 30,
    candidates(sessionId, { query }) {
      const selection = selections.get(sessionId)
      if (selection === undefined) return []
      const rawLabel = t('context.selection', { file: basename(selection.path) })
      const label = rawLabel.length <= 120 ? rawLabel : `${rawLabel.slice(0, 119)}…`
      const description = t('context.range', {
        path: selection.path,
        startLine: selection.range.startLine,
        startColumn: selection.range.startColumn,
        endLine: selection.range.endLine,
        endColumn: selection.range.endColumn,
      })
      const needle = query.trim().toLocaleLowerCase()
      if (needle !== '' && !`${label} ${description} ${t('context.section')}`
        .toLocaleLowerCase().includes(needle)) return []
      return [{
        key: `${selection.path}:${selection.range.startLine}:${selection.range.startColumn}`
          + `-${selection.range.endLine}:${selection.range.endColumn}`,
        label,
        description,
        revision: selection.revision,
        metadata: [
          { key: 'endColumn', value: String(selection.range.endColumn) },
          { key: 'endLine', value: String(selection.range.endLine) },
          { key: 'path', value: selection.path },
          { key: 'sessionId', value: String(selection.sessionId) },
          { key: 'startColumn', value: String(selection.range.startColumn) },
          { key: 'startLine', value: String(selection.range.startLine) },
        ],
        content: {
          type: 'text',
          text: selection.text,
          language: selection.language,
        },
        appearance: 'file',
      }]
    },
  }
}
