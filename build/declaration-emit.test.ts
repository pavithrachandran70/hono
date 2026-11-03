import { execSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc')
const fixture = fileURLToPath(new URL('./fixtures/declaration-emit', import.meta.url))
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const distPath = join(packageRoot, 'dist')

// `pnpm build` creates dist/ before types and the cjs package marker exist.
// Waiting on the directory alone lets the other file validate a partial build.
const publishedDistReady = () =>
  existsSync(distPath) &&
  existsSync(join(distPath, 'types/index.d.ts')) &&
  existsSync(join(distPath, 'cjs/package.json'))

const ensurePublishedDist = () => {
  if (publishedDistReady()) {
    return
  }

  const lockPath = join(
    tmpdir(),
    `hono-dist-${createHash('sha1').update(packageRoot).digest('hex')}.lock`
  )
  const started = Date.now()
  while (!publishedDistReady()) {
    if (Date.now() - started > 180_000) {
      throw new Error('timed out waiting for dist/ to be built')
    }
    try {
      if (existsSync(lockPath) && Date.now() - statSync(lockPath).mtimeMs > 180_000) {
        unlinkSync(lockPath)
      }
    } catch {
      // The lock disappeared between the exists check and the stat.
    }

    let lock: number | undefined
    try {
      lock = openSync(lockPath, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
      continue
    }

    try {
      if (!publishedDistReady()) {
        console.log('dist/ not found, running pnpm build...')
        execSync('pnpm build', { cwd: packageRoot, stdio: 'inherit' })
      }
    } finally {
      closeSync(lock)
      try {
        unlinkSync(lockPath)
      } catch {
        // Another worker may already have removed the lock.
      }
    }
  }
}

describe('published declarations', () => {
  beforeAll(ensurePublishedDist, 180_000)

  it('let consumers emit declarations for types inferred from hono', { timeout: 30_000 }, () => {
    // The fixture must live outside this package: inside it, tsc can always reach
    // `dist/types/*` with a relative path and never reports TS2883.
    const project = mkdtempSync(join(tmpdir(), 'hono-declaration-emit-'))
    try {
      cpSync(fixture, project, { recursive: true })
      mkdirSync(join(project, 'node_modules'))
      symlinkSync(packageRoot, join(project, 'node_modules', 'hono'), 'dir')
      writeFileSync(join(project, 'package.json'), '{ "type": "module" }\n')

      const result = spawnSync(
        process.execPath,
        [compiler, '--project', project, '--outDir', join(project, 'out')],
        { encoding: 'utf8' }
      )
      // Without `export {}` in the bundled `.d.ts`, tsc fails with TS2883 here:
      // internal aliases such as the return type of `c.json()` look exported from
      // `hono/dist/types/...`, which is not reachable through the package exports.
      expect(result.stdout + result.stderr).toBe('')
      expect(result.status).toBe(0)
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
