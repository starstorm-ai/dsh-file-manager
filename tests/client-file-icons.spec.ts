import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Explorer } from '../src/client/Explorer.tsx'
import { fileTypeIconKind } from '../src/client/FileTypeIcon.tsx'
import type { FileManagerTranslate } from '../src/client/locales.ts'
import type { FileManagerModelSnapshot } from '../src/client/model.ts'

const t = ((key: string) => key === 'explorer.root' ? 'Workspace' : key) as FileManagerTranslate

describe('File explorer icons', () => {
  it('maps common VS Code-style filenames and extensions to distinct icon kinds', () => {
    expect(fileTypeIconKind('src/App.tsx')).toBe('typescript')
    expect(fileTypeIconKind('package.json')).toBe('package')
    expect(fileTypeIconKind('README.md')).toBe('markdown')
    expect(fileTypeIconKind('.gitignore')).toBe('git')
    expect(fileTypeIconKind('.editorconfig')).toBe('settings')
    expect(fileTypeIconKind('scripts/build.ps1')).toBe('shell')
    expect(fileTypeIconKind('assets/logo.svg')).toBe('image')
    expect(fileTypeIconKind('Cargo.toml')).toBe('rust')
    expect(fileTypeIconKind('go.mod')).toBe('go')
    expect(fileTypeIconKind('pyproject.toml')).toBe('python')
    expect(fileTypeIconKind('unknown.data')).toBe('generic')
  })

  it('renders DSH folder states and file-type glyphs without the old heading or placeholders', () => {
    const snapshot: FileManagerModelSnapshot = {
      directories: {
        '': {
          status: 'ready',
          entries: [
            { name: 'src', path: 'src', kind: 'directory', symlink: false },
            { name: 'index.ts', path: 'index.ts', kind: 'file', symlink: false },
          ],
          truncated: false,
          showHidden: false,
          editable: true,
        },
        src: {
          status: 'ready',
          entries: [],
          truncated: false,
          showHidden: false,
          editable: true,
        },
      },
    }
    const html = renderToStaticMarkup(createElement(Explorer, {
      snapshot,
      expandedPaths: ['', 'src'],
      selectedPath: 'src/index.ts',
      t,
      loadDirectory: async () => {},
      setExpanded: () => {},
      selectFile: () => {},
    }))

    expect(html).toContain('aria-label="Workspace"')
    expect(html).toContain('data-directory-state="open"')
    expect(html).toContain('data-file-icon="typescript"')
    expect(html).not.toContain('File Explorer')
    expect(html).not.toContain('▣')
    expect(html).not.toContain('·')
  })
})
