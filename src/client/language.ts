/** Monaco language inference from a normalized workspace-relative path. */

const FILE_NAMES: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
  gemfile: 'ruby',
  rakefile: 'ruby',
  'package.json': 'json',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
  '.gitignore': 'plaintext',
  '.gitattributes': 'plaintext',
  '.editorconfig': 'ini',
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  vue: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  md: 'markdown',
  markdown: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  toml: 'ini',
  ini: 'ini',
  env: 'ini',
  graphql: 'graphql',
  gql: 'graphql',
}

/** Infer the editor language id, falling back to plain text. */
export function languageForPath(path: string): string {
  const name = path.split('/').at(-1)?.toLowerCase() ?? ''
  const exact = FILE_NAMES[name]
  if (exact !== undefined) return exact
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  return EXTENSIONS[extension] ?? 'plaintext'
}

/** Human-readable language label for the status strip. */
export function languageLabel(language: string): string {
  return language === 'plaintext'
    ? 'Plain Text'
    : language === 'jsonc'
      ? 'JSON with Comments'
      : language === 'typescript'
        ? 'TypeScript'
        : language === 'javascript'
          ? 'JavaScript'
          : language.charAt(0).toUpperCase() + language.slice(1)
}
