declare module 'virtual:dsh-monaco-assets' {
  export const cssText: string
  export const workerSources: Readonly<Record<'editor' | 'json' | 'css' | 'html' | 'typescript', string>>
}

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module 'monaco-editor/editor.js' {
  export * from 'monaco-editor'
}
