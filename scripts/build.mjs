/** 使用固定版本 uni CLI，兼容工程根目录布局。无需 HBuilderX 登录。 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const platform = process.argv[2]
if (!['h5', 'app'].includes(platform)) throw new Error('Usage: node scripts/build.mjs h5|app')
const cli = resolve(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js')
const result = spawnSync(process.execPath, [cli, 'build', '-p', platform], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    UNI_INPUT_DIR: root,
    UNI_OUTPUT_DIR: resolve(root, 'unpackage/dist/build', platform === 'h5' ? 'web' : 'app-plus')
  }
})
process.exit(result.status ?? 1)
