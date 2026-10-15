import test from 'node:test'
import assert from 'node:assert/strict'

import { installUniStub } from '../support/uni-stub.mjs'
import { questions, pool } from '../support/bank.mjs'

const stub = installUniStub()

let storeModuleCounter = 0
/** 每个用例拿一个全新的 store 实例（Node 会缓存模块，这里用查询串绕开缓存） */
async function freshStore() {
	storeModuleCounter += 1
	return import(`../../core/store.js?case=${storeModuleCounter}`)
}

test.beforeEach(() => stub.reset())

test('初始化：装载默认设置与空进度', async () => {
	const store = await freshStore()
	const state = store.init()
	assert.equal(state.settings.appearance, 'light')
	assert.equal(state.settings.examMinutes, 60)
	assert.deepEqual(state.answers, {})
	assert.deepEqual(state.favorites, [])
	assert.equal(state.ready, true)
})

test('作答记录：答对加分、答错进错题本、再答对自动移出错题本', async () => {
	const store = await freshStore()
	store.init()
	const q = pool('single')[0]
	const wrongKey = q.options.find((o) => o.key !== q.answer[0]).key

	assert.equal(store.recordAnswer(q, [wrongKey]), false)
	assert.equal(store.mistakeIds().length, 1)
	assert.equal(store.answerOf(q.id).n, 1)

	assert.equal(store.recordAnswer(q, [q.answer[0]]), true)
	assert.equal(store.mistakeIds().length, 0, '答对后应移出错题本')
	assert.equal(store.answerOf(q.id).n, 2)
	assert.equal(store.answerOf(q.id).ok, 1)

	const summary = store.summary()
	assert.equal(summary.done, 1)
	assert.equal(summary.mistakes, 0)
	assert.equal(summary.accuracy, 0.5, '正确率分母是作答次数（2 次 1 对）')
})

test('收藏与笔记：增删双向可用，空笔记等于删除', async () => {
	const store = await freshStore()
	store.init()
	const id = questions[3].id
	assert.equal(store.isFavorite(id), false)
	assert.equal(store.toggleFavorite(id), true)
	assert.equal(store.isFavorite(id), true)
	assert.equal(store.toggleFavorite(id), false)

	store.setNote(id, '  易混点：剂量单位  ')
	assert.equal(store.noteOf(id), '易混点：剂量单位')
	store.setNote(id, '   ')
	assert.equal(store.noteOf(id), '')
	assert.equal(store.noteCount(), 0)
})

test('统计口径：正确率分母只算已作答题数', async () => {
	const store = await freshStore()
	store.init()
	const list = pool('single').slice(0, 4)
	store.recordAnswer(list[0], [list[0].answer[0]])
	store.recordAnswer(list[1], [list[1].answer[0]])
	const wrongKey = list[2].options.find((o) => o.key !== list[2].answer[0]).key
	store.recordAnswer(list[2], [wrongKey])

	const summary = store.summary()
	assert.equal(summary.done, 3)
	assert.equal(summary.total, 620)
	assert.equal(Math.abs(summary.accuracy - 2 / 3) < 1e-9, true)

	const byType = store.summaryByType()
	assert.equal(byType.single.done, 3)
	assert.equal(byType.single.attempts, 3)
	assert.equal(byType.single.mistakes, 1)
	assert.equal(byType.multiple.done, 0)
})

test('导出与导入（合并模式）：新增记录、重复记录被跳过、非法 ID 不入库', async () => {
	const store = await freshStore()
	store.init()
	const q1 = pool('single')[0]
	const q2 = pool('multiple')[0]
	store.recordAnswer(q1, [q1.answer[0]])

	const payload = store.exportPayload()
	payload.data.answers[q2.id] = { n: 1, ok: 1, last: [...q2.answer], lastOk: true, ts: 1 }
	payload.data.answers['RP-X-9999'] = { n: 1, ok: 1, last: ['A'], ts: 1 }
	payload.data.favorites.push(q2.id, 'RP-X-9999')
	payload.data.notes[q2.id] = { text: '导入的笔记', ts: 5 }
	payload.data.exams.push({ sessionId: 'EX-imported-1', score: 88, submitAt: 100 })

	const result = store.importProgress(JSON.stringify(payload), 'merge')
	assert.equal(result.ok, true)
	assert.equal(result.stats.answers, 1, '只新增未存在的作答记录')
	assert.equal(result.stats.skipped >= 1, true, '重复或非法记录应被跳过')
	assert.equal(result.stats.favorites, 1)
	assert.equal(result.stats.notes, 1)
	assert.equal(result.stats.exams, 1)
	assert.equal(store.answerOf('RP-X-9999'), null, '不存在的题目 ID 不得入库')
	assert.equal(store.examHistory().length, 1)
	assert.equal(store.noteOf(q2.id), '导入的笔记')
})

test('导出与导入（替换模式）：先清空再写入', async () => {
	const store = await freshStore()
	store.init()
	const q1 = pool('single')[0]
	store.recordAnswer(q1, [q1.answer[0]])
	store.toggleFavorite(q1.id)

	const q2 = pool('boolean')[0]
	const incoming = store.exportPayload()
	incoming.data.answers = { [q2.id]: { n: 1, ok: 0, last: ['B'], ts: 2 } }
	incoming.data.favorites = []
	const result = store.importProgress(JSON.stringify(incoming), 'replace')
	assert.equal(result.ok, true)
	assert.equal(store.answerOf(q1.id), null, '替换模式应清空原记录')
	assert.equal(store.favoriteIds().length, 0)
	assert.ok(store.answerOf(q2.id), '新记录应写入')
})

test('导入失败：坏文件不产生任何写入', async () => {
	const store = await freshStore()
	store.init()
	const q1 = pool('single')[0]
	store.recordAnswer(q1, [q1.answer[0]])
	const before = JSON.stringify(store.state.answers)

	const bad = store.importProgress('{坏文件', 'merge')
	assert.equal(bad.ok, false)
	assert.equal(JSON.stringify(store.state.answers), before)
	const wrongApp = store.importProgress(JSON.stringify({ app: 'x', data: {} }), 'merge')
	assert.equal(wrongApp.ok, false)
	assert.equal(JSON.stringify(store.state.answers), before)
})

test('考试快照：最多保留 3 场，旧快照自动淘汰', async () => {
	const store = await freshStore()
	store.init()
	for (let i = 1; i <= 4; i += 1) {
		store.saveExamSnapshot(`EX-${i}`, { sessionId: `EX-${i}`, result: { score: i } })
	}
	const keys = Object.keys(store.state.examSnapshots)
	assert.equal(keys.length, 3)
	assert.equal(keys.includes('EX-1'), false, '最旧的快照应被淘汰')
	assert.equal(store.examSnapshot('EX-4').result.score, 4)
})

test('考试历史：写入、按交卷时间倒序、可清理', async () => {
	const store = await freshStore()
	store.init()
	store.addExamRecord({ sessionId: 'A', score: 60, submitAt: 200 })
	store.addExamRecord({ sessionId: 'B', score: 90, submitAt: 300 })
	assert.equal(store.examHistory()[0].sessionId, 'B')
	assert.equal(store.latestExam().score, 90)
	assert.equal(store.examRecord('A').score, 60)
	store.clearExamData()
	assert.equal(store.examHistory().length, 0)
	assert.equal(Object.keys(store.state.examSnapshots).length, 0)
})

test('清除全部进度：作答/错题/收藏/笔记/历史全部归零，设置保留', async () => {
	const store = await freshStore()
	store.init()
	store.setSettings({ appearance: 'dark' })
	const q = pool('single')[0]
	store.recordAnswer(q, [q.answer[0]])
	store.toggleFavorite(q.id)
	store.setNote(q.id, 'note')
	store.addExamRecord({ sessionId: 'X', score: 1, submitAt: 1 })

	store.resetAll()
	assert.equal(store.summary().done, 0)
	assert.equal(store.summary().favorites, 0)
	assert.equal(store.noteCount(), 0)
	assert.equal(store.examHistory().length, 0)
	assert.equal(store.state.settings.appearance, 'dark', '设置不应被清除')
})

test('题库版本变化：失效记录被安全迁移（不静默错配）', async () => {
	uni.setStorageSync('nucpharm:v1:bank-version', '0.9.0')
	uni.setStorageSync(
		'nucpharm:v1:answers',
		JSON.stringify({
			[pool('single')[0].id]: { n: 2, ok: 2, last: ['A'], ts: 1 },
			'RP-OLD-0001': { n: 1, ok: 1, last: ['A'], ts: 1 }
		})
	)
	const store = await freshStore()
	const state = store.init()
	assert.equal(state.migrationReport.from, '0.9.0')
	assert.equal(state.migrationReport.dropped.answers, 1, '无法映射的旧记录应被归档而不是错配')
	assert.equal(Object.keys(state.answers).length, 1)
	assert.equal(uni.getStorageSync('nucpharm:v1:bank-version'), state.bankVersion)
})

test('练习游标与设置持久化', async () => {
	const store = await freshStore()
	store.init()
	store.saveLastPractice({ mode: 'sequence', type: 'single', index: 12 })
	store.setSettings({ fontScale: 'large', autoNext: false })
	store.flush()

	const stored = JSON.parse(uni.getStorageSync('nucpharm:v1:settings'))
	assert.equal(stored.fontScale, 'large')
	assert.equal(stored.autoNext, false)
	const cursor = JSON.parse(uni.getStorageSync('nucpharm:v1:last-practice'))
	assert.equal(cursor.index, 12)
})
