import test from 'node:test'
import assert from 'node:assert/strict'

import { EXAM_QUOTA, TYPE_ORDER } from '../../core/constants.js'
import { generatePaper, assertPaper, fisherYates, poolAvailability, seededRandom } from '../../core/sampler.js'
import { questions, pool } from '../support/bank.mjs'

test('试卷结构：100 次生成均为 70 题，且严格 40/10/20', () => {
	const random = seededRandom(20261014)
	for (let i = 0; i < 100; i += 1) {
		const paper = generatePaper(questions, EXAM_QUOTA, random)
		assert.equal(paper.length, 70, `第 ${i + 1} 次生成题数错误`)
		const counts = { single: 0, multiple: 0, boolean: 0 }
		for (const q of paper) counts[q.type] += 1
		assert.deepEqual(counts, { single: 40, multiple: 10, boolean: 20 })
		const check = assertPaper(paper, EXAM_QUOTA)
		assert.equal(check.ok, true)
	}
})

test('卷内去重：1000 次生成，每次 ID 全局唯一', () => {
	const random = seededRandom(777)
	for (let i = 0; i < 1000; i += 1) {
		const paper = generatePaper(questions, EXAM_QUOTA, random)
		const ids = paper.map((q) => q.id)
		assert.equal(new Set(ids).size, ids.length, `第 ${i + 1} 次出现重复 ID`)
	}
})

test('Fisher–Yates 洗牌是无放回且不丢项', () => {
	const source = Array.from({ length: 50 }, (_, i) => i)
	const random = seededRandom(42)
	const shuffled = fisherYates(source, random)
	assert.equal(shuffled.length, source.length)
	assert.deepEqual([...shuffled].sort((a, b) => a - b), source)
	assert.notDeepEqual(shuffled, source)
	assert.deepEqual(source, Array.from({ length: 50 }, (_, i) => i), '不得修改原数组')
})

test('同种子可复现同一张试卷（便于回归与复现问题）', () => {
	const a = generatePaper(questions, EXAM_QUOTA, seededRandom(2026)).map((q) => q.id)
	const b = generatePaper(questions, EXAM_QUOTA, seededRandom(2026)).map((q) => q.id)
	assert.deepEqual(a, b)
	const c = generatePaper(questions, EXAM_QUOTA, seededRandom(2027)).map((q) => q.id)
	assert.notDeepEqual(a, c)
})

test('负例：题库不足时明确抛错，不生成残缺试卷', () => {
	const short = [
		...pool('single').slice(0, 39),
		...pool('multiple').slice(0, 10),
		...pool('boolean').slice(0, 20)
	]
	assert.throws(() => generatePaper(short, EXAM_QUOTA, seededRandom(1)), /题库数量不足：single/)

	const availability = poolAvailability(short, EXAM_QUOTA)
	assert.equal(availability.ok, false)
	assert.equal(availability.single.missing, 1)
	assert.equal(availability.multiple.ok, true)
})

test('负例：卷内 ID 重复（题库污染）必须报错而不是静默通过', () => {
	const duplicated = [...pool('single').slice(0, 40)]
	duplicated[0] = { ...duplicated[1] } // 复制出重复 ID
	const badBank = [
		...duplicated,
		...pool('multiple').slice(0, 10),
		...pool('boolean').slice(0, 20)
	]
	assert.throws(() => generatePaper(badBank, EXAM_QUOTA, seededRandom(5)), /重复题目 ID|试卷/)
})

test('负例：未知题型不会进入试卷（按题型分池隔离）', () => {
	const poisoned = [
		...pool('single').slice(0, 40),
		...pool('multiple').slice(0, 10),
		...pool('boolean').slice(0, 20),
		{ id: 'RP-X-0001', type: 'unknown', stem: 'x', options: [], answer: [] }
	]
	const paper = generatePaper(poisoned, EXAM_QUOTA, seededRandom(9))
	assert.equal(paper.length, 70)
	assert.equal(paper.some((q) => q.type === 'unknown'), false)
})

test('负例：题型配额为 0 时不抛错且不抽该题型', () => {
	const quota = { single: { count: 5, points: 1 }, multiple: { count: 0, points: 2 }, boolean: { count: 0, points: 2 } }
	const paper = generatePaper(questions, quota, seededRandom(3))
	assert.equal(paper.length, 5)
	assert.ok(paper.every((q) => q.type === 'single'))
})

test('题型池数量与元数据一致', () => {
	for (const type of TYPE_ORDER) {
		assert.ok(pool(type).length >= EXAM_QUOTA[type].count, `${type} 池不足以支撑正式卷`)
	}
})
