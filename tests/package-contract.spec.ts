import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('package and DSH composition contract', () => {
  it('ships an additive bundle layer without source patches', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(existsSync(resolve(root, 'cordis.patch.yml'))).toBe(true)
    expect(existsSync(resolve(root, 'dsh.bundle.patch'))).toBe(false)
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('id: file-manager')
    expect(patch).toContain('name: dsh-file-manager')
    expect(patch).not.toContain('disabled: true')
  })

  it('registers File between Chat and Trajectory through conversation.view', () => {
    const source = readFileSync(resolve(root, 'src/client/index.ts'), 'utf8')
    expect(source).toContain("ctx.slots.inject('conversation.view'")
    expect(source).toContain("id: 'file'")
    expect(source).toContain('order: 5')
    expect(source).toContain('createFileManagerViewStore()')
  })

  it('keeps browser file requests session-addressed and Host-authoritative', () => {
    const types = readFileSync(resolve(root, 'src/types.ts'), 'utf8')
    const host = readFileSync(resolve(root, 'src/host/operations.ts'), 'utf8')
    expect(types).toContain('readonly sessionId: SessionId')
    expect(host).toContain('this.inspectSession(sessionId, signal)')
    expect(host).toContain('this.fs.contains(workspace.root, entry.target)')
    expect(host).toContain("mode: 'workspace-write'")
  })

  it('pins bundled Monaco as a build-only dependency in the lockfile', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const lockfile = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')
    expect(manifest.dependencies?.['monaco-editor']).toBeUndefined()
    expect(manifest.devDependencies?.['monaco-editor']).toBe('0.56.0')
    expect(lockfile).toContain('monaco-editor@0.56.0:')
    expect(lockfile).toContain('specifier: 0.56.0')
  })
})
