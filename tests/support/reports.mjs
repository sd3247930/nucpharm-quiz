/**
 * 测试报告写入工具：把 campaign 的结果落到 docs/reports/ 下的 Markdown。
 */

import {
	mkdirSync,
	writeFileSync
} from 'node:fs'
import {
	dirname,
	resolve
} from 'node:path'
import {
	fileURLToPath
} from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(HERE, '..', '..')
export const REPORT_DIR = resolve(ROOT, 'docs', 'reports')

export function writeReport(fileName, title, lines) {
	mkdirSync(REPORT_DIR, {
		recursive: true
	})
	// UI v2 实测结果单独归档，保留历史版本报告。
	if (!fileName.includes('_V2')) fileName = fileName.replace(/\.md$/, '_V2.md')
	const content = [`# ${title}`, '', ...lines, ''].join('\n')
	const target = resolve(REPORT_DIR, fileName)
	writeFileSync(target, content, 'utf-8')
	return target
}

export function table(headers, rows) {
	const head = `| ${headers.join(' | ')} |`
	const sep = `| ${headers.map(() => '---').join(' | ')} |`
	const body = rows.map((row) => `| ${row.join(' | ')} |`)
	return [head, sep, ...body]
}
