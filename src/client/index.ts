/** Browser plugin: mount the generated Remote and contribute the File conversation view. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import fileManagerRemote from 'dsh-file-manager/remote'
// Type-only imports activate the owning packages' Context and SlotMap merges.
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { FileView, type FileManagerViewInjected } from './FileView.tsx'
import { createFileManagerViewStore } from './file-store.ts'
import { en, NS, zh } from './locales.ts'
import { clientError, FileManagerSessionModel } from './model.ts'
import { installMonacoAssets } from './monaco-assets.ts'

export type { FileManagerLocaleKey } from './locales.ts'
export type {
  FileManagerClientError,
  FileManagerDirectoryState,
  FileManagerModelSnapshot,
  FileManagerRemoteAdapter,
} from './model.ts'

/** Required services for the generated Remote, Session source, slot, locale, and theme. */
export const inject = ['remote', 'sessions', 'slots', 'uiSession', 'locale', 'theme']

/** Register the File Manager UI after its generated Remote namespace is visible. */
function registerUi(ctx: Context): void {
  const theme = createSnapshotStore(ctx.theme.getTheme())
  ctx.on('theme/change', snapshot => { theme.set(snapshot) })
  ctx.effect(() => installMonacoAssets(), 'dsh-file-manager: Monaco assets')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-file-manager: dictionaries')

  const models = new WeakMap<SessionBinding, FileManagerSessionModel>()
  const liveModels = new Set<FileManagerSessionModel>()
  const modelFor = (binding: SessionBinding): FileManagerSessionModel => {
    const existing = models.get(binding)
    if (existing !== undefined) return existing
    const model = new FileManagerSessionModel(binding.sessionId, {
      list: (request, signal) => ctx.remote.fileManager.list(request, signal),
      read: (request, signal) => ctx.remote.fileManager.read(request, signal),
      write: (request, signal) => ctx.remote.fileManager.write(request, signal),
    })
    models.set(binding, model)
    liveModels.add(model)
    binding.ctx.effect(() => () => {
      model.dispose()
      liveModels.delete(model)
    }, `dsh-file-manager: Session ${binding.sessionId}`)
    return model
  }
  const modelForSession = (sessionId: SessionId): FileManagerSessionModel => {
    const binding = ctx.sessions.binding(sessionId)
    if (binding === undefined) throw new Error(`dsh-file-manager: Session "${sessionId}" is unavailable`)
    return modelFor(binding)
  }

  ctx.effect(() => () => {
    for (const model of liveModels) model.dispose()
    liveModels.clear()
  }, 'dsh-file-manager: Session model collection')
  ctx.on('connection/reset', () => {
    for (const model of liveModels) void model.handleConnected()
  })

  ctx.uiSession.provide({
    hooks: ['fileManager'],
    resolve: binding => ({ hooks: { fileManager: modelFor(binding).snapshot } }),
  })

  const store = createFileManagerViewStore()
  let requestId = 0
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'file',
    order: 5,
    label: () => t('view.file'),
    locale: NS,
    store,
    inject: (sessionId: SessionId, actions): FileManagerViewInjected => {
      const model = modelForSession(sessionId)
      return {
        hooks: { theme },
        loadDirectory: path => model.loadDirectory(path),
        openFile: (path) => {
          const currentRequest = ++requestId
          actions.startOpen(path, currentRequest)
          void model.readFile(path).then(
            value => { actions.resolveOpen(currentRequest, value) },
            error => { actions.failOpen(currentRequest, clientError(error)) },
          )
        },
        closeFile: (path) => {
          model.cancelRead(path)
          actions.closeFile(path)
        },
        saveFile: async (path, content, expectedVersion) => {
          const currentRequest = ++requestId
          actions.startSave(path, currentRequest)
          try {
            const value = await model.writeFile(path, content, expectedVersion)
            actions.resolveSave(currentRequest, value.version, value.size, content)
            return true
          } catch (error: unknown) {
            actions.failSave(currentRequest, clientError(error))
            return false
          }
        },
      }
    },
  }, FileView))

}

/** Mount the File Manager namespace and register one order-5 conversation View. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(fileManagerRemote)
  const ui = ctx.inject([
    'sessions',
    'remote.fileManager',
    'slots',
    'uiSession',
    'locale',
    'theme',
  ], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}

