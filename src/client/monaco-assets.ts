/** Lifecycle-owned Monaco stylesheet and inline worker environment. */

import { cssText, workerSources } from 'virtual:dsh-monaco-assets'

interface MonacoEnvironmentShape {
  readonly getWorker?: (moduleId: string, label: string) => Worker
  readonly getWorkerUrl?: (moduleId: string, label: string) => string
}

type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: MonacoEnvironmentShape }

/** Select the smallest language worker matching a Monaco label. */
export function workerKindForLabel(label: string): keyof typeof workerSources {
  if (label === 'json') return 'json'
  if (label === 'css' || label === 'scss' || label === 'less') return 'css'
  if (label === 'html' || label === 'handlebars' || label === 'razor') return 'html'
  if (label === 'typescript' || label === 'javascript') return 'typescript'
  return 'editor'
}

/** Install assets with a disposer suitable for a Cordis effect. */
export function installMonacoAssets(): () => void {
  if (typeof document === 'undefined' || typeof Worker === 'undefined') return () => {}
  const owner = document.createElement('style')
  owner.dataset.dshFileManagerMonaco = ''
  owner.textContent = cssText
  document.head.append(owner)

  const global = globalThis as MonacoGlobal
  const previous = global.MonacoEnvironment
  const installed: MonacoEnvironmentShape = {
    ...previous,
    getWorker: (_moduleId, label) => {
      const source = workerSources[workerKindForLabel(label)]
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
      try {
        return new Worker(url, { type: 'module', name: `dsh-monaco-${label || 'editor'}` })
      } finally {
        // The worker constructor captures the URL. Keeping one URL per worker
        // alive after construction only leaks browser resources.
        queueMicrotask(() => { URL.revokeObjectURL(url) })
      }
    },
  }
  global.MonacoEnvironment = installed

  return () => {
    owner.remove()
    if (global.MonacoEnvironment !== installed) return
    if (previous === undefined) delete global.MonacoEnvironment
    else global.MonacoEnvironment = previous
  }
}

