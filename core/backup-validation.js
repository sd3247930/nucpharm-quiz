import { getQuestion, getBankVersion } from './bank-service.js'
import { EXAM_QUOTA } from './constants.js'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const number = value => Number.isFinite(value) && value >= 0
const integer = value => number(value) && Number.isInteger(value)
const choices = (value, q) => Array.isArray(value) && value.every(k => typeof k === 'string' && (!q || q
	.options.some(o => o.key === k))) && new Set(value).size === value.length

export function validSettings(settings) {
	if (!object(settings)) return false
	const allowed = {
		appearance: ['light', 'dark'],
		fontScale: ['small', 'normal', 'large'],
		autoNext: [true, false],
		showExplanation: ['immediate', 'afterSubmit'],
		examMinutes: [30, 45, 60, 90]
	}
	return Object.entries(settings).every(([key, value]) => allowed[key]?.includes(value))
}

export function validSession(session, snapshot = false) {
	if (!object(session) || typeof session.sessionId !== 'string') return false
	if (!Array.isArray(session.paperIds) || session.paperIds.length !== 70 || new Set(session.paperIds)
		.size !== 70) return false
	if (!session.paperIds.every(id => getQuestion(id))) return false
	const counts = { single: 0, multiple: 0, boolean: 0 }
	session.paperIds.forEach(id => counts[getQuestion(id).type]++)
	if (Object.entries(EXAM_QUOTA).some(([type, quota]) => counts[type] !== quota.count)) return false
	if (session.bankVersion !== getBankVersion()) return false
	if (!snapshot && (!object(session.quota) || Object.keys(session.quota).length !== 3 ||
		Object.entries(EXAM_QUOTA).some(([type, quota]) => session.quota[type]?.count !== quota.count ||
			session.quota[type]?.points !== quota.points))) return false
	if (!object(session.answers)) return false
	if (!Object.entries(session.answers).every(([id, answer]) => session.paperIds.includes(id) && choices(
			answer, getQuestion(id)))) return false
	if (session.paperSnapshot !== undefined && (!Array.isArray(session.paperSnapshot) || session.paperSnapshot
			.length !== 70 || session.paperSnapshot.some((q, i) => !q || q.id !== session.paperIds[i] || JSON
				.stringify(q) !== JSON.stringify(getQuestion(q.id))))) return false
	if (!snapshot && (session.status !== 'active' || !number(session.startAt) || !number(session
			.deadlineAt) || session.deadlineAt <= session.startAt || ![30, 45, 60, 90].includes(session
				.minutes) || !Array.isArray(session.flags) || !session.flags.every(id => session.paperIds
				.includes(id)))) return false
	if (snapshot && (!object(session.result) || !number(session.result.score) || session.result.score > 100))
		return false
	if (snapshot && (!Array.isArray(session.result.details) || session.result.details.length !== 70 || !Array
			.isArray(session.result.wrongIds) || !object(session.result.byType))) return false
	if (snapshot && session.result.details.some(d => !object(d) || !session.paperIds.includes(d.id) ||
			typeof d.correct !== 'boolean' || !choices(d.chosen, getQuestion(d.id)))) return false
	return true
}

/** 全量预检在任何写入之前进行，兼容 schema 1 中缺少新字段的旧备份。 */
export function validateBackupData(data) {
	if (!object(data)) return '备份数据段必须是对象'
	const unsafe = value => {
		if (!value || typeof value !== 'object') return false
		return Object.keys(value).some(k => ['__proto__', 'prototype', 'constructor'].includes(k) ||
			unsafe(value[k]))
	}
	if (unsafe(data)) return '备份包含不安全的字段'
	if (data.settings !== undefined && !validSettings(data.settings)) return '备份设置包含无效选项'
	for (const field of ['answers', 'mistakes', 'notes', 'examSnapshots', 'practiceSessions']) {
		if (data[field] !== undefined && !object(data[field])) return `${field} 数据格式错误`
	}
	for (const [id, rec] of Object.entries(data.answers || {})) {
		if (!object(rec) || !integer(rec.n) || rec.n < 1 || !integer(rec.ok) || rec.ok > rec.n || !number(rec
				.ts) || !choices(rec.last, getQuestion(id)) || (rec.lastOk !== undefined && typeof rec
				.lastOk !== 'boolean')) return `作答记录 ${id} 无效`
	}
	for (const [id, rec] of Object.entries(data.mistakes || {})) {
		if (!object(rec) || !integer(rec.n) || rec.n < 1 || !number(rec.ts) || !choices(rec.chosen || [],
				getQuestion(id))) return `错题记录 ${id} 无效`
	}
	for (const [id, rec] of Object.entries(data.notes || {})) {
		if (!object(rec) || typeof rec.text !== 'string' || rec.text.length > 100000 || !number(rec.ts))
			return `笔记 ${id} 无效`
	}
	if (data.favorites !== undefined && (!Array.isArray(data.favorites) || !data.favorites.every(id =>
			typeof id === 'string'))) return '收藏数据格式错误'
	if (data.exams !== undefined && (!Array.isArray(data.exams) || !data.exams.every(rec => object(rec) &&
			typeof rec.sessionId === 'string' && rec.sessionId.length > 0 && number(rec.score) && rec
			.score <= 100 && number(rec.submitAt)))) return '考试成绩数据格式错误'
	if (data.activeExam != null && !validSession(data.activeExam)) return '未完成考试快照损坏'
	for (const [id, snapshot] of Object.entries(data.examSnapshots || {}))
		if (snapshot.sessionId !== id || !validSession(snapshot, true)) return '复盘快照损坏'
	for (const session of Object.values(data.practiceSessions || {})) {
		if (!object(session) || !['sequence', 'random', 'mistakes', 'favorites'].includes(session.mode) || ![
				'all', 'single', 'multiple', 'boolean'
			].includes(session.type) || !Array.isArray(session.ids) || !session.ids.every(id => !!getQuestion(
				id)) || new Set(session.ids).size !== session.ids.length || !integer(session.index) || !
			integer(session.count || 0)) return '练习会话损坏'
		if (session.ids.some(id => session.type !== 'all' && getQuestion(id).type !== session.type)) return '练习会话题型不一致'
		if (session.responses !== undefined && (!object(session.responses) || Object.entries(session.responses)
			.some(([id, response]) => !session.ids.includes(id) || !object(response) ||
				typeof response.lastOk !== 'boolean' || !choices(response.last, getQuestion(id))))) return '练习会话作答损坏'
	}
	if (data.lastPractice != null && (!object(data.lastPractice) || !integer(data.lastPractice.index) || ![
			'sequence', 'random', 'mistakes', 'favorites'
		].includes(data.lastPractice.mode) || !['all', 'single', 'multiple', 'boolean'].includes(data
			.lastPractice.type))) return '续练游标损坏'
	return ''
}
