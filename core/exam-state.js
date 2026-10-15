/**
 * 模拟考试状态机（纯逻辑，不依赖页面）。
 *
 * 关键约束：
 * - 交卷幂等：重复点击、倒计时归零与手动点击同时发生，都只产生一条成绩
 * - 计时以 deadlineAt 为准：退后台、系统杀进程后按系统时间重算，不做 `remaining--`
 * - 快照不可变：试卷 ID、题库版本、分值规则在开始考试时固化，题库更新不污染进行中的考试
 */

import {
	EXAM_QUOTA,
	DEFAULT_EXAM_MINUTES
} from './constants.js'
import {
	generatePaper,
	assertPaper,
	poolAvailability
} from './sampler.js'
import {
	gradePaper,
	wrongDetails
} from './grading.js'
import {
	getExamBank,
	getQuestion,
	getBankVersion,
	getMeta
} from './bank-service.js'

/** 生成唯一考试会话 ID（时间戳 + 随机后缀，离线环境不依赖服务端） */
export function newSessionId(now = Date.now()) {
	const rand = Math.random().toString(36).slice(2, 8)
	return 'EX' + String(now) + '-' + rand
}

/** 抽题池是否满足正式卷（40/10/20） */
export function examAvailability() {
	return poolAvailability(getExamBank(), EXAM_QUOTA)
}

/**
 * 创建考试会话。
 * @throws {Error} 题库不足或试卷结构异常
 */
export function createSession(options = {}) {
	const now = options.now || Date.now()
	const minutes = options.minutes || DEFAULT_EXAM_MINUTES
	const random = options.random || Math.random
	const pool = getExamBank()
	const paper = generatePaper(pool, EXAM_QUOTA, random)
	const check = assertPaper(paper, EXAM_QUOTA)
	if (!check.ok) {
		throw new Error('试卷结构校验失败：' + check.problems.join('；'))
	}
	const session = {
		sessionId: newSessionId(now),
		bankVersion: getBankVersion(),
		quota: JSON.parse(JSON.stringify(EXAM_QUOTA)),
		minutes,
		totalPoints: getMeta().examTotalPoints,
		paperIds: paper.map((q) => q.id),
		paperSnapshot: JSON.parse(JSON.stringify(paper.map(q => getQuestion(q.id)))),
		startAt: now,
		deadlineAt: now + minutes * 60 * 1000,
		status: 'active',
		answers: {},
		flags: [],
		submitAt: null,
		submitReason: null,
		result: null
	}
	return session
}

/** 依据试卷 ID 还原题目对象（快照式：ID 来自会话，内容取自当前题库） */
export function paperOf(session) {
	const snapshot = new Map((session.paperSnapshot || []).map(q => [q.id, q]))
	return session.paperIds.map((id) => snapshot.get(id) || getQuestion(id)).filter(Boolean)
}

export function remainingSeconds(session, now = Date.now()) {
	if (!session) return 0
	if (session.status === 'submitted') return 0
	return Math.max(0, Math.ceil((session.deadlineAt - now) / 1000))
}

export function isExpired(session, now = Date.now()) {
	return session && session.status === 'active' && now >= session.deadlineAt
}

export function isFlagged(session, id) {
	return session.flags.includes(id)
}

export function toggleFlag(session, id) {
	const idx = session.flags.indexOf(id)
	if (idx >= 0) session.flags.splice(idx, 1)
	else session.flags.push(id)
	return idx < 0
}

export function setAnswer(session, id, chosen) {
	if (!session || session.status !== 'active') return false
	if (!chosen || !chosen.length) {
		delete session.answers[id]
		return false
	}
	session.answers[id] = [...new Set(chosen)].sort()
	return true
}

export function answerOf(session, id) {
	return session.answers[id] || []
}

export function progress(session) {
	const total = session.paperIds.length
	const answered = Object.keys(session.answers).filter((id) =>
		(session.answers[id] || []).length
	).length
	return {
		answered,
		total,
		unanswered: total - answered,
		flags: session.flags.length
	}
}

/**
 * 交卷（幂等）。
 * @param {object} session
 * @param {{now?:number, reason?:string}} options reason: manual | timeout | restore
 * @returns {{session:object, result:object, alreadySubmitted:boolean}}
 */
export function submit(session, options = {}) {
	const now = options.now || Date.now()
	if (!session) throw new Error('会话不存在')
	if (session.status === 'submitted' && session.result) {
		return {
			session,
			result: session.result,
			alreadySubmitted: true
		}
	}
	const paper = paperOf(session)
	const result = gradePaper(paper, session.answers, session.quota)
	const usedSeconds = Math.max(0, Math.round((Math.min(now, session.deadlineAt) - session.startAt) / 1000))
	const wrongIds = wrongDetails(result).map((d) => d.id)

	session.status = 'submitted'
	session.submitAt = now
	session.submitReason = options.reason || 'manual'
	session.result = {
		sessionId: session.sessionId,
		score: result.score,
		totalPoints: result.totalPoints,
		correctCount: result.correctCount,
		answeredCount: result.answeredCount,
		totalQuestions: result.totalQuestions,
		accuracy: result.accuracy,
		byType: result.byType,
		wrongIds,
		details: result.details,
		startAt: session.startAt,
		submitAt: now,
		usedSeconds,
		bankVersion: session.bankVersion,
		minutes: session.minutes
	}
	return {
		session,
		result: session.result,
		alreadySubmitted: false
	}
}

/** 考试结果的精简历史记录（存入本地历史） */
export function toHistoryRecord(result) {
	return {
		sessionId: result.sessionId,
		score: result.score,
		totalPoints: result.totalPoints,
		correctCount: result.correctCount,
		totalQuestions: result.totalQuestions,
		accuracy: result.accuracy,
		answeredCount: result.answeredCount,
		byType: result.byType,
		usedSeconds: result.usedSeconds,
		startAt: result.startAt,
		submitAt: result.submitAt,
		bankVersion: result.bankVersion,
		wrongIds: result.wrongIds.slice(0, 200)
	}
}

/** 会话简述（用于「继续未完成考试」提示） */
export function sessionBrief(session, now = Date.now()) {
	if (!session) return null
	const p = progress(session)
	return {
		sessionId: session.sessionId,
		startAt: session.startAt,
		deadlineAt: session.deadlineAt,
		remaining: remainingSeconds(session, now),
		expired: isExpired(session, now),
		answered: p.answered,
		total: p.total,
		status: session.status
	}
}

/** 恢复会话：把本地快照修正为「按当前时间」的合法状态 */
export function restoreSession(session, now = Date.now()) {
	if (!session || session.status !== 'active') return {
		session,
		autoSubmitted: false
	}
	if (!session.paperIds || !session.paperIds.length) {
		return {
			session: null,
			autoSubmitted: false,
			invalid: true
		}
	}
	if (isExpired(session, now)) {
		const {
			session: submitted,
			result
		} = submit(session, {
			now,
			reason: 'timeout'
		})
		return {
			session: submitted,
			result,
			autoSubmitted: true
		}
	}
	return {
		session,
		autoSubmitted: false
	}
}
