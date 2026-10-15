import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import {
	installUniStub
} from '../support/uni-stub.mjs'
const stub = installUniStub()
const {
	default: store
} = await import('../../core/store.js')
const {
	loadPractice
} = await import('../../core/session.js')
const {
	createSession,
	setAnswer,
	submit,
	paperOf
} = await import('../../core/exam-state.js')
const {
	getAllQuestions,
	validateBank
} = await import('../../core/bank-service.js')
const {
	recoverStorageTransaction
} = await import('../../core/storage.js')
const {
	openRoute
} = await import('../../core/navigation.js')
store.init()
test.beforeEach(() => {
	stub.reset();
	store.resetAll();
	store.resetSettings()
})
const save = session => {
	const {
		questions,
		...data
	} = session;
	store.savePracticeSession(data)
}
const wrong = q => [q.options.find(o => !q.answer.includes(o.key)).key]

test('覆盖率按不同题去重，0%正确率有真实分母；错题去重且重复错误累计', () => {
	const q = getAllQuestions()[0]
	store.recordAnswer(q, wrong(q));
	store.recordAnswer(q, wrong(q))
	assert.equal(store.summary().done, 1)
	assert.equal(store.summary().attempts, 2)
	assert.equal(store.summary().accuracy, 0)
	assert.equal(store.summary().coverage, 1 / 620)
	assert.equal(store.mistakeIds().length, 1)
	assert.equal(store.state.mistakes[q.id].n, 2)
	store.setNote(q.id, '复习笔记');
	store.toggleFavorite(q.id)
	store.recordAnswer(q, q.answer)
	assert.equal(store.mistakeIds().length, 0)
	assert.equal(store.noteOf(q.id), '复习笔记')
	assert.equal(store.isFavorite(q.id), true)
})

test('各题型、题量的随机练习退出后题序及游标保持，组合之间独立', () => {
	for (const type of ['all', 'single', 'multiple', 'boolean'])
		for (const count of [20, 50, 620]) {
			const a = loadPractice({
				mode: 'random',
				type,
				count,
				fresh: true
			});
			a.index = 7;
			save(a)
			const b = loadPractice({
				mode: 'random',
				type,
				count
			})
			assert.equal(new Set(b.ids).size, b.ids.length)
			assert.equal(b.ids.length, Math.min(count, type === 'all' ? 620 : type === 'single' ?
				400 : 110))
			assert.deepEqual(b.ids, a.ids);
			assert.equal(b.index, 7)
		}
})

test('顺序游标不串题型；旧游标兼容；重新开始不删除历史', () => {
	store.saveLastPractice({
		mode: 'sequence',
		type: 'single',
		index: 18
	})
	assert.equal(loadPractice({
		mode: 'sequence',
		type: 'single'
	}).index, 18)
	assert.equal(loadPractice({
		mode: 'sequence',
		type: 'multiple'
	}).index, 0)
	const a = loadPractice({
		mode: 'sequence',
		type: 'single'
	});
	a.index = 22;
	save(a)
	store.recordAnswer(a.questions[0], a.questions[0].answer)
	assert.equal(loadPractice({
		mode: 'sequence',
		type: 'single',
		fresh: true
	}).index, 0)
	assert.equal(store.summary().done, 1)
})

test('复习时移出和取消收藏后的会话不会恢复已失效题目', () => {
	const [q1, q2] = getAllQuestions()
	for (const q of [q1, q2]) {
		store.recordAnswer(q, wrong(q));
		store.toggleFavorite(q.id)
	}
	save(loadPractice({
		mode: 'mistakes',
		type: 'single'
	}));
	save(loadPractice({
		mode: 'favorites',
		type: 'single'
	}))
	store.recordAnswer(q1, q1.answer);
	store.toggleFavorite(q1.id)
	assert.deepEqual(loadPractice({
		mode: 'mistakes',
		type: 'single'
	}).ids, [q2.id])
	assert.deepEqual(loadPractice({
		mode: 'favorites',
		type: 'single'
	}).ids, [q2.id])
})

test('30/45/60/90分钟新卷读取设置，当前卷截止时间保持；快照独立', () => {
	for (const minutes of [30, 45, 60, 90]) {
		store.setSettings({
			examMinutes: minutes
		})
		const s = createSession({
			minutes: store.state.settings.examMinutes,
			now: 1000
		})
		const deadline = s.deadlineAt
		store.setSettings({
			examMinutes: minutes === 90 ? 30 : 90
		})
		assert.equal(s.deadlineAt, deadline)
		assert.equal(s.paperSnapshot.length, 70)
		assert.notEqual(s.paperSnapshot[0], getAllQuestions().find(q => q.id === s.paperIds[0]))
	}
})

test('考试交卷幂等：只收录已答错题，成绩和复盘一次入库', () => {
	const s = createSession();
	const q = paperOf(s)[0]
	setAnswer(s, q.id, wrong(q));
	submit(s)
	assert.ok(store.completeExam(s));
	assert.ok(store.completeExam(s))
	assert.equal(store.examHistory().length, 1)
	assert.equal(store.answerOf(q.id).n, 1)
	assert.equal(store.state.mistakes[q.id].n, 1)
	assert.equal(store.mistakeIds().length, 1)
	assert.equal(store.examSnapshot(s.sessionId).paperSnapshot.length, 70)
})

test('扩展备份包含未完成考试、复盘和随机题序；重复导入无重复成绩', () => {
	const s = createSession();
	store.saveActiveExam(s)
	const run = loadPractice({
		mode: 'random',
		type: 'multiple',
		count: 50
	});
	run.index = 12;
	save(run)
	const done = createSession();
	submit(done);
	store.completeExam(done);
	store.saveActiveExam(s)
	const payload = JSON.stringify(store.exportPayload())
	assert.equal(store.previewImport(payload).ok, true)
	store.resetAll()
	assert.equal(store.importProgress(payload).ok, true)
	assert.equal(store.importProgress(payload).ok, true)
	assert.equal(store.state.activeExam.sessionId, s.sessionId)
	assert.equal(store.examHistory().length, 1)
	assert.equal(loadPractice({
		mode: 'random',
		type: 'multiple',
		count: 50
	}).index, 12)
	assert.equal(store.examSnapshot(done.sessionId).paperIds.length, 70)
})

test('非法嵌套记录、设置、题库版本在导入前被拒绝且零污染', () => {
	const q = getAllQuestions()[0];
	store.recordAnswer(q, q.answer)
	for (const patch of [d => d.answers[q.id] = null, d => d.notes[q.id] = {
			text: 3,
			ts: 2
		}, d => d.settings.examMinutes = 12, d => d.favorites = {}, d => d.exams = [null]]) {
		const payload = store.exportPayload();
		patch(payload.data)
		const before = JSON.stringify(store.exportPayload().data);
		const disk = [...stub.memory]
		assert.equal(store.importProgress(JSON.stringify(payload)).ok, false)
		assert.equal(JSON.stringify(store.exportPayload().data), before)
		assert.deepEqual([...stub.memory], disk)
	}
	const payload = store.exportPayload();
	payload.bankVersion = 'different'
	assert.equal(store.importProgress(JSON.stringify(payload)).ok, false)
})

test('写盘中途失败恢复旧数据；中断日志在下次启动恢复', () => {
	const q = getAllQuestions()[0];
	store.recordAnswer(q, q.answer)
	const payload = store.exportPayload();
	payload.data.notes[q.id] = {
		text: '导入笔记',
		ts: 5
	}
	const before = JSON.stringify(store.exportPayload().data),
		disk = [...stub.memory].sort()
	const write = uni.setStorageSync;
	let failed = false
	uni.setStorageSync = (key, value) => {
		if (!failed && key === 'nucpharm:v1:notes') {
			failed = true;
			throw Error('injected quota failure')
		}
		write(key, value)
	}
	try {
		assert.equal(store.importProgress(JSON.stringify(payload)).ok, false)
	} finally {
		uni.setStorageSync = write
	}
	assert.equal(JSON.stringify(store.exportPayload().data), before)
	assert.deepEqual([...stub.memory].sort(), disk)
	uni.setStorageSync('nucpharm:v1:import-rollback', JSON.stringify({
		before: {
			answers: uni.getStorageSync('nucpharm:v1:answers')
		}
	}))
	uni.setStorageSync('nucpharm:v1:answers', '{}')
	assert.equal(recoverStorageTransaction(), true)
	assert.equal(JSON.parse(uni.getStorageSync('nucpharm:v1:answers'))[q.id].n, 1)
})

test('清理历史保留活动考试；清全部删除磁盘快照和游标并保留设置', () => {
	const s = createSession();
	store.saveActiveExam(s);
	store.setSettings({
		appearance: 'dark'
	})
	const finished = createSession();
	submit(finished);
	store.completeExam(finished);
	store.saveActiveExam(s)
	store.clearExamData();
	assert.equal(store.state.activeExam.sessionId, s.sessionId)
	assert.ok(uni.getStorageSync('nucpharm:v1:active-exam'))
	save(loadPractice({
		mode: 'random',
		type: 'all',
		count: 20
	}))
	store.resetAll()
	assert.equal(uni.getStorageSync('nucpharm:v1:exam-snapshots'), '')
	assert.equal(uni.getStorageSync('nucpharm:v1:practice-sessions'), '')
	assert.equal(store.state.settings.appearance, 'dark')
})

test('题库自检拒绝空库、未知题型、损坏题源和ID；合法题库通过', () => {
	assert.equal(validateBank().ok, true)
	assert.equal(validateBank([]).ok, false)
	const corrupted = JSON.parse(JSON.stringify(getAllQuestions()))
	corrupted[0].source = null;
	corrupted[1].type = 'invalid';
	corrupted[2].id = corrupted[3].id
	assert.equal(validateBank(corrupted).ok, false)
})

test('所有Tab目标与旧我的路由使用switchTab，二级使用navigateTo', () => {
	openRoute('/pages/settings/index');
	openRoute('/pages/me/index');
	openRoute('/pages/question/index?mode=sequence')
	assert.deepEqual(stub.calls.map(c => c[0]), ['switchTab', 'switchTab', 'navigateTo'])
	assert.equal(stub.calls[1][1].url, '/pages/settings/index')
})

test('导入拒绝缺失分值规则、错误题型配额及损坏的本轮作答，保持旧数据', () => {
	const session = createSession()
	store.saveActiveExam(session)
	const before = JSON.stringify(store.exportPayload().data)
	for (const mutate of [
		payload => { delete payload.data.activeExam.quota },
		payload => { payload.data.activeExam.quota.single.points = 9 },
		payload => { payload.data.activeExam.paperSnapshot = undefined; payload.data.activeExam.paperIds = getAllQuestions().slice(0, 70).map(q => q.id) },
		payload => { payload.data.practiceSessions = { corrupt: { mode:'random',type:'single',count:20,index:0,ids:[getAllQuestions()[0].id],responses:'invalid' } } }
	]) {
		const payload = store.exportPayload()
		mutate(payload)
		assert.equal(store.importProgress(JSON.stringify(payload)).ok, false)
		assert.equal(JSON.stringify(store.exportPayload().data), before)
	}
})

test('浅深主题的正文、辅助文字与题型状态文字满足4.5:1对比度', () => {
	const css = readFileSync(new URL('../../App.vue', import.meta.url), 'utf8')
	const parse = text => Object.fromEntries([...text.matchAll(/--np-([\w-]+):\s*(#[\da-f]{6})/gi)].map(m => [m[1],m[2]]))
	const light = parse(css.split('.np-dark')[0])
	const dark = { ...light, ...parse(css.split('.np-dark')[1].split('page {')[0]) }
	const luminance = color => {
		const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(v => v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4)
		return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722
	}
	const contrast = (a,b) => { const [low,high] = [luminance(a),luminance(b)].sort((a,b)=>a-b);return (high+0.05)/(low+0.05) }
	const rows=[]
	for(const [theme,palette] of [['light',light],['dark',dark]]) {
		const pairs = ['primary','accent','correct','wrong','caution'].map(tone => [tone,tone+'-soft'])
		for(const background of ['canvas','surface','surface-2']) for(const text of ['text','text-2']) pairs.push([text,background])
		for(const [foreground,background] of pairs) {
			const ratio=contrast(palette[foreground],palette[background])
			assert.ok(ratio>=4.5,`${theme} ${foreground}/${background}: ${ratio.toFixed(2)} < 4.5`)
			rows.push({theme,foreground,background,ratio:Number(ratio.toFixed(2))})
		}
	}
	writeFileSync(new URL('../../docs/reports/CONTRAST_V2.json', import.meta.url),JSON.stringify({status:'PASS',threshold:4.5,rows},null,2))
})
