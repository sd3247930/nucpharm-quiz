import test from 'node:test'
import assert from 'node:assert/strict'

import { isCorrect, judge, gradePaper, wrongDetails } from '../../core/grading.js'
import { EXAM_QUOTA } from '../../core/constants.js'
import { questions, pool } from '../support/bank.mjs'

const single = pool('single')[0]
const multiple = pool('multiple').find((q) => q.answer.length >= 2)
const booleanQ = pool('boolean')[0]

test('单选题：完全匹配得分，错选不得分', () => {
	assert.equal(isCorrect(single, [single.answer[0]]), true)
	const wrongKey = single.options.find((o) => o.key !== single.answer[0]).key
	assert.equal(isCorrect(single, [wrongKey]), false)
})

test('判断题：A/B 严格匹配', () => {
	assert.equal(isCorrect(booleanQ, [booleanQ.answer[0]]), true)
	const other = booleanQ.answer[0] === 'A' ? 'B' : 'A'
	assert.equal(isCorrect(booleanQ, [other]), false)
})

test('多选题：集合完全一致才得分（顺序无关、少选多选均 0 分）', () => {
	const answer = multiple.answer
	assert.equal(isCorrect(multiple, [...answer]), true)
	assert.equal(isCorrect(multiple, [...answer].reverse()), true, '顺序不同应视为相同集合')
	assert.equal(isCorrect(multiple, answer.slice(0, answer.length - 1)), false, '少选不得分')
	const extra = multiple.options.find((o) => !answer.includes(o.key)).key
	assert.equal(isCorrect(multiple, [...answer, extra]), false, '多选不得分')
	assert.equal(isCorrect(multiple, [extra]), false, '错选不得分')
})

test('空作答：未作答、0 分，且不产生空答案判定错误', () => {
	const r = judge(single, [])
	assert.equal(r.answered, false)
	assert.equal(r.correct, false)
	assert.equal(isCorrect(single, []), false)
})

test('整卷判分：全对 100 分、全错 0 分、全未答 0 分，且分数为 0..100 的整数', () => {
	const paper = [...pool('single').slice(0, 40), ...pool('multiple').slice(0, 10), ...pool('boolean').slice(0, 20)]
	assert.equal(paper.length, 70)

	const allRight = {}
	for (const q of paper) allRight[q.id] = [...q.answer]
	const r1 = gradePaper(paper, allRight, EXAM_QUOTA)
	assert.equal(r1.score, 100)
	assert.equal(r1.totalPoints, 100)
	assert.equal(r1.correctCount, 70)
	assert.equal(Number.isInteger(r1.score), true)

	const allWrong = {}
	for (const q of paper) {
		const wrongKey = q.options.find((o) => !q.answer.includes(o.key)).key
		allWrong[q.id] = [wrongKey]
	}
	const r2 = gradePaper(paper, allWrong, EXAM_QUOTA)
	assert.equal(r2.score, 0)
	assert.equal(r2.answeredCount, 70)

	const r3 = gradePaper(paper, {}, EXAM_QUOTA)
	assert.equal(r3.score, 0)
	assert.equal(r3.answeredCount, 0)
	assert.ok(r3.score >= 0 && r3.score <= 100)
})

test('分题型得分与总分自洽', () => {
	const paper = [...pool('single').slice(0, 40), ...pool('multiple').slice(0, 10), ...pool('boolean').slice(0, 20)]
	const answers = {}
	paper.forEach((q, i) => {
		if (i % 3 === 0) answers[q.id] = [...q.answer]
	})
	const result = gradePaper(paper, answers, EXAM_QUOTA)
	const sum = Object.values(result.byType).reduce((acc, t) => acc + t.score, 0)
	assert.equal(sum, result.score)
	assert.equal(result.byType.single.total, 40)
	assert.equal(result.byType.multiple.total, 10)
	assert.equal(result.byType.boolean.total, 20)
	const wrong = wrongDetails(result)
	assert.equal(wrong.length, 70 - result.correctCount)
})

test('多选部分正确不给部分分（多选 2 分制）', () => {
	const paper = pool('multiple').slice(0, 10)
	const answers = {}
	for (const q of paper) answers[q.id] = [q.answer[0]]
	const result = gradePaper(paper, answers, EXAM_QUOTA)
	assert.equal(result.score, 0, '多选少选必须为 0 分')
})

test('题库内每题答案都落在选项集合内（数据前置条件）', () => {
	for (const q of questions) {
		const keys = new Set(q.options.map((o) => o.key))
		for (const a of q.answer) assert.ok(keys.has(a), `${q.id} 答案 ${a} 不在选项中`)
	}
})
