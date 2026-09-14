/** Typed dictionaries for the File Manager view. */

export const NS = 'file-manager'

export const zh = {
  'view.file': '文件',
  'explorer.title': '文件资源管理器',
  'explorer.root': '工作区',
  'explorer.show': '显示文件资源管理器',
  'explorer.hide': '隐藏文件资源管理器',
  'explorer.loading': '正在加载目录…',
  'explorer.empty': '空目录',
  'explorer.truncated': '条目过多，仅显示部分内容',
  'explorer.resize': '调整文件资源管理器宽度',
  'toolbar.aria': '文件工具栏',
  'toolbar.refresh': '刷新',
  'toolbar.showHidden': '显示隐藏文件',
  'toolbar.hideHidden': '隐藏隐藏文件',
  'toolbar.save': '保存',
  'toolbar.saving': '保存中…',
  'toolbar.dirty': '未保存',
  'editor.emptyTitle': '选择一个文件',
  'editor.emptyBody': '从左侧工作区中选择文本文件进行查看或编辑。',
  'editor.loading': '正在打开文件…',
  'editor.readOnly': '只读',
  'editor.editable': '可编辑',
  'editor.encoding': 'UTF-8',
  'editor.position': '行 {line}，列 {column}',
  'error.title': '无法完成文件操作',
  'error.noWorkspace': '当前会话没有可用的工作区。',
  'error.invalidPath': '文件路径无效。',
  'error.outsideWorkspace': '该路径位于当前工作区之外。',
  'error.notFound': '文件或目录已不存在，请刷新后重试。',
  'error.notDirectory': '该路径不是目录。',
  'error.notFile': '该路径不是普通文件。',
  'error.notText': '此文件不是有效的 UTF-8 文本，无法预览。',
  'error.tooLarge': '文件超过此工作区允许的大小。',
  'error.readOnly': '此文件管理器已配置为只读。',
  'error.stale': '磁盘上的文件已经变化，本地内容尚未覆盖它。',
  'error.changed': '读取期间文件发生变化，请重试。',
  'error.permission': '没有访问此文件的权限。',
  'error.generic': '文件系统操作失败，请重试。',
  'action.retry': '重试',
  'action.reload': '重新载入',
  'action.dismiss': '关闭',
  'confirm.title': '当前文件有未保存的修改',
  'confirm.body': '打开另一个文件前，要如何处理当前修改？',
  'confirm.saveAndOpen': '保存并打开',
  'confirm.discardAndOpen': '放弃并打开',
  'confirm.cancel': '取消',
  'status.workspaceLocked': '范围已锁定到当前会话工作区',
} as const

export type FileManagerLocaleKey = keyof typeof zh

/** Namespace-bound translator shared by presentation modules. */
export type FileManagerTranslate =
  import('@deepseek-ai/dsh-client-ui-slots').TranslateNS<typeof NS>

/** Map stable Host/transport errors to presentation copy without exposing diagnostics. */
export function fileManagerErrorKey(code: string): FileManagerLocaleKey {
  switch (code) {
    case 'file-manager/no-workspace': return 'error.noWorkspace'
    case 'file-manager/invalid-path': return 'error.invalidPath'
    case 'file-manager/outside-workspace': return 'error.outsideWorkspace'
    case 'file-manager/not-found': return 'error.notFound'
    case 'file-manager/not-directory': return 'error.notDirectory'
    case 'file-manager/not-file': return 'error.notFile'
    case 'file-manager/not-text': return 'error.notText'
    case 'file-manager/too-large': return 'error.tooLarge'
    case 'file-manager/read-only': return 'error.readOnly'
    case 'file-manager/stale-version': return 'error.stale'
    case 'file-manager/changed': return 'error.changed'
    case 'file-manager/permission-denied': return 'error.permission'
    default: return 'error.generic'
  }
}

/** Render a localized domain error and retain diagnostics for unknown transport failures. */
export function fileManagerErrorText(
  error: { readonly code: string; readonly message?: string },
  t: FileManagerTranslate,
): string {
  const key = fileManagerErrorKey(error.code)
  const summary = t(key)
  if (key !== 'error.generic') return summary
  const message = error.message?.trim()
  return message === undefined || message === ''
    ? `${summary} [${error.code}]`
    : `${summary} [${error.code}] ${message}`
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workspace file explorer and Monaco editor copy. */
    'file-manager': FileManagerLocaleKey
  }
}

export const en: Record<FileManagerLocaleKey, string> = {
  'view.file': 'File',
  'explorer.title': 'File Explorer',
  'explorer.root': 'Workspace',
  'explorer.show': 'Show File Explorer',
  'explorer.hide': 'Hide File Explorer',
  'explorer.loading': 'Loading directory…',
  'explorer.empty': 'Empty directory',
  'explorer.truncated': 'Too many entries; only part of this directory is shown',
  'explorer.resize': 'Resize File Explorer',
  'toolbar.aria': 'File toolbar',
  'toolbar.refresh': 'Refresh',
  'toolbar.showHidden': 'Show hidden files',
  'toolbar.hideHidden': 'Hide hidden files',
  'toolbar.save': 'Save',
  'toolbar.saving': 'Saving…',
  'toolbar.dirty': 'Unsaved',
  'editor.emptyTitle': 'Select a file',
  'editor.emptyBody': 'Choose a text file from the workspace to view or edit it.',
  'editor.loading': 'Opening file…',
  'editor.readOnly': 'Read only',
  'editor.editable': 'Editable',
  'editor.encoding': 'UTF-8',
  'editor.position': 'Ln {line}, Col {column}',
  'error.title': 'The file operation could not be completed',
  'error.noWorkspace': 'This Session has no available workspace.',
  'error.invalidPath': 'The file path is invalid.',
  'error.outsideWorkspace': 'That path is outside the current workspace.',
  'error.notFound': 'The file or directory no longer exists. Refresh and try again.',
  'error.notDirectory': 'That path is not a directory.',
  'error.notFile': 'That path is not a regular file.',
  'error.notText': 'This is not valid UTF-8 text and cannot be previewed.',
  'error.tooLarge': 'The file is larger than this workspace allows.',
  'error.readOnly': 'This File Manager is configured read only.',
  'error.stale': 'The file changed on disk. Your local content was not overwritten.',
  'error.changed': 'The file changed while it was being read. Try again.',
  'error.permission': 'You do not have permission to access this file.',
  'error.generic': 'The filesystem operation failed. Try again.',
  'action.retry': 'Retry',
  'action.reload': 'Reload',
  'action.dismiss': 'Dismiss',
  'confirm.title': 'This file has unsaved changes',
  'confirm.body': 'What should happen to the current changes before another file opens?',
  'confirm.saveAndOpen': 'Save and open',
  'confirm.discardAndOpen': 'Discard and open',
  'confirm.cancel': 'Cancel',
  'status.workspaceLocked': 'Scope locked to this Session workspace',
}
