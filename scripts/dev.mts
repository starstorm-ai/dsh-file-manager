import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runDsh } from './lib/dsh.mts'
import {
  ensureDevelopmentLinks,
  hasDevelopmentEnvironment,
  installDevelopmentTarball,
  removeFileManager,
} from './lib/dev-profile.mts'
import { packTarball } from './lib/package.mts'
import {
  DEVELOPMENT_DSH_HOME,
  EMBEDDED_CODEX_ROOT,
  EMBEDDED_DSH_BIN,
  REPOSITORY_ROOT,
} from './lib/paths.mts'
import { pnpm } from './lib/process.mts'

const action = process.argv[2] ?? 'start'
if (action !== 'start' && action !== 'install' && action !== 'web'
  && action !== 'dump' && action !== 'remove') {
  throw new Error('usage: tsx scripts/dev.mts <start|install|web|dump|remove>')
}

function assertEmbeddedCheckout(): void {
  const manifestPath = resolve(EMBEDDED_CODEX_ROOT, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(
      `dsh-embedded-codex was not found at ${EMBEDDED_CODEX_ROOT}; place both repositories side by side `
      + 'or set DSH_EMBEDDED_CODEX_ROOT',
    )
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown }
  if (manifest.name !== 'dsh-embedded-codex') {
    throw new Error(`${EMBEDDED_CODEX_ROOT} is not a dsh-embedded-codex checkout`)
  }
  if (!existsSync(resolve(EMBEDDED_CODEX_ROOT, 'node_modules'))) {
    throw new Error(`dependencies are missing in ${EMBEDDED_CODEX_ROOT}; run pnpm install --frozen-lockfile there first`)
  }
}

async function buildDevelopmentStack(): Promise<void> {
  assertEmbeddedCheckout()
  process.stdout.write('building the pinned Embedded Codex DSH host\n')
  await pnpm(['run', 'build'], { cwd: EMBEDDED_CODEX_ROOT })
  process.stdout.write('building dsh-file-manager\n')
  await pnpm(['run', 'build'], { cwd: REPOSITORY_ROOT })
  if (!existsSync(EMBEDDED_DSH_BIN)) {
    throw new Error(`Embedded Codex build did not emit its DSH CLI at ${EMBEDDED_DSH_BIN}`)
  }
}

const env = { ...process.env, DSH_HOME: DEVELOPMENT_DSH_HOME }
mkdirSync(DEVELOPMENT_DSH_HOME, { recursive: true })

if (action === 'start') {
  await buildDevelopmentStack()
  const linked = await ensureDevelopmentLinks(DEVELOPMENT_DSH_HOME, env)
  process.stdout.write(linked
    ? `linked Embedded Codex and File Manager into ${DEVELOPMENT_DSH_HOME}\n`
    : 'development links are current; skipped profile installation\n')
  process.stdout.write('starting Embedded Codex Web with Chat | File | 轨迹\n')
  await runDsh(['web'], env, REPOSITORY_ROOT)
} else if (action === 'install') {
  await buildDevelopmentStack()
  const tarball = await packTarball()
  await installDevelopmentTarball(DEVELOPMENT_DSH_HOME, tarball, env)
  process.stdout.write(`installed packed File Manager ${tarball} beside linked Embedded Codex\n`)
} else {
  assertEmbeddedCheckout()
  if (!existsSync(EMBEDDED_DSH_BIN)) {
    throw new Error('Embedded Codex DSH is not built; run pnpm dev first')
  }
  if (action === 'web' || action === 'dump') {
    if (!hasDevelopmentEnvironment(DEVELOPMENT_DSH_HOME)) {
      throw new Error('the shared development profile is not ready; run pnpm dev or pnpm dev:install first')
    }
    await runDsh(action === 'web' ? ['web'] : ['--profile', 'web', '--dump-config'], env, REPOSITORY_ROOT)
  } else {
    const removed = await removeFileManager(DEVELOPMENT_DSH_HOME, env)
    process.stdout.write(removed
      ? 'removed File Manager; Embedded Codex remains installed\n'
      : 'File Manager is not installed in the Embedded Codex development profile\n')
  }
}
