import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { UserConfig } from 'tsdown'
import { defineConfig } from 'tsdown'
import { clientBundle } from './upstream/deepseek-harness/packages/client/tsdown.client.ts'

const PACKAGE_ID = 'dsh-file-manager'
const VIRTUAL_ASSETS = '\0dsh-file-manager:monaco-assets'
const EMPTY_MONACO_CSS = '\0dsh-file-manager:empty-monaco-css'

interface MonacoAssetManifest {
  readonly cssText: string
  readonly workerSources: Readonly<Record<string, string>>
}

function monacoPlugin() {
  const assetPath = resolve('.tmp/monaco-assets.json')
  return {
    name: 'dsh-file-manager-monaco-assets',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      if (source === 'virtual:dsh-monaco-assets') return VIRTUAL_ASSETS
      if (source.endsWith('.css') && importer?.includes('/monaco-editor/') === true) {
        return EMPTY_MONACO_CSS
      }
      return null
    },
    load(id: string) {
      if (id === EMPTY_MONACO_CSS) return 'export {}'
      if (id !== VIRTUAL_ASSETS) return null
      if (!existsSync(assetPath)) {
        throw new Error('missing .tmp/monaco-assets.json; run pnpm build instead of invoking tsdown directly')
      }
      const assets = JSON.parse(readFileSync(assetPath, 'utf8')) as MonacoAssetManifest
      return [
        `export const cssText = ${JSON.stringify(assets.cssText)};`,
        `export const workerSources = ${JSON.stringify(assets.workerSources)};`,
      ].join('\n')
    },
  }
}

const base = clientBundle(PACKAGE_ID, ['lib/types/index.js'], {
  lib: { sourcemap: true },
})

/** Extend DSH's standard dynamic-client bundle with self-contained Monaco assets. */
export default defineConfig((inlineConfig): UserConfig[] => {
  const configs = base({
    env: { ...inlineConfig.env, DSH_BUILD_FACE: 'client' },
  })
  return configs.map((config): UserConfig => {
    if (config.name !== `${PACKAGE_ID}/client`) return config
    return {
      ...config,
      alias: {
        ...(config.alias ?? {}),
        'dsh-file-manager/remote': resolve('lib/typert.remote-client.js'),
      },
      minify: true,
      plugins: [monacoPlugin(), ...(config.plugins ?? [])],
      outputOptions: {
        ...(config.outputOptions ?? {}),
        // DSH fetches one dynamic-plugin artifact; every lazy Monaco module is
        // folded into that entry rather than emitted as an unreachable chunk.
        codeSplitting: false,
      },
    }
  })
})
