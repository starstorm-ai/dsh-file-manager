/** Pack the production artifact and verify its install-facing contract. */

import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUTPUT = resolve(ROOT, '.tmp/package-verification')

function assertInsideRoot(path: string): void {
  const value = relative(ROOT, path)
  if (value === '' || value.startsWith('..')) {
    throw new Error(`refusing unsafe package verification path: ${path}`)
  }
}

assertInsideRoot(OUTPUT)
rmSync(OUTPUT, { recursive: true, force: true })
mkdirSync(OUTPUT, { recursive: true })

execFileSync('pnpm', [
  '--pm-on-fail=ignore',
  '--config.ignore-scripts=true',
  'pack',
  '--pack-destination', OUTPUT,
], {
  cwd: ROOT,
  stdio: 'inherit',
  windowsHide: true,
})

const archives = readdirSync(OUTPUT).filter(name => name.endsWith('.tgz'))
if (archives.length !== 1) throw new Error(`expected one package archive, received ${archives.length}`)
const archive = resolve(OUTPUT, archives[0]!)
const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
  .trim()
  .split('\n')

const required = [
  'package/package.json',
  'package/README.md',
  'package/LICENSE',
  'package/THIRD_PARTY_NOTICES.md',
  'package/THIRD_PARTY_NOTICES.txt',
  'package/cordis.patch.yml',
  'package/lib/index.js',
  'package/lib/client.js',
  'package/lib/typert.host.js',
  'package/lib/typert.remote-client.js',
  'package/lib/types/index.d.ts',
  'package/lib/types/client/index.d.ts',
]
for (const path of required) {
  if (!entries.includes(path)) throw new Error(`packed archive is missing ${path}`)
}

const forbidden = ['package/src/', 'package/upstream/', 'package/node_modules/', 'package/.tmp/']
for (const prefix of forbidden) {
  if (entries.some(entry => entry.startsWith(prefix))) {
    throw new Error(`packed archive unexpectedly contains ${prefix}`)
  }
}
if (entries.some(entry => /package\/lib\/.+-[A-Za-z0-9_-]{8,}\.js$/.test(entry))) {
  throw new Error('packed archive contains an unreferenced hashed runtime chunk')
}

const packedManifest = JSON.parse(execFileSync(
  'tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' },
)) as {
  dsh?: { bundle?: { patch?: unknown } }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
if (packedManifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
  throw new Error('packed plugin must declare dsh.bundle.patch as ./cordis.patch.yml')
}
const packedPatch = execFileSync(
  'tar', ['-xOf', archive, 'package/cordis.patch.yml'], { encoding: 'utf8' },
)
if (!packedPatch.includes('id: file-manager') || !packedPatch.includes('name: dsh-file-manager')) {
  throw new Error('packed bundle patch does not insert the File Manager row')
}
if (/^\s*disabled:\s*true\s*$/m.test(packedPatch)) {
  throw new Error('packed File Manager bundle unexpectedly disables a DSH provider')
}
if (packedManifest.dependencies?.['monaco-editor'] !== undefined) {
  throw new Error('Monaco must remain a build-only dependency after being bundled')
}
if (packedManifest.devDependencies?.['monaco-editor'] !== '0.56.0') {
  throw new Error('packed manifest does not pin the tested Monaco version')
}

for (const file of ['lib/index.js', 'lib/client.js']) {
  execFileSync(process.execPath, ['--check', resolve(ROOT, file)], { stdio: 'inherit' })
}

const size = statSync(archive).size
const currentManifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string }
console.log(
  `dsh-file-manager@${currentManifest.version}: package verified (${entries.length} files, ${(size / 1024 / 1024).toFixed(2)} MiB)`,
)
