/**
 * 题库服务：加载内置题库、建立索引、提供筛选与统计。
 *
 * 题库由 scripts/import-questions.py 生成（core/data/bank.js），完全离线内置，
 * 首次启动不依赖网络；改动题源后重跑导入器即可。
 */

import {
	questions,
	examBank,
	meta
} from './data/bank.js'
import {
	TYPE_ORDER,
	TYPE_LABEL
} from './constants.js'

let indexById = null
let poolsCache = null

function ensureIndex() {
	if (indexById) return
	indexById = new Map()
	for (const q of questions) indexById.set(q.id, q)
	poolsCache = {
		single: [],
		multiple: [],
		boolean: []
	}
	for (const q of questions) {
		if (poolsCache[q.type]) poolsCache[q.type].push(q)
	}
}

export function getMeta() {
	return meta
}

export function getBankVersion() {
	return meta.bankVersion
}

export function getAllQuestions() {
	return questions
}

export function getExamBank() {
	return examBank
}

export function getQuestion(id) {
	ensureIndex()
	return indexById.get(id) || null
}

export function getQuestions(ids) {
	ensureIndex()
	return ids.map((id) => indexById.get(id)).filter(Boolean)
}

export function getQuestionsByType(type) {
	ensureIndex()
	if (type === 'all' || !type) return questions
	return poolsCache[type] ? [...poolsCache[type]] : []
}

export function poolCount(type) {
	ensureIndex()
	if (type === 'all' || !type) return questions.length
	return poolsCache[type] ? poolsCache[type].length : 0
}

/** 首页/设置页展示用的题库概况 */
export function bankSummary() {
	return {
		name: meta.bankName,
		version: meta.bankVersion,
		total: meta.counts.total,
		counts: meta.counts,
		generatedAt: meta.generatedAt,
		examTotalPoints: meta.examTotalPoints,
		examDurationMinutes: meta.examDurationMinutes
	}
}

/**
 * 启动自检：题库结构必须符合规格，否则说明数据产物被破坏。
 * 返回 { ok, errors }，不抛错，便于界面提示。
 * @param {Array} [bank] 待校验题库，默认校验内置题库（便于测试注入损坏数据）
 */
export function validateBank(bank = questions, exams = examBank) {
	const errors = []
	const fail = text => {
		if (errors.length < 24) errors.push(text)
	}
	if (!Array.isArray(bank)) return {
		ok: false,
		errors: ['题库不是数组']
	}
	if (bank.length !== 620) fail(`总题数 ${bank.length} ≠ 620`)
	const counts = {
		single: 0,
		multiple: 0,
		boolean: 0
	}
	const ids = new Set()
	for (const q of bank) {
		if (!q || typeof q !== 'object') {
			fail('存在无效题目');
			continue
		}
		if (typeof q.id !== 'string' || !q.id || ids.has(q.id)) fail('题目 ID 缺失或重复')
		ids.add(q.id)
		if (!(q.type in counts)) fail(`${q.id} 题型无效`);
		else counts[q.type]++
		if (typeof q.stem !== 'string' || !q.stem.trim()) fail(`${q.id} 题干为空`)
		if (!Array.isArray(q.options) || q.options.length < 2) {
			fail(`${q.id} 缺少选项`);
			continue
		}
		const keys = new Set(q.options.map(o => o?.key))
		if (keys.size !== q.options.length || q.options.some(o => !o || typeof o.key !== 'string' || typeof o
				.text !== 'string' || !o.text.trim())) fail(`${q.id} 选项非法或重复`)
		if (!Array.isArray(q.answer) || !q.answer.length || new Set(q.answer).size !== q.answer.length || q
			.answer.some(a => !keys.has(a))) fail(`${q.id} 答案无效或不在选项集合`)
		for (const a of q.answer || [])
			if (!keys.has(a)) fail(`${q.id} 答案 ${a} 不在选项集合内`)
		if (['single', 'boolean'].includes(q.type) && q.answer?.length !== 1) fail(`${q.id} 答案应为一项`)
		if (q.type === 'boolean' && q.options.length !== 2) fail(`${q.id} 判断题选项数应为 2`)
		if (!q.source?.file || !q.source?.location) fail(`${q.id} 缺少题源引用`)
	}
	for (const [type, expected] of Object.entries({
			single: 400,
			multiple: 110,
			boolean: 110
		}))
		if (counts[type] !== expected) fail(`${TYPE_LABEL[type]} 数量 ${counts[type]} ≠ ${expected}`)
	if (!Array.isArray(exams) || exams.length !== bank.length) fail('考试库题量不一致')
	else {
		const index = new Map(exams.map(q => [q.id, q]))
		if (index.size !== exams.length) fail('考试库存在重复 ID')
		for (const q of bank) {
			if (!q) continue
			const exam = index.get(q.id)
			if (!exam || exam.type !== q.type || JSON.stringify(exam.answer) !== JSON.stringify(q.answer))
				fail(`${q.id} 考试库映射或答案不一致`)
		}
	}
	return {
		ok: errors.length === 0,
		errors
	}
}

/** 关键词检索（题干 + 选项），供错题/收藏页筛选使用 */
export function searchQuestions(ids, keyword) {
	const text = (keyword || '').trim().toLowerCase()
	const list = getQuestions(ids)
	if (!text) return list
	return list.filter((q) => {
		if (q.stem.toLowerCase().includes(text)) return true
		return q.options.some((o) => o.text.toLowerCase().includes(text))
	})
}

/** 题库中带来源信息的题目（逐题溯源用） */
export function questionSource(id) {
	const q = getQuestion(id)
	return q ? q.source : null
}
