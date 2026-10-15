import test from 'node:test'
import assert from 'node:assert/strict'

import { installUniStub } from '../support/uni-stub.mjs'

const stub = installUniStub()

const { buildBackup, parseBackup, readJSON, writeJSON, removeKey, exportToClipboard } = await import(
	'../../core/storage.js'
)

test.beforeEach(() => stub.reset())

test('进度备份：往返序列化与解析一致', () => {
	const payload = buildBackup({ answers: { 'RP-S-0001': { n: 1, ok: 1, last: ['B'], ts: 1 } } }, '1.0.0')
	assert.equal(payload.app, 'nucpharm-progress')
	assert.equal(payload.schema, 1)
	const parsed = parseBackup(JSON.stringify(payload))
	assert.equal(parsed.ok, true)
	assert.equal(parsed.payload.data.answers['RP-S-0001'].ok, 1)
})

test('进度备份：异常输入全部给出明确原因，不抛异常', () => {
	assert.equal(parseBackup('').ok, false)
	assert.match(parseBackup('').error, /内容为空/)
	assert.equal(parseBackup('{不是 json').ok, false)
	assert.match(parseBackup('{不是 json').error, /JSON/)
	assert.equal(parseBackup('"字符串"').ok, false)
	assert.equal(parseBackup(JSON.stringify({ app: 'other-app', data: {} })).ok, false)
	assert.match(parseBackup(JSON.stringify({ app: 'other-app', data: {} })).error, /核药通/)
	assert.equal(parseBackup(JSON.stringify({ app: 'nucpharm-progress', data: {} })).ok, false)
	assert.equal(
		parseBackup(JSON.stringify({ app: 'nucpharm-progress', schema: 99, data: {} })).ok,
		false
	)
	const huge = 'x'.repeat(9 * 1024 * 1024)
	assert.equal(parseBackup(huge).ok, false)
	assert.match(parseBackup(huge).error, /过大/)
})

test('本地读写：JSON 往返、坏数据回退默认值、删除生效', () => {
	writeJSON('demo', { a: 1 })
	assert.deepEqual(readJSON('demo', null), { a: 1 })
	uni.setStorageSync('nucpharm:v1:demo', '{坏数据')
	assert.deepEqual(readJSON('demo', { fallback: true }), { fallback: true })
	removeKey('demo')
	assert.equal(readJSON('demo', null), null)
})

test('剪贴板导出：成功与失败都能返回结构化结果', async () => {
	const ok = await exportToClipboard(buildBackup({ answers: {} }, '1.0.0'))
	assert.equal(ok.ok, true)
	assert.ok(String(globalThis.__clipboard).includes('nucpharm-progress'))

	uni.setClipboardData = (opt) => opt.fail && opt.fail({ errMsg: 'denied' })
	const failed = await exportToClipboard(buildBackup({ answers: {} }, '1.0.0'))
	assert.equal(failed.ok, false)
	assert.match(failed.error, /denied/)
})
