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

  it('keeps documentation and development tooling independent of sibling repositories', () => {
    const implementationPlan = readFileSync(
      resolve(root, 'docs/dsh-file-manager-implementation-plan.md'),
      'utf8',
    )
    const developmentScript = readFileSync(resolve(root, 'scripts/dev.mts'), 'utf8')
    const buildScript = readFileSync(resolve(root, 'scripts/build.mts'), 'utf8')
    const developmentProfile = readFileSync(resolve(root, 'scripts/lib/dev-profile.mts'), 'utf8')
    const standaloneSurfaces = [
      implementationPlan,
      developmentScript,
      buildScript,
      developmentProfile,
    ].join('\n')

    expect(standaloneSurfaces).not.toContain(['dsh', 'embedded', 'codex'].join('-'))
    expect(standaloneSurfaces).not.toContain("execFileSync('pnpm'")
    expect(developmentScript).toContain('ensureDevelopmentLink')
    expect(developmentScript).toContain('installDevelopmentTarball')
    expect(developmentScript).toContain("await runDsh(['web'], env)")
    expect(developmentProfile).toContain("'link:.'")
  })

  it('exposes the reference development commands and Embedded Codex integration', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const embeddedIntegration = readFileSync(resolve(root, 'scripts/embedded-codex.mts'), 'utf8')
    expect(manifest.scripts).toEqual({
      build: 'tsx scripts/build.mts',
      'build:embedded-codex': 'tsx scripts/embedded-codex.mts',
      test: 'tsx scripts/test.mts',
      dev: 'tsx scripts/dev.mts start',
      'dev:install': 'tsx scripts/dev.mts install',
      'dev:web': 'tsx scripts/dev.mts web',
      'dev:remove': 'tsx scripts/dev.mts remove',
      prepack: 'tsx scripts/build.mts',
    })
    expect(embeddedIntegration).toContain('packTarball()')
    expect(embeddedIntegration).toContain('process.env.DSH_EMBEDDED_CODEX_ROOT')
    expect(embeddedIntegration).toContain("resolve(REPOSITORY_ROOT, '..', 'dsh-embedded-codex')")
    expect(embeddedIntegration).not.toMatch(/[A-Z]:\\\\dsh-embedded-codex/)
    expect(embeddedIntegration).toContain('DSH_HOME: EMBEDDED_DSH_HOME')
    expect(embeddedIntegration).not.toContain("'link:.'")
    expect(embeddedIntegration).toContain('resetEmbeddedProfileModules()')
    expect(embeddedIntegration).toContain('verifyPackedInstallation()')
  })

  it('registers File between Chat and Trajectory through conversation.view', () => {
    const source = readFileSync(resolve(root, 'src/client/index.ts'), 'utf8')
    expect(source).toContain("const disposeRemote = await ctx.remote.$mount(fileManagerRemote)")
    expect(source).toContain("'remote.fileManager'")
    expect(source).toContain('const ui = ctx.inject(')
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
