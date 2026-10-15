import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../', import.meta.url))
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(process.execPath, ['scripts/build.mjs', 'app'])
const config = JSON.parse(readFileSync(resolve(root, 'android-runtime.json')))
const response = await fetch(config.url)
if (!response.ok) throw new Error(`Runtime download failed: HTTP ${response.status}`)
const bytes = Buffer.from(await response.arrayBuffer())
if (createHash('sha256').update(bytes).digest('hex') !== config.sha256) throw new Error('Runtime checksum mismatch')
const runtime = resolve(root, 'unpackage/runtime/NucPharm-runtime.apk')
mkdirSync(resolve(root, 'unpackage/runtime'), { recursive: true })
writeFileSync(runtime, bytes)
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
const tools = process.env.ANDROID_BUILD_TOOLS || (sdk && resolve(sdk, 'build-tools/36.0.0'))
if (!tools) throw new Error('Set ANDROID_HOME or ANDROID_BUILD_TOOLS before building Android')
run(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [
  'scripts/package-android.py', '--runtime', runtime, '--build-tools', tools,
  ...(process.argv.includes('--require-release') ? ['--require-release'] : [])
])
