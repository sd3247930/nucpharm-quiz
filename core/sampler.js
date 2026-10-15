/**
 * 抽题算法（纯函数）。
 *
 * 规格：单选 40 / 多选 10 / 判断 20 = 70 题 / 100 分，默认 60 分钟。
 * 算法：分层无放回抽样 —— 三个池分别 Fisher–Yates 洗牌后截取，合并后再全局洗牌。
 * 约束：卷内题目 ID 全局唯一；题量不足或出现重复 ID 一律抛错，不做「无限重试掩盖」。
 */

import { EXAM_QUOTA, TYPE_ORDER } from './constants.js'

/** Fisher–Yates 洗牌（原地打乱传入数组的副本） */
export function fisherYates(items, random = Math.random) {
	const arr = [...items]
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1))
		const tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp
	}
	return arr
}

/** 题库按题型分池 */
export function splitPools(bank) {
	const pools = { single: [], multiple: [], boolean: [] }
	for (const q of bank) {
		if (pools[q.type]) pools[q.type].push(q)
	}
	return pools
}

/** 抽题池可用量检查（用于界面提前提示，而不是等抽卷时才报错） */
export function poolAvailability(bank, quota = EXAM_QUOTA) {
	const pools = splitPools(bank)
	const result = {}
	for (const type of TYPE_ORDER) {
		const need = quota[type].count
		const have = pools[type].length
		result[type] = { need, have, ok: have >= need, missing: Math.max(0, need - have) }
	}
	result.ok = TYPE_ORDER.every((t) => result[t].ok)
	return result
}

/**
 * 生成一张试卷。
 * @returns {Array} 题目数组（长度等于配额总和）
 * @throws {Error} 题库不足 / 结构错误 / 卷内 ID 重复
 */
export function generatePaper(bank, quota = EXAM_QUOTA, random = Math.random) {
	const pools = splitPools(bank)
	const picks = []

	for (const type of TYPE_ORDER) {
		const need = quota[type].count
		if (pools[type].length < need) {
			throw new Error(
				`题库数量不足：${type} 需要 ${need} 题，实际 ${pools[type].length} 题`
			)
		}
		const shuffled = fisherYates(pools[type], random)
		picks.push(...shuffled.slice(0, need))
	}

	const paper = fisherYates(picks, random)
	const expectedTotal = TYPE_ORDER.reduce((sum, type) => sum + quota[type].count, 0)

	if (paper.length !== expectedTotal) {
		throw new Error(`试卷题数错误：期望 ${expectedTotal} 题，实际 ${paper.length} 题`)
	}

	const ids = paper.map((q) => q.id)
	const unique = new Set(ids)
	if (unique.size !== ids.length) {
		const seen = new Set()
		const dup = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)))
		throw new Error(`试卷存在重复题目 ID：${[...new Set(dup)].join('、')}`)
	}

	return paper
}

/** 校验一张已生成的试卷是否符合规格 */
export function assertPaper(paper, quota = EXAM_QUOTA) {
	const counts = { single: 0, multiple: 0, boolean: 0 }
	for (const q of paper) counts[q.type] = (counts[q.type] || 0) + 1
	const problems = []
	for (const type of TYPE_ORDER) {
		if (counts[type] !== quota[type].count) {
			problems.push(`${type} 数量 ${counts[type]} ≠ ${quota[type].count}`)
		}
	}
	const ids = paper.map((q) => q.id)
	if (new Set(ids).size !== ids.length) problems.push('卷内 ID 重复')
	return { ok: problems.length === 0, problems, counts }
}

/**
 * 可复现随机源（用于测试与「同种子复现同一张试卷」）。
 * mulberry32：轻量、无依赖、分布均匀。
 */
export function seededRandom(seed) {
	let a = seed >>> 0
	return function random() {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
