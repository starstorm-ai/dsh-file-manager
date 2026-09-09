/** Host loader entry and Remote owner for the DSH File Manager. */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { FileManagerOperations, type ResolvedFileManagerConfig } from './host/operations.ts'
import type {
  FileManagerListRequest,
  FileManagerListValue,
  FileManagerReadRequest,
  FileManagerReadValue,
  FileManagerWriteRequest,
  FileManagerWriteValue,
} from './types.ts'

export type * from './types.ts'
export { FileManagerOperations } from './host/operations.ts'

/** Default maximum full-file payload: 2 MiB. */
export const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024
/** Default maximum visible children from one directory. */
export const DEFAULT_MAX_ENTRIES_PER_DIRECTORY = 2_000

/** Deployment policy for workspace browsing and explicit saves. */
export interface Config {
  readonly maxFileBytes?: number
  readonly maxEntriesPerDirectory?: number
  readonly showHiddenByDefault?: boolean
  readonly editable?: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the generated `fileManager` Remote namespace. */
    fileManager: FileManagerController
  }
}

/** Resolve and defensively validate config even when constructed outside Loader. */
export function resolveFileManagerConfig(config: Config = {}): ResolvedFileManagerConfig {
  const maxFileBytes = config.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const maxEntriesPerDirectory = config.maxEntriesPerDirectory ?? DEFAULT_MAX_ENTRIES_PER_DIRECTORY
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) {
    throw new TypeError('dsh-file-manager: maxFileBytes must be a positive safe integer')
  }
  if (!Number.isSafeInteger(maxEntriesPerDirectory) || maxEntriesPerDirectory < 1) {
    throw new TypeError('dsh-file-manager: maxEntriesPerDirectory must be a positive safe integer')
  }
  return {
    maxFileBytes,
    maxEntriesPerDirectory,
    showHiddenByDefault: config.showHiddenByDefault ?? false,
    editable: config.editable ?? true,
  }
}

/** Session-addressed, workspace-confined File Manager Remote service. */
export class FileManagerController extends TypertRemoteService {
  static inject = ['fs', 'sessionController', 'typert']

  static Config: Schema<Config> = Schema.object({
    maxFileBytes: Schema.natural().min(1).default(DEFAULT_MAX_FILE_BYTES),
    maxEntriesPerDirectory: Schema.natural().min(1).default(DEFAULT_MAX_ENTRIES_PER_DIRECTORY),
    showHiddenByDefault: Schema.boolean().default(false),
    editable: Schema.boolean().default(true),
  })

  private readonly operations: FileManagerOperations

  /** @param ctx - Host context carrying Session inspection and filesystem capabilities. */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'fileManager', { namespace: 'fileManager' })
    this.operations = new FileManagerOperations(
      ctx.fs,
      (sessionId, signal) => ctx.sessionController.inspect(sessionId, signal),
      resolveFileManagerConfig(config),
    )
  }

  /** List one bounded directory level inside the addressed Session workspace. */
  @Remote('list')
  list(request: FileManagerListRequest, signal: AbortSignal): Promise<FileManagerListValue> {
    return this.operations.list(request, signal)
  }

  /** Read one complete, bounded UTF-8 file. */
  @Remote('read')
  read(request: FileManagerReadRequest, signal: AbortSignal): Promise<FileManagerReadValue> {
    return this.operations.read(request, signal)
  }

  /** Atomically save one previously read regular text file. */
  @Remote('write')
  write(request: FileManagerWriteRequest, signal: AbortSignal): Promise<FileManagerWriteValue> {
    return this.operations.write(request, signal)
  }
}

export default FileManagerController
