import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build as esbuild } from 'esbuild'
import ts from 'typescript'
import { WorkspaceAnalyzer } from '../upstream/deepseek-harness/packages/typert/generator/src/analyzer.ts'
import { FaceModelEmitter, type ModelEmitResult } from '../upstream/deepseek-harness/packages/typert/generator/src/emitter.ts'
import { WorkspaceTypertGenerator } from '../upstream/deepseek-harness/packages/typert/generator/src/workspace.ts'

const ROOT = resolve(import.meta.dirname, '..')
const UPSTREAM = resolve(ROOT, 'upstream/deepseek-harness')
const EXPECTED_UPSTREAM = 'a66e4702047846cdaa10c66c9d3df3951f5ea70d'
const MAX_CLIENT_RAW_BYTES = 16 * 1024 * 1024
const MAX_CLIENT_GZIP_BYTES = 4 * 1024 * 1024
const TEMP = resolve(ROOT, '.tmp')
const SHADOW_PACKAGE = resolve(UPSTREAM, 'packages/external/dsh-file-manager')
const TYPERT_HOST_CONFIG = resolve(TEMP, 'tsconfig.typert-host.json')
const CHECK_ONLY = process.argv.includes('--check')
const UPSTREAM_REMOTE_OWNERS = [
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
] as const

function pnpm(args: readonly string[]): void {
  execFileSync('pnpm', ['--pm-on-fail=ignore', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
  })
}

function git(args: readonly string[]): string {
  return execFileSync('git', args, { cwd: UPSTREAM, encoding: 'utf8', windowsHide: true }).trim()
}

function verifyUpstream(): void {
  if (!existsSync(resolve(UPSTREAM, 'package.json'))) {
    throw new Error('DeepSeek Harness submodule is not initialized; run git submodule update --init --recursive')
  }
  const actual = git(['rev-parse', 'HEAD'])
  if (actual !== EXPECTED_UPSTREAM) {
    throw new Error(`DeepSeek Harness is ${actual}; expected pinned commit ${EXPECTED_UPSTREAM}`)
  }
  if (git(['status', '--porcelain', '--untracked-files=no']) !== '') {
    throw new Error('DeepSeek Harness tracked files are modified; refusing a non-reproducible build')
  }
}

function clean(): void {
  for (const path of [resolve(ROOT, 'lib'), TYPERT_HOST_CONFIG, resolve(TEMP, 'monaco-assets.json')]) {
    const rel = relative(ROOT, path)
    if (rel.startsWith('..') || rel === '') throw new Error(`refusing to clean unsafe path ${path}`)
    rmSync(path, { recursive: true, force: true })
  }
  mkdirSync(resolve(ROOT, 'lib'), { recursive: true })
  mkdirSync(TEMP, { recursive: true })
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function materializeShadowPackage(): void {
  mkdirSync(resolve(SHADOW_PACKAGE, 'src/host'), { recursive: true })
  cpSync(resolve(ROOT, 'package.json'), resolve(SHADOW_PACKAGE, 'package.json'))
  for (const file of ['src/index.ts', 'src/types.ts', 'src/host/operations.ts']) {
    cpSync(resolve(ROOT, file), resolve(SHADOW_PACKAGE, file))
  }
  writeJson(resolve(SHADOW_PACKAGE, 'tsconfig.json'), {
    extends: resolve(UPSTREAM, 'tsconfig.base.json'),
    compilerOptions: {
      rootDir: 'src',
      outDir: 'lib/types',
      noEmit: true,
      rewriteRelativeImportExtensions: false,
    },
    include: ['src'],
    references: [
      { path: resolve(UPSTREAM, 'vendor/cordis') },
      { path: resolve(UPSTREAM, 'vendor/schemastery') },
      { path: resolve(UPSTREAM, 'packages/util/brand') },
      { path: resolve(UPSTREAM, 'packages/llm/llm') },
      { path: resolve(UPSTREAM, 'packages/core/session') },
      { path: resolve(UPSTREAM, 'packages/sandbox/sandbox') },
      { path: resolve(UPSTREAM, 'packages/fs/fs') },
      { path: resolve(UPSTREAM, 'packages/api/session-controller/tsconfig.host.json') },
      { path: resolve(UPSTREAM, 'packages/typert/protocol') },
    ],
  })

  const upstreamConfig = ts.readConfigFile(
    resolve(UPSTREAM, 'tsconfig.host.json'),
    ts.sys.readFile,
  )
  if (upstreamConfig.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(upstreamConfig.error.messageText, '\n'))
  }
  const references = (upstreamConfig.config.references as readonly { readonly path: string }[])
    .map(reference => ({ path: resolve(UPSTREAM, reference.path) }))
  writeJson(TYPERT_HOST_CONFIG, {
    extends: resolve(UPSTREAM, 'tsconfig.host.json'),
    files: [],
    include: [],
    references: [...references, { path: SHADOW_PACKAGE }],
  })
}

function generateTypert(): void {
  const workspace = new WorkspaceAnalyzer({
    root: UPSTREAM,
    hostConfig: TYPERT_HOST_CONFIG,
    faces: ['host'],
    packages: ['dsh-file-manager'],
    checkDiagnostics: false,
  }).analyze()
  const face = workspace.faces.find(candidate => candidate.face === 'host')
  if (face === undefined) throw new Error('Typert did not model the File Manager Host face')
  const artifact = new FaceModelEmitter(face).emit('dsh-file-manager')
  if (artifact.remote === undefined) {
    throw new Error('Typert did not produce the File Manager Remote artifact')
  }
  writeTypertArtifact(resolve(ROOT, 'lib'), artifact)
}

function cleanupShadowPackage(): void {
  rmSync(SHADOW_PACKAGE, { recursive: true, force: true })
  const externalParent = dirname(SHADOW_PACKAGE)
  if (existsSync(externalParent) && readdirSync(externalParent).length === 0) {
    rmdirSync(externalParent)
  }
}

/** Materialize generated Remote contracts consumed by referenced DSH client projects. */
function generateUpstreamRemoteContracts(): void {
  const artifacts = new WorkspaceTypertGenerator(UPSTREAM, { checkDiagnostics: false })
    .generate(UPSTREAM_REMOTE_OWNERS, ['host'])
  const owners = new Set<string>(UPSTREAM_REMOTE_OWNERS)
  for (const artifact of artifacts) {
    if (!owners.has(artifact.package)) continue
    const output = resolve(UPSTREAM, artifact.packageRoot, 'lib')
    mkdirSync(output, { recursive: true })
    writeTypertArtifact(output, artifact)
  }
  for (const owner of owners) {
    if (!artifacts.some(artifact => artifact.package === owner && artifact.remote !== undefined)) {
      throw new Error(`Typert did not produce the required upstream Remote contract: ${owner}`)
    }
  }
}

function writeTypertArtifact(
  output: string,
  artifact: ModelEmitResult,
): void {
  writeFileSync(resolve(output, `typert.${artifact.face}.js`), artifact.js)
  writeFileSync(resolve(output, `typert.${artifact.face}.d.ts`), artifact.dts)
  if (artifact.remote === undefined) return
  writeFileSync(resolve(output, 'typert.remote-client.js'), artifact.remote.js)
  writeFileSync(resolve(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
  writeFileSync(resolve(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
}

async function bundleText(entry: string): Promise<string> {
  const result = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
  })
  const output = result.outputFiles.find(file => file.path.endsWith('.js')) ?? result.outputFiles[0]
  if (output === undefined) throw new Error(`esbuild emitted no JavaScript for ${entry}`)
  return output.text
}

async function generateMonacoAssets(): Promise<void> {
  const monacoRoot = resolve(ROOT, 'node_modules/monaco-editor')
  const workerEntries = {
    editor: resolve(monacoRoot, 'esm/vs/editor/editor.worker.js'),
    json: resolve(monacoRoot, 'esm/vs/language/json/json.worker.js'),
    css: resolve(monacoRoot, 'esm/vs/language/css/css.worker.js'),
    html: resolve(monacoRoot, 'esm/vs/language/html/html.worker.js'),
    typescript: resolve(monacoRoot, 'esm/vs/language/typescript/ts.worker.js'),
  } as const
  const workerSources = Object.fromEntries(await Promise.all(
    Object.entries(workerEntries).map(async ([name, entry]) => [name, await bundleText(entry)]),
  ))
  const cssResult = await esbuild({
    absWorkingDir: ROOT,
    // Monaco 0.56 distributes styles through the same ESM graph as its public
    // entry rather than one editor.main.css file. Bundle that graph and retain
    // only esbuild's combined stylesheet; tsdown owns the JavaScript graph.
    entryPoints: [resolve(ROOT, 'src/client/monaco-runtime.ts')],
    bundle: true,
    write: false,
    outdir: resolve(TEMP, 'monaco-css'),
    minify: true,
    legalComments: 'none',
    loader: {
      '.ttf': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
      '.svg': 'dataurl',
      '.png': 'dataurl',
    },
  })
  const css = cssResult.outputFiles.find(file => file.path.endsWith('.css')) ?? cssResult.outputFiles[0]
  if (css === undefined) throw new Error('esbuild emitted no Monaco stylesheet')
  writeJson(resolve(TEMP, 'monaco-assets.json'), { cssText: css.text, workerSources })
}

function textArtifacts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return textArtifacts(path)
    return /(?:\.d\.ts|\.[cm]?js|\.map)$/.test(entry.name) ? [path] : []
  })
}

function verifyArtifacts(): void {
  const required = [
    'lib/index.js',
    'lib/index.js.map',
    'lib/client.js',
    'lib/client.js.map',
    'lib/types/index.d.ts',
    'lib/types/client/index.d.ts',
    'lib/typert.host.js',
    'lib/typert.host.d.ts',
    'lib/typert.remote-client.js',
    'lib/typert.remote-client.d.ts',
  ]
  for (const file of required) {
    if (!existsSync(resolve(ROOT, file))) throw new Error(`missing build artifact: ${file}`)
  }
  const client = readFileSync(resolve(ROOT, 'lib/client.js'), 'utf8')
  if (!client.includes('__ModuleLoader__.load') || !client.includes('dsh-file-manager')) {
    throw new Error('client.js is not a DSH dynamic module bundle')
  }
  if (!client.includes('MonacoEnvironment') || !client.includes('createObjectURL')) {
    throw new Error('client.js does not contain the self-hosted Monaco worker environment')
  }
  const localRoots = new Set([ROOT, UPSTREAM, ROOT.replaceAll('\\', '/'), UPSTREAM.replaceAll('\\', '/')])
  for (const file of textArtifacts(resolve(ROOT, 'lib'))) {
    const content = readFileSync(file, 'utf8')
    const leaked = [...localRoots].find(root => root !== '' && content.includes(root))
    if (leaked !== undefined) {
      throw new Error(`${relative(ROOT, file)} leaks the absolute build path ${leaked}`)
    }
  }
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    dsh?: { bundle?: { patch?: unknown } }
    files?: readonly string[]
  }
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('File Manager must expose ./cordis.patch.yml through dsh.bundle.patch')
  }
  const patchPath = resolve(ROOT, 'cordis.patch.yml')
  if (!existsSync(patchPath) || manifest.files?.includes('cordis.patch.yml') !== true) {
    throw new Error('File Manager bundle patch must exist and be included in the published files')
  }
  const patch = readFileSync(patchPath, 'utf8')
  if (!patch.includes('id: file-manager') || !patch.includes('name: dsh-file-manager')) {
    throw new Error('File Manager bundle patch does not insert its plugin row')
  }
  if (/^\s*disabled:\s*true\s*$/m.test(patch)) {
    throw new Error('File Manager is additive and must not disable an existing DSH provider')
  }
  const unexpected = readdirSync(resolve(ROOT, 'lib'))
    .filter(name => /-[A-Za-z0-9_-]{8,}\.(?:[cm]?js|css)(?:\.map)?$/.test(name))
  if (unexpected.length > 0) throw new Error(`unpublished runtime chunks: ${unexpected.join(', ')}`)
  const raw = statSync(resolve(ROOT, 'lib/client.js')).size
  const gzip = gzipSync(readFileSync(resolve(ROOT, 'lib/client.js'))).byteLength
  if (raw > MAX_CLIENT_RAW_BYTES || gzip > MAX_CLIENT_GZIP_BYTES) {
    throw new Error(
      `client.js exceeds its bundle budget: ${raw} raw bytes, ${gzip} gzip bytes`,
    )
  }
  console.log(`dsh-file-manager: client.js ${(raw / 1024 / 1024).toFixed(2)} MiB raw, ${(gzip / 1024 / 1024).toFixed(2)} MiB gzip`)
}

verifyUpstream()
clean()
materializeShadowPackage()
try {
  generateUpstreamRemoteContracts()
  pnpm(['exec', 'tsc', '-b', 'tsconfig.host.json'])
  generateTypert()
  pnpm(['exec', 'tsc', '-b', 'tsconfig.client.json'])
  if (CHECK_ONLY) {
    console.log('dsh-file-manager: Host and Client typecheck passed')
  } else {
    await generateMonacoAssets()
    pnpm(['exec', 'tsdown', '--env.DSH_BUILD_FACE', 'client'])
    verifyArtifacts()
  }
} finally {
  cleanupShadowPackage()
}
