import test from 'node:test'
import assert from 'node:assert/strict'

import {
	createSession,
	remainingSeconds,
	isExpired,
	setAnswer,
	answerOf,
	toggleFlag,
	progress,
	submit,
	restoreSession,
	toHistoryRecord,
	sessionBrief,
	paperOf,
	newSessionId
} from '../../core/exam-state.js'
import { seededRandom } from '../../core/sampler.js'

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0)

function newSession(minutes = 60) {
	return createSession({ minutes, now: NOW, random: seededRandom(20261014) })
}

test('创建会话：70 题快照、100 分、截止时间 = 开始时间 + 时长', () => {
	const s = newSession(60)
	assert.equal(s.paperIds.length, 70)
	assert.equal(s.totalPoints, 100)
	assert.equal(s.minutes, 60)
	assert.equal(s.status, 'active')
	assert.equal(s.deadlineAt, NOW + 60 * 60 * 1000)
	assert.equal(new Set(s.paperIds).size, 70)
	assert.match(s.sessionId, /^EX\d+-[a-z0-9]+$/)
})

test('会话 ID 唯一（连续生成不重复）', () => {
	const ids = new Set()
	for (let i = 0; i < 500; i += 1) ids.add(newSessionId(NOW + i))
	assert.equal(ids.size, 500)
})

test('倒计时按 deadlineAt 计算，永不出现负数', () => {
	const s = newSession(60)
	assert.equal(remainingSeconds(s, NOW), 3600)
	assert.equal(remainingSeconds(s, NOW + 30 * 60 * 1000), 1800)
	assert.equal(remainingSeconds(s, NOW + 3600 * 1000), 0)
	assert.equal(remainingSeconds(s, NOW + 9000 * 1000), 0, '超过截止时间不得为负')
	assert.equal(isExpired(s, NOW + 3600 * 1000), true)
	assert.equal(isExpired(s, NOW + 3599 * 1000), false)
})

test('答题与标记：写入快照、可清空、进度统计正确', () => {
	const s = newSession()
	const [q1, q2] = paperOf(s)
	setAnswer(s, q1.id, [q1.answer[0]])
	setAnswer(s, q2.id, ['A', 'A', 'B'])
	assert.deepEqual(answerOf(s, q2.id), ['A', 'B'], '选项应去重并排序')
	setAnswer(s, q2.id, [])
	assert.deepEqual(answerOf(s, q2.id), [], '空作答应从快照移除')
	toggleFlag(s, q1.id)
	assert.equal(s.flags.includes(q1.id), true)
	toggleFlag(s, q1.id)
	assert.equal(s.flags.includes(q1.id), false)
	const p = progress(s)
	assert.equal(p.total, 70)
	assert.equal(p.answered, 1)
	assert.equal(p.unanswered, 69)
})

test('交卷幂等：连续两次交卷只产生一条成绩，结果对象一致', () => {
	const s = newSession()
	const paper = paperOf(s)
	for (const q of paper) setAnswer(s, q.id, [...q.answer])
	const first = submit(s, { now: NOW + 10 * 60 * 1000, reason: 'manual' })
	assert.equal(first.alreadySubmitted, false)
	assert.equal(first.result.score, 100)
	assert.equal(first.result.usedSeconds, 600)
	const second = submit(s, { now: NOW + 11 * 60 * 1000, reason: 'timeout' })
	assert.equal(second.alreadySubmitted, true)
	assert.equal(second.result, first.result, '不得生成第二条成绩')
	assert.equal(second.result.submitReason, undefined, '提交原因由会话记录，结果结构保持稳定')
})

test('到时自动交卷：超时后恢复会话即交卷一次', () => {
	const s = newSession(60)
	const paper = paperOf(s)
	// 只答前 10 道单选题（每题 1 分），便于断言分数
	for (const q of paper.filter((item) => item.type === 'single').slice(0, 10)) {
		setAnswer(s, q.id, [...q.answer])
	}
	const late = NOW + 61 * 60 * 1000
	const restored = restoreSession(s, late)
	assert.equal(restored.autoSubmitted, true)
	assert.equal(restored.session.status, 'submitted')
	assert.equal(restored.session.submitReason, 'timeout')
	assert.equal(restored.result.answeredCount, 10)
	assert.equal(restored.result.score, 10, '单选前 10 题各 1 分')
	const again = restoreSession(restored.session, late + 1000)
	assert.equal(again.autoSubmitted, false, '已交卷的会话不得重复自动交卷')
})

test('未到时的恢复：保持进行中并保留已答数据', () => {
	const s = newSession(60)
	const paper = paperOf(s)
	setAnswer(s, paper[0].id, [paper[0].answer[0]])
	const restored = restoreSession(s, NOW + 60 * 1000)
	assert.equal(restored.autoSubmitted, false)
	assert.equal(restored.session.status, 'active')
	assert.equal(remainingSeconds(restored.session, NOW + 60 * 1000), 3540)
	assert.deepEqual(answerOf(restored.session, paper[0].id), [...paper[0].answer])
})

test('损坏的会话快照：标记为无效而不是崩溃', () => {
	const broken = { sessionId: 'EX1-x', status: 'active', paperIds: [], answers: {}, flags: [] }
	const restored = restoreSession(broken, NOW)
	assert.equal(restored.invalid, true)
	assert.equal(restored.session, null)
})

test('会话简述包含剩余时间与过期标记', () => {
	const s = newSession(30)
	const brief = sessionBrief(s, NOW + 15 * 60 * 1000)
	assert.equal(brief.remaining, 900)
	assert.equal(brief.expired, false)
	assert.equal(brief.total, 70)
	const expired = sessionBrief(s, NOW + 31 * 60 * 1000)
	assert.equal(expired.expired, true)
})

test('历史记录只保留必要字段，且错题 ID 数量受限', () => {
	const s = newSession()
	const { result } = submit(s, { now: NOW + 60 * 1000, reason: 'manual' })
	const record = toHistoryRecord(result)
	assert.equal(record.sessionId, result.sessionId)
	assert.equal(record.score, 0)
	assert.equal(record.totalPoints, 100)
	assert.ok(record.wrongIds.length <= 200)
	assert.equal('details' in record, false, '历史记录不应携带逐题明细')
	assert.equal('answers' in record, false, '历史记录不应携带原始作答')
})

test('未作答题目按 0 分计，且不因缺题而少算题数', () => {
	const s = newSession()
	const { result } = submit(s, { now: NOW + 1000, reason: 'manual' })
	assert.equal(result.totalQuestions, 70)
	assert.equal(result.answeredCount, 0)
	assert.equal(result.byType.single.total, 40)
	assert.equal(result.wrongIds.length, 70)
})
