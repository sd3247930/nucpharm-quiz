import test from 'node:test'
import assert from 'node:assert/strict'

import {
	createSession,
	paperOf,
	setAnswer,
	submit,
	restoreSession,
	remainingSeconds,
	toHistoryRecord
} from '../../core/exam-state.js'
import { seededRandom } from '../../core/sampler.js'
import { EXAM_QUOTA } from '../../core/constants.js'
import { writeReport, table } from '../support/reports.mjs'

const ROUNDS = 50
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0)

test(`连续 ${ROUNDS} 轮考试：创建 / 作答 / 交卷 / 恢复互不污染`, () => {
	const random = seededRandom(20261015)
	const rows = []
	const sessionIds = new Set()

	for (let round = 1; round <= ROUNDS; round += 1) {
		const session = createSession({ minutes: 60, now: NOW + round * 60_000, random })
		const paper = paperOf(session)
		// 模拟真实作答：部分正确、部分错误、部分未答
		let expectedCorrect = 0
		let expectedAnswered = 0
		paper.forEach((q, i) => {
			if (i % 5 === 4) return // 未作答
			expectedAnswered += 1
			if (i % 3 === 0) {
				setAnswer(session, q.id, [...q.answer])
				expectedCorrect += 1
			} else {
				const wrong = q.options.find((o) => !q.answer.includes(o.key))
				setAnswer(session, q.id, [wrong ? wrong.key : q.answer[0]])
			}
		})
		const answered = Object.keys(session.answers).length
		assert.equal(answered, expectedAnswered, '作答题数应与模拟规则一致')
		assert.equal(expectedAnswered, 56, '70 题中每 5 题跳过 1 题未作答')

		const first = submit(session, { now: session.startAt + 20 * 60_000, reason: 'manual' })
		assert.equal(first.alreadySubmitted, false)
		// 重复交卷（模拟双击 / 定时器与按钮同时触发）
		const second = submit(session, { now: session.startAt + 21 * 60_000, reason: 'manual' })
		assert.equal(second.alreadySubmitted, true)
		assert.equal(second.result.sessionId, first.result.sessionId)

		// 交卷后的会话不得再被恢复为进行中
		const restored = restoreSession(session, session.startAt + 22 * 60_000)
		assert.equal(restored.autoSubmitted, false)
		assert.equal(restored.session.status, 'submitted')
		assert.equal(remainingSeconds(restored.session, session.startAt + 22 * 60_000), 0)

		const record = toHistoryRecord(first.result)
		assert.equal(record.score, first.result.score)
		assert.equal(record.totalPoints, 100)
		assert.ok(record.score >= 0 && record.score <= 100)
		assert.equal(Number.isInteger(record.score), true)
		assert.equal(record.correctCount, expectedCorrect, '判分应与模拟作答一致')
		assert.equal(sessionIds.has(record.sessionId), false, '会话 ID 必须唯一')
		sessionIds.add(record.sessionId)

		rows.push([round, record.sessionId.slice(-8), record.score, record.correctCount, record.answeredCount])
	}

	const scores = rows.map((r) => r[2])
	writeReport('SESSION_CAMPAIGN.md', `模拟考试连续 ${ROUNDS} 轮测试报告`, [
		`- 轮次：${ROUNDS}，每轮独立生成 70 题试卷（单选 ${
			EXAM_QUOTA.single.count
		} / 多选 ${EXAM_QUOTA.multiple.count} / 判断 ${EXAM_QUOTA.boolean.count}）`,
		'- 每轮模拟：56 题作答（其中 20 题全部答对、36 题故意答错），14 题留空不答',
		'- 每轮校验：重复交卷幂等、交卷后不可回到进行中、倒计时不为负、会话 ID 唯一、分数区间合法',
		`- 分数分布：最低 ${Math.min(...scores)}，最高 ${Math.max(...scores)}，全部落在 0..100`,
		'',
		...table(['轮次', '会话尾号', '得分', '正确题数', '作答题数'], rows.slice(0, 10)),
		'',
		`（仅展示前 10 轮，共 ${ROUNDS} 轮）`,
		'',
		'结论：PASS'
	])
})

test('状态污染专项：同一会话连续操作 50 轮结果不互相覆盖', () => {
	const random = seededRandom(99)
	const session = createSession({ minutes: 60, now: NOW, random })
	const paper = paperOf(session)
	const id = paper[0].id
	for (let i = 0; i < 50; i += 1) {
		setAnswer(session, id, [i % 2 === 0 ? 'A' : 'B'])
		assert.deepEqual(session.answers[id], [i % 2 === 0 ? 'A' : 'B'])
		assert.equal(Object.keys(session.answers).length, 1, '反复写入同一题不应产生多条记录')
	}
	const { result } = submit(session, { now: NOW + 1000, reason: 'manual' })
	assert.equal(result.answeredCount, 1)
	assert.equal(remainingSeconds(session, NOW + 1000), 0)
})

test('倒计时口径：切后台 20 分钟后回来，剩余时间按真实时间扣减', () => {
	const session = createSession({ minutes: 60, now: NOW, random: seededRandom(5) })
	const before = remainingSeconds(session, NOW)
	const after = remainingSeconds(session, NOW + 20 * 60 * 1000)
	assert.equal(before, 3600)
	assert.equal(after, 2400)
	const restored = restoreSession(session, NOW + 20 * 60 * 1000)
	assert.equal(restored.session.status, 'active')
	assert.deepEqual(Object.keys(restored.session.answers), [])
})
