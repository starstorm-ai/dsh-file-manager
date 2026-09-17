import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'
import { createFileManagerContextProvider } from '../src/client/context-provider.ts'
import { FileManagerContextSelections } from '../src/client/context-selection.ts'
import type { FileManagerTranslate } from '../src/client/locales.ts'

const sessionId = 'session-context' as SessionId
const t = ((key: string, params?: Record<string, unknown>) => {
  if (key === 'context.section') return 'file-manager 当前选区'
  if (key === 'context.selection') return `当前选区 · ${String(params?.file)}`
  if (key === 'context.range') {
    return `${String(params?.path)} · ${String(params?.startLine)}:${String(params?.startColumn)}`
      + `–${String(params?.endLine)}:${String(params?.endColumn)}`
  }
  return key
}) as FileManagerTranslate

describe('File Manager Context Picker Provider', () => {
  it('projects the exact unsaved Monaco selection and clears by Session', async () => {
    const selections = new FileManagerContextSelections()
    selections.publish({
      sessionId,
      path: 'src/current.ts',
      language: 'typescript',
      text: 'const unsaved = true',
      range: { startLine: 4, startColumn: 1, endLine: 4, endColumn: 21 },
      revision: 'monaco:7:3',
    })
    const provider = createFileManagerContextProvider(selections, t)
    const candidates = await provider.candidates(sessionId, {
      query: 'current.ts',
      signal: new AbortController().signal,
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      revision: 'monaco:7:3',
      content: { type: 'text', text: 'const unsaved = true', language: 'typescript' },
      appearance: 'file',
    })
    selections.clear(sessionId)
    expect(await provider.candidates(sessionId, {
      query: '',
      signal: new AbortController().signal,
    })).toEqual([])
  })
})
