/** Compact, theme-aware file-kind glyphs shared by the explorer and file tabs. */

import type { ReactNode } from 'react'
import {
  IconBranchOutline16,
  IconSettingsOutline16,
  ReferenceIcon,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './styles.module.css'

export type FileTypeIconKind =
  | 'archive'
  | 'c'
  | 'cpp'
  | 'docker'
  | 'environment'
  | 'generic'
  | 'git'
  | 'go'
  | 'html'
  | 'image'
  | 'java'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'package'
  | 'python'
  | 'rust'
  | 'settings'
  | 'shell'
  | 'sql'
  | 'stylesheet'
  | 'text'
  | 'typescript'
  | 'yaml'

const TEXT_LABELS: Partial<Record<FileTypeIconKind, string>> = {
  archive: 'ZIP',
  c: 'C',
  cpp: 'C+',
  docker: 'DK',
  environment: 'ENV',
  go: 'GO',
  html: '<>',
  image: 'IMG',
  java: 'JV',
  javascript: 'JS',
  json: '{}',
  markdown: 'MD',
  package: 'PKG',
  python: 'PY',
  rust: 'RS',
  shell: '>_',
  sql: 'SQL',
  stylesheet: '#',
  text: 'TXT',
  typescript: 'TS',
  yaml: 'YML',
}

function basename(path: string): string {
  return path.split('/').at(-1)?.toLowerCase() ?? path.toLowerCase()
}

/** Resolve common source, configuration, asset, and metadata names to a stable glyph kind. */
export function fileTypeIconKind(path: string): FileTypeIconKind {
  const name = basename(path)

  if (name.startsWith('.git') || name === 'gitconfig') return 'git'
  if (name === '.env' || name.startsWith('.env.')) return 'environment'
  if (name === '.editorconfig'
    || name === '.prettierrc'
    || name.startsWith('.prettierrc.')
    || name === '.eslintrc'
    || name.startsWith('.eslintrc.')) return 'settings'
  if (/^tsconfig(?:\..+)?\.json$/.test(name)) return 'typescript'
  if (name === 'package.json'
    || name === 'package-lock.json'
    || name === 'pnpm-lock.yaml'
    || name === 'yarn.lock'
    || name === 'bun.lock'
    || name === 'bun.lockb') return 'package'
  if (name === 'cargo.toml' || name === 'cargo.lock') return 'rust'
  if (name === 'go.mod' || name === 'go.sum' || name === 'go.work') return 'go'
  if (name === 'pyproject.toml' || name === 'requirements.txt' || name === 'pipfile') return 'python'
  if (name === 'pom.xml' || name === 'build.gradle' || name === 'build.gradle.kts') return 'java'
  if (name === 'cmakelists.txt') return 'cpp'
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'docker'
  if (name === 'makefile' || name.startsWith('makefile.')) return 'settings'
  if (/^(readme|changelog|contributing|license)(\..+)?$/.test(name)) {
    return name.includes('license') && !name.endsWith('.md') ? 'text' : 'markdown'
  }

  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1) : ''
  switch (extension) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts': return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs': return 'javascript'
    case 'json':
    case 'jsonc': return 'json'
    case 'md':
    case 'mdx': return 'markdown'
    case 'html':
    case 'htm':
    case 'xml':
    case 'vue':
    case 'svelte': return 'html'
    case 'css':
    case 'scss':
    case 'sass':
    case 'less': return 'stylesheet'
    case 'yaml':
    case 'yml': return 'yaml'
    case 'py':
    case 'pyi': return 'python'
    case 'go': return 'go'
    case 'rs': return 'rust'
    case 'java':
    case 'kt':
    case 'kts': return 'java'
    case 'c':
    case 'h': return 'c'
    case 'cc':
    case 'cpp':
    case 'cxx':
    case 'hpp': return 'cpp'
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
    case 'ps1':
    case 'bat':
    case 'cmd': return 'shell'
    case 'sql': return 'sql'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'avif':
    case 'bmp':
    case 'ico':
    case 'svg': return 'image'
    case 'zip':
    case 'tar':
    case 'gz':
    case 'tgz':
    case 'rar':
    case '7z': return 'archive'
    case 'toml':
    case 'ini':
    case 'conf':
    case 'config':
    case 'properties': return 'settings'
    case 'txt':
    case 'log': return 'text'
    default: return 'generic'
  }
}

function fileTypeGlyph(kind: FileTypeIconKind): ReactNode {
  if (kind === 'git') return <IconBranchOutline16 size={14} />
  if (kind === 'settings') return <IconSettingsOutline16 size={14} />
  const label = TEXT_LABELS[kind]
  if (label !== undefined) return label
  return <ReferenceIcon kind="file" size={14} />
}

/** Render one VS Code-style type cue without shipping a separate icon theme. */
export function FileTypeIcon({ path, className }: { path: string; className?: string }) {
  const kind = fileTypeIconKind(path)
  const classes = className === undefined ? css.fileTypeIcon : `${css.fileTypeIcon} ${className}`
  return (
    <span className={classes} data-file-icon={kind} aria-hidden="true">
      {fileTypeGlyph(kind)}
    </span>
  )
}
