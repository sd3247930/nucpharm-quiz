/**
 * 一键回归：数据管线 + 资产校验 + 安全自查 + 单元/集成/端到端测试。
 *
 * 用法：
 *   node tests/run-all.mjs            # 全量
 *   node tests/run-all.mjs --node-only  # 只跑 Node 测试（跳过 Python 数据管线）
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const nodeOnly = process.argv.includes('--node-only')

const python = process.platform === 'win32' ? 'python' : 'python3'

const steps = []

function step(name, command, args, options = {}) {
	process.stdout.write(`\n=== ${name} ===\n`)
	const result = spawnSync(command, args, {
		cwd: ROOT,
		stdio: 'inherit',
		env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
		...options
	})
	const ok = result.status === 0
	steps.push([name, ok ? 'PASS' : `FAIL(status=${result.status})`])
	return ok
}

let allOk = true

if (!nodeOnly) {
	allOk = step('题库导入与硬门禁', python, ['scripts/import-questions.py']) && allOk
	allOk = step('题库独立校验', python, ['scripts/audit-question-bank.py']) && allOk
	allOk = step('品牌资产与数据产物校验', python, ['scripts/verify-assets.py']) && allOk
	allOk = step('安全与纯净度自查', python, ['scripts/security-audit.py']) && allOk
}

const nodeTestArgs = [
	'--import',
	'./tests/support/register.mjs',
	'--test',
	'tests/unit/*.test.mjs',
	'tests/integration/*.test.mjs'
]
allOk = step('Node 单元测试 + 集成测试', process.execPath, nodeTestArgs) && allOk

if (existsSync(join(ROOT, 'unpackage', 'dist', 'build', 'web'))) {
	allOk = step('H5 端到端测试（冒烟 + 真实交互）', process.execPath, ['--test', 'tests/e2e/*.test.mjs']) && allOk
} else {
	process.stdout.write('\n=== H5 端到端冒烟测试 ===\n跳过：尚未构建 H5 产物\n')
	steps.push(['H5 端到端冒烟测试', 'NOT_RUN（未构建）'])
}

process.stdout.write('\n================ 汇总 ================\n')
for (const [name, status] of steps) {
	process.stdout.write(`  ${status.startsWith('PASS') ? '✓' : status.startsWith('FAIL') ? '✗' : '•'} ${name}: ${status}\n`)
}
process.stdout.write(`\n总体：${allOk ? 'PASS' : 'FAIL'}\n`)
process.exit(allOk ? 0 : 1)
