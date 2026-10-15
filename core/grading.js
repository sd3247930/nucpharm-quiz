/**
 * 判分逻辑（纯函数）。
 *
 * 口径：
 * - 单选 / 判断：与标准答案完全一致才得分
 * - 多选：所选集合与标准答案集合完全相同才得分，不设部分分（多选、少选、错选均为 0 分）
 * - 未作答：0 分
 */

import { answerKey } from './format.js'

/** 单题是否答对 */
export function isCorrect(question, chosen) {
	if (!question || !chosen || !chosen.length) return false
	return answerKey(chosen) === answerKey(question.answer)
}

/** 单题判分结果 */
export function judge(question, chosen) {
	const picked = Array.isArray(chosen) ? chosen.filter(Boolean) : []
	return {
		id: question.id,
		type: question.type,
		chosen: [...picked].sort(),
		answer: [...question.answer].sort(),
		correct: isCorrect(question, picked),
		answered: picked.length > 0
	}
}

/**
 * 整卷判分。
 * @param {Array} paper 试卷题目（需含 id/type/answer）
 * @param {Object} answers { [id]: ['A','B'] }
 * @param {Object} quota 各题型题量与分值
 */
export function gradePaper(paper, answers, quota) {
	const byType = {}
	const details = []
	let score = 0
	let correctCount = 0
	let answeredCount = 0

	for (const type of Object.keys(quota)) {
		byType[type] = { total: 0, correct: 0, answered: 0, points: quota[type].points, score: 0 }
	}

	for (const question of paper) {
		const chosen = answers[question.id] || []
		const result = judge(question, chosen)
		const bucket = byType[question.type]
		const points = quota[question.type] ? quota[question.type].points : 0
		bucket.total += 1
		if (result.answered) {
			bucket.answered += 1
			answeredCount += 1
		}
		if (result.correct) {
			bucket.correct += 1
			bucket.score += points
			score += points
			correctCount += 1
		}
		details.push({ ...result, points: result.correct ? points : 0 })
	}

	const totalPoints = Object.keys(quota).reduce(
		(sum, type) => sum + quota[type].count * quota[type].points,
		0
	)

	return {
		score,
		totalPoints,
		correctCount,
		answeredCount,
		totalQuestions: paper.length,
		accuracy: paper.length ? correctCount / paper.length : 0,
		byType,
		details
	}
}

/** 从判分结果里取出错题（含未作答） */
export function wrongDetails(result) {
	return result.details.filter((d) => !d.correct)
}
