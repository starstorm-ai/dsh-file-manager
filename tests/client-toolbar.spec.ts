import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { FileManagerOpenFile } from '../src/client/file-store.ts'
import { FileToolbar } from '../src/client/FileToolbar.tsx'
import type { FileManagerTranslate } from '../src/client/locales.ts'

function openFile(path: string, content: string, savedContent = content): FileManagerOpenFile {
  return {
    path,
    loadRequestId: 1,
    loading: false,
    content,
    savedContent,
    version: 'v1',
    size: content.length,
    editable: true,
    saving: false,
    conflict: false,
  }
}

const t = ((key: string, params?: Readonly<Record<string, unknown>>) => {
  if (key === 'explorer.root') return 'Workspace'
  if (key === 'toolbar.save') return 'Save'
  if (key === 'toolbar.dirty') return 'Unsaved'
  if (key === 'tabs.aria') return 'Open files'
  if (key === 'tabs.close') return `Close ${String(params?.file)}`
  return key
}) as FileManagerTranslate

function declarations(source: string, selector: string): Readonly<Record<string, string>> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source)?.[1]
  if (body === undefined) throw new Error(`missing CSS selector ${selector}`)
  return Object.fromEntries([...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)]
    .map(match => [match[1]!, match[2]!.trim()]))
}

function select(
  values: Readonly<Record<string, string>>,
  keys: readonly string[],
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(keys.map(key => [key, values[key]]))
}

describe('File toolbar', () => {
  it('renders all open files as tabs between Workspace and Save', () => {
    const html = renderToStaticMarkup(createElement(FileToolbar, {
      files: [openFile('src/index.ts', 'edited', 'saved'), openFile('README.md', 'readme')],
      activePath: 'src/index.ts',
      explorerVisible: true,
      activeSaving: false,
      saveDisabled: false,
      t,
      onToggleExplorer: vi.fn(),
      onActivateFile: vi.fn(),
      onCloseFile: vi.fn(),
      onSave: vi.fn(),
    }))

    expect(html.match(/role="tab"/g)).toHaveLength(2)
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('index.ts')
    expect(html).toContain('README.md')
    expect(html.indexOf('Workspace')).toBeLessThan(html.indexOf('index.ts'))
    expect(html.indexOf('README.md')).toBeLessThan(html.indexOf('Save'))
    expect(html).toContain('Unsaved')
    expect(html).not.toContain('Show hidden files')
    expect(html).not.toContain('Refresh')
  })

  it('matches the pinned Trajectory filter bar geometry and action tokens', () => {
    const root = resolve(import.meta.dirname, '..')
    const fileCss = readFileSync(resolve(root, 'src/client/styles.module.css'), 'utf8')
    const trajectoryCss = readFileSync(resolve(
      root,
      'upstream/deepseek-harness/packages/client/ui-trajectory/src/client/TrajectoryToolbar.module.css',
    ), 'utf8')
    const trajectoryViewCss = readFileSync(resolve(
      root,
      'upstream/deepseek-harness/packages/client/ui-trajectory/src/client/views.module.css',
    ), 'utf8')
    const barKeys = [
      'position', 'top', 'z-index', 'box-sizing', 'width', 'border-bottom', 'background',
    ]
    const innerKeys = ['display', 'align-items', 'box-sizing', 'width', 'height', 'padding', 'gap']
    const actionKeys = [
      'display', 'flex', 'align-items', 'height', 'padding', 'gap', 'border', 'border-radius',
      'color', 'background', 'cursor', 'font',
    ]

    expect(select(declarations(fileCss, '.toolbar'), barKeys))
      .toEqual(select(declarations(trajectoryCss, '.root'), barKeys))
    expect(declarations(fileCss, '.toolbar').height).toBe('32px')
    expect(declarations(trajectoryCss, '.root').height).toBe('var(--dsh-trajectory-toolbar-height)')
    expect(declarations(trajectoryViewCss, '.root')['--dsh-trajectory-toolbar-height']).toBe('32px')
    expect(select(declarations(fileCss, '.toolbarInner'), innerKeys))
      .toEqual(select(declarations(trajectoryCss, '.inner'), innerKeys))
    expect(select(declarations(fileCss, '.toolbarAction'), actionKeys))
      .toEqual(select(declarations(trajectoryCss, '.action'), actionKeys))
  })
})
