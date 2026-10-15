/**
 * 应用状态与持久化（轻量响应式 store，零第三方依赖）。
 *
 * 职责：
 * - 装载/保存 设置、作答记录、错题、收藏、笔记、考试历史、未完成考试快照
 * - 题库版本变化时安全迁移（旧记录保留归档，不静默错配）
 * - 对外提供统计口径统一的计算方法（正确率分母只算已作答题）
 */

import {
	reactive
} from 'vue'
import {
	STORAGE_KEY,
	MAX_EXAM_HISTORY,
	MAX_EXAM_SNAPSHOTS,
	PRACTICE_MODE,
	DEFAULT_EXAM_MINUTES
} from './constants.js'
import {
	readJSON,
	writeJSON,
	readScalar,
	writeScalar,
	removeKey,
	storageUsage,
	buildBackup,
	parseBackup,
	clearProgressKeys,
	atomicWriteJSON,
	recoverStorageTransaction
} from './storage.js'
import {
	getBankVersion,
	getQuestion,
	getAllQuestions,
	getMeta
} from './bank-service.js'
import {
	isCorrect
} from './grading.js'
import {
	applyAppearance
} from './platform.js'
import {
	validateBackupData,
	validSettings
} from './backup-validation.js'
import {
	toHistoryRecord,
	paperOf
} from './exam-state.js'
import { lazyRecord } from './lazy-record.js'

const DEFAULT_SETTINGS = {
	appearance: 'light', // light | dark
	fontScale: 'normal', // small | normal | large
	autoNext: true, // 答对自动进入下一题
	showExplanation: 'immediate', // immediate | afterSubmit（练习模式的解析展示时机）
	examMinutes: DEFAULT_EXAM_MINUTES
}

const initialState = {
	ready: false,
	bankVersion: '',
	meta: {},
	settings: {
		...DEFAULT_SETTINGS
	},
	answers: {}, // id -> { n, ok, last:[], ts }
	mistakes: {}, // id -> { n, ts, chosen:[] }
	favorites: [], // [id]
	notes: {}, // id -> { text, ts }
	exams: [], // 考试历史
	examSnapshots: {}, // sessionId -> 完整试卷快照（用于成绩页/复盘页）
	activeExam: null, // 未完成考试快照
	lastPractice: null, // { mode, type, index, ts }
	practiceSessions: {},
	storage: {
		bytes: 0,
		warn: false,
		platform: 'app'
	},
	bankIssues: []
}
// 首页只需摘要与续练游标。完整复盘/分模式练习记录在首次使用时同步装载。
const secondaryRecords = {
	examSnapshots: lazyRecord(() => readJSON(STORAGE_KEY.examSnapshots, {})),
	practiceSessions: lazyRecord(() => readJSON(STORAGE_KEY.practiceSessions, {}))
}
for (const [part, record] of Object.entries(secondaryRecords)) {
	Object.defineProperty(initialState, part, record.descriptor)
}
const state = reactive(initialState)

function persist(part) {
	switch (part) {
		case 'settings':
			writeJSON(STORAGE_KEY.settings, state.settings)
			break
		case 'answers':
			writeJSON(STORAGE_KEY.answers, state.answers)
			break
		case 'mistakes':
			writeJSON(STORAGE_KEY.mistakes, state.mistakes)
			break
		case 'favorites':
			writeJSON(STORAGE_KEY.favorites, state.favorites)
			break
		case 'notes':
			writeJSON(STORAGE_KEY.notes, state.notes)
			break
		case 'exams':
			writeJSON(STORAGE_KEY.exams, state.exams)
			break
		case 'examSnapshots':
			writeJSON(STORAGE_KEY.examSnapshots, state.examSnapshots)
			break
		case 'activeExam':
			writeJSON(STORAGE_KEY.activeExam, state.activeExam)
			break
		case 'lastPractice':
			writeJSON(STORAGE_KEY.lastPractice, state.lastPractice)
			break
		case 'practiceSessions':
			writeJSON(STORAGE_KEY.practiceSessions, state.practiceSessions)
			break
		default:
			break
	}
}

/** 迁移旧题库版本的作答记录：能对应到新题库的保留，其余归档 */
function migrateIfNeeded() {
	const current = getBankVersion()
	const saved = readScalar(STORAGE_KEY.bankVersion, '')
	state.bankVersion = current
	if (!saved) {
		writeScalar(STORAGE_KEY.bankVersion, current)
		state.migrated = false
		return
	}
	if (saved === current) return
	// 保留迁移前完整数据，仅本机存储，不记录题目正文到日志。
	if (!writeJSON('migration-archive:' + saved, exportPayload())) return

	const valid = new Set(getAllQuestions().map((q) => q.id))
	const dropped = {
		answers: 0,
		mistakes: 0,
		favorites: 0,
		notes: 0
	}
	const answers = {}
	const mistakes = {}
	const notes = {}
	for (const [id, v] of Object.entries(state.answers)) {
		if (valid.has(id)) answers[id] = v
		else dropped.answers += 1
	}
	for (const [id, v] of Object.entries(state.mistakes)) {
		if (valid.has(id)) mistakes[id] = v
		else dropped.mistakes += 1
	}
	for (const [id, v] of Object.entries(state.notes)) {
		if (valid.has(id)) notes[id] = v
		else dropped.notes += 1
	}
	const favorites = state.favorites.filter((id) => valid.has(id))
	dropped.favorites = state.favorites.length - favorites.length

	state.answers = answers
	state.mistakes = mistakes
	state.notes = notes
	state.favorites = favorites;
	['answers', 'mistakes', 'favorites', 'notes'].forEach(persist)
	writeScalar(STORAGE_KEY.bankVersion, current)
	state.migrationReport = {
		from: saved,
		to: current,
		dropped
	}
}

export function init() {
	if (state.ready) return state
	if (!recoverStorageTransaction()) throw new Error('上次导入尚未恢复，请释放存储空间后重启')
	Object.values(secondaryRecords).forEach(record => record.reset())
	state.settings = {
		...DEFAULT_SETTINGS,
		...readJSON(STORAGE_KEY.settings, {})
	}
	state.answers = readJSON(STORAGE_KEY.answers, {})
	state.mistakes = readJSON(STORAGE_KEY.mistakes, {})
	state.favorites = readJSON(STORAGE_KEY.favorites, [])
	state.notes = readJSON(STORAGE_KEY.notes, {})
	state.exams = readJSON(STORAGE_KEY.exams, [])
	state.activeExam = readJSON(STORAGE_KEY.activeExam, null)
	state.lastPractice = readJSON(STORAGE_KEY.lastPractice, null)
	state.meta = getMeta()
	migrateIfNeeded()
	// 容量扫描由设置页按需执行，不阻塞首页。
	state.ready = true
	applyAppearance(state.settings)
	return state
}

export function flush() {
	if (!state.ready) return // 启动恢复失败时不能用默认空状态覆盖磁盘中的原进度。
	;
	[
		'settings',
		'answers',
		'mistakes',
		'favorites',
		'notes',
		'exams',
		'examSnapshots',
		'activeExam',
		'lastPractice',
		'practiceSessions'
	].forEach(part => {
		// 未读取也未改动的大对象继续保留原值，退后台不能触发无用装载和重写。
		if (secondaryRecords[part] && !secondaryRecords[part].loaded) return
		persist(part)
	})
}

export function touchResume() {
	applyAppearance(state.settings)
}

/* ------------------------------ 设置 ------------------------------ */

export function setSettings(patch) {
	if (!validSettings(patch)) return false
	Object.assign(state.settings, patch)
	persist('settings')
	applyAppearance(state.settings)
}

export function resetSettings() {
	state.settings = {
		...DEFAULT_SETTINGS
	}
	persist('settings')
}

export function themeClass() {
	return `${state.settings.appearance === 'dark' ? 'np-dark' : 'np-light'} np-fs-${state.settings.fontScale || 'normal'}`
}

/* ------------------------------ 作答 ------------------------------ */

/**
 * 记录一次作答（练习模式调用）。
 * 统计口径：只有真正提交过答案的题才计入「已做」。
 */
export function recordAnswer(question, chosen) {
	const id = question.id
	const ok = isCorrect(question, chosen)
	const prev = state.answers[id] || {
		n: 0,
		ok: 0,
		last: [],
		ts: 0
	}
	state.answers[id] = {
		n: prev.n + 1,
		ok: prev.ok + (ok ? 1 : 0),
		last: [...chosen],
		lastOk: ok,
		ts: Date.now()
	}
	persist('answers')

	if (ok) {
		if (state.mistakes[id]) {
			delete state.mistakes[id]
			persist('mistakes')
		}
	} else {
		const before = state.mistakes[id] || {
			n: 0
		}
		state.mistakes[id] = {
			n: before.n + 1,
			chosen: [...chosen],
			ts: Date.now()
		}
		persist('mistakes')
	}
	return ok
}

export function answerOf(id) {
	return state.answers[id] || null
}

export function isAnswered(id) {
	return !!state.answers[id]
}

/* ------------------------------ 收藏 / 笔记 ------------------------------ */

export function isFavorite(id) {
	return state.favorites.includes(id)
}

export function toggleFavorite(id) {
	const idx = state.favorites.indexOf(id)
	if (idx >= 0) state.favorites.splice(idx, 1)
	else state.favorites.push(id)
	persist('favorites')
	return idx < 0
}

export function favoriteIds() {
	return [...state.favorites]
}

export function noteOf(id) {
	const n = state.notes[id]
	return n ? n.text : ''
}

export function setNote(id, text) {
	const value = (text || '').trim()
	if (!value) {
		delete state.notes[id]
	} else {
		state.notes[id] = {
			text: value,
			ts: Date.now()
		}
	}
	persist('notes')
}

export function noteCount() {
	return Object.keys(state.notes).length
}

/* ------------------------------ 错题 ------------------------------ */

export function mistakeIds() {
	return Object.keys(state.mistakes)
}

export function removeMistake(id) {
	delete state.mistakes[id]
	persist('mistakes')
}

export function clearMistakes() {
	state.mistakes = {}
	persist('mistakes')
}

/* ------------------------------ 练习游标 ------------------------------ */

export function saveLastPractice(cursor) {
	state.lastPractice = {
		...cursor,
		ts: Date.now()
	}
	persist('lastPractice')
}

export function lastPractice() {
	return state.lastPractice
}

export function practiceKey(mode, type, count = 0) {
	return [mode, type, getBankVersion(), mode === 'random' ? Number(count) || 20 : 0].join(':')
}

export function practiceSession(mode, type, count = 0) {
	const key = practiceKey(mode, type, count)
	return state.practiceSessions[key] || null
}

export function savePracticeSession(session) {
	const key = practiceKey(session.mode, session.type, session.count)
	state.practiceSessions[key] = {
		...session,
		bankVersion: getBankVersion(),
		ts: Date.now()
	}
	// 每个模式保留近期会话，避免反复变更随机题量造成无限增长。
	const keys = Object.keys(state.practiceSessions).sort((a, b) => state.practiceSessions[b].ts - state
		.practiceSessions[a].ts)
	keys.slice(32).forEach(id => delete state.practiceSessions[id])
	persist('practiceSessions')
	saveLastPractice({
		mode: session.mode,
		type: session.type,
		count: session.count,
		index: session.index
	})
}

/* ------------------------------ 考试 ------------------------------ */

export function saveActiveExam(session) {
	state.activeExam = session
	persist('activeExam')
}

export function clearActiveExam() {
	state.activeExam = null
	removeKey(STORAGE_KEY.activeExam)
}

export function addExamRecord(record) {
	state.exams.unshift(record)
	if (state.exams.length > MAX_EXAM_HISTORY) state.exams.length = MAX_EXAM_HISTORY
	persist('exams')
}

export function examHistory() {
	return [...state.exams]
}

export function examRecord(sessionId) {
	return state.exams.find((e) => e.sessionId === sessionId) || null
}

export function clearExamHistory() {
	state.exams = []
	state.examSnapshots = {}
	persist('exams')
	persist('examSnapshots')
}

/**
 * 保存完整试卷快照（含逐题判分、题干与解析），用于成绩页与复盘页。
 * 只保留最近 MAX_EXAM_SNAPSHOTS 场，避免本地存储无限增长。
 */
export function saveExamSnapshot(sessionId, snapshot) {
	if (!sessionId) return
	state.examSnapshots[sessionId] = {
		...snapshot,
		savedAt: Date.now()
	}
	// 按插入顺序淘汰最旧的一场：Object 的字符串键保持插入顺序，重新加载后同样成立，
	// 不会因为「同一毫秒内连续保存」导致 savedAt 相等而淘汰结果随机。
	const ids = Object.keys(state.examSnapshots)
	while (ids.length > MAX_EXAM_SNAPSHOTS) {
		delete state.examSnapshots[ids.shift()]
	}
	persist('examSnapshots')
}

export function examSnapshot(sessionId) {
	return state.examSnapshots[sessionId] || null
}

/* ------------------------------ 统计 ------------------------------ */

/** 总进度与正确率（分母只算已作答题） */
export function summary() {
	const ids = Object.keys(state.answers)
	let correct = 0
	let attempts = 0
	for (const id of ids) {
		const a = state.answers[id]
		correct += a.ok
		attempts += a.n
	}
	const total = getMeta().counts.total
	return {
		done: ids.length,
		total,
		coverage: total ? ids.length / total : 0,
		accuracy: attempts ? correct / attempts : 0,
		attempts,
		lastStudyAt: Math.max(0, ...ids.map(id => state.answers[id].ts || 0)),
		mistakes: Object.keys(state.mistakes).length,
		favorites: state.favorites.length,
		notes: Object.keys(state.notes).length,
		exams: state.exams.length
	}
}

/** 按题型统计 */
export function summaryByType() {
	const result = {}
	for (const type of ['single', 'multiple', 'boolean']) {
		result[type] = {
			done: 0,
			correct: 0,
			attempts: 0,
			mistakes: 0
		}
	}
	for (const id of Object.keys(state.answers)) {
		const q = getQuestion(id)
		if (!q || !result[q.type]) continue
		const a = state.answers[id]
		result[q.type].done += 1
		result[q.type].correct += a.ok
		result[q.type].attempts += a.n
	}
	for (const id of Object.keys(state.mistakes)) {
		const q = getQuestion(id)
		if (q && result[q.type]) result[q.type].mistakes += 1
	}
	return result
}

/** 最近一次考试摘要（首页展示） */
export function latestExam() {
	return state.exams.length ? state.exams[0] : null
}

/* ------------------------------ 备份 / 恢复 ------------------------------ */

export function exportPayload() {
	// 深拷贝：备份必须是独立快照，不能把内存对象的引用交给调用方
	const data = JSON.parse(
		JSON.stringify({
			settings: state.settings,
			answers: state.answers,
			mistakes: state.mistakes,
			favorites: state.favorites,
			notes: state.notes,
			exams: state.exams,
			examSnapshots: state.examSnapshots,
			activeExam: state.activeExam,
			lastPractice: state.lastPractice,
			practiceSessions: state.practiceSessions
		})
	)
	return buildBackup(data, getBankVersion())
}

/**
 * 导入进度。
 * @param {string} text 备份文本
 * @param {'merge'|'replace'} mode 冲突策略
 * @returns {{ok:boolean, error?:string, stats?:object}}
 */
export function previewImport(text) {
	const parsed = parseBackup(text)
	if (!parsed.ok) return parsed
	if (parsed.payload.bankVersion !== getBankVersion()) return {
		ok: false,
		error: '题库版本不匹配，请使用当前版本的备份，避免题目记录错配。'
	}
	let error
	try {
		error = validateBackupData(parsed.payload.data)
	} catch (e) {
		error = '备份结构过于复杂或已损坏'
	}
	if (error) return {
		ok: false,
		error
	}
	const data = parsed.payload.data
	return {
		ok: true,
		payload: parsed.payload,
		preview: {
			answers: Object.keys(data.answers || {}).length,
			mistakes: Object.keys(data.mistakes || {}).length,
			favorites: (data.favorites || []).length,
			notes: Object.keys(data.notes || {}).length,
			exams: (data.exams || []).length,
			activeExam: !!data.activeExam
		}
	}
}

export function importProgress(text, mode = 'merge') {
	const parsed = previewImport(text)
	if (!parsed.ok) return parsed
	if (!['merge', 'replace'].includes(mode)) return {
		ok: false,
		error: '不支持的导入方式'
	}
	const data = parsed.payload.data
	const copy = value => JSON.parse(JSON.stringify(value))
	const next = copy({
		settings: state.settings,
		answers: state.answers,
		mistakes: state.mistakes,
		notes: state.notes,
		favorites: state.favorites,
		exams: state.exams,
		examSnapshots: state.examSnapshots,
		activeExam: state.activeExam,
		lastPractice: state.lastPractice,
		practiceSessions: state.practiceSessions
	})
	const stats = {
		answers: 0,
		mistakes: 0,
		favorites: 0,
		notes: 0,
		exams: 0,
		skipped: 0
	}
	if (mode === 'replace') Object.assign(next, {
		answers: {},
		mistakes: {},
		notes: {},
		favorites: [],
		exams: [],
		examSnapshots: {},
		activeExam: null,
		lastPractice: null,
		practiceSessions: {}
	})
	const valid = new Set(getAllQuestions().map(q => q.id))
	for (const field of ['answers', 'mistakes', 'notes']) {
		for (const [id, rec] of Object.entries(data[field] || {})) {
			if (!valid.has(id)) {
				stats.skipped++;
				continue
			}
			const prev = next[field][id]
			const newer = field === 'answers' ? rec.n > (prev?.n || 0) || rec.n === prev?.n && rec.ts > prev
				.ts : rec.ts > (prev?.ts || 0)
			if (!prev || newer) {
				next[field][id] = rec;
				if (!prev) stats[field]++
			} else stats.skipped++
		}
	}
	for (const id of data.favorites || []) {
		if (valid.has(id) && !next.favorites.includes(id)) {
			next.favorites.push(id);
			stats.favorites++
		} else stats.skipped++
	}
	const existing = new Set(next.exams.map(e => e.sessionId))
	for (const rec of data.exams || []) {
		if (!existing.has(rec.sessionId)) {
			next.exams.push(rec);
			existing.add(rec.sessionId);
			stats.exams++
		} else stats.skipped++
	}
	next.exams.sort((a, b) => b.submitAt - a.submitAt)
	next.exams = next.exams.slice(0, MAX_EXAM_HISTORY)
	// 正确复习后的本地较新记录不能被旧备份中的错题重新覆盖。
	for (const [id, rec] of Object.entries(next.mistakes)) {
		const answer = next.answers[id]
		if (answer?.lastOk && answer.ts >= rec.ts) delete next.mistakes[id]
	}
	for (const [id, snapshot] of Object.entries(data.examSnapshots || {}))
		if (!next.examSnapshots[id]) next.examSnapshots[id] = snapshot
	const snapshotIds = Object.keys(next.examSnapshots).sort((a, b) => (next.examSnapshots[b].submitAt || 0) -
		(next.examSnapshots[a].submitAt || 0))
	snapshotIds.slice(MAX_EXAM_SNAPSHOTS).forEach(id => delete next.examSnapshots[id])
	// 合并不覆盖本机正在进行的考试。
	if (!next.activeExam && data.activeExam && !existing.has(data.activeExam.sessionId)) next.activeExam =
		data.activeExam
	if (!next.lastPractice || (data.lastPractice?.ts || 0) > (next.lastPractice.ts || 0)) next.lastPractice =
		data.lastPractice || next.lastPractice
	for (const session of Object.values(data.practiceSessions || {})) {
		const key = practiceKey(session.mode, session.type, session.count)
		if (!next.practiceSessions[key] || session.ts > next.practiceSessions[key].ts) next.practiceSessions[
			key] = session
	}
	if (data.settings) Object.assign(next.settings, data.settings)
	const entries = {}
	for (const [field, value] of Object.entries(next)) entries[STORAGE_KEY[field]] = value
	if (!atomicWriteJSON(entries)) return {
		ok: false,
		error: '写入失败，已保留原有进度。请释放存储空间后重试；若应用被中断，重启时会恢复原数据。'
	}
	Object.assign(state, copy(next))
	applyAppearance(state.settings)
	refreshStorageInfo()
	return {
		ok: true,
		stats,
		fromBankVersion: parsed.payload.bankVersion
	}
}

/** 考试交卷写入统一入口；同一场仅计一次成绩与答题记录。 */
export function completeExam(session) {
	const result = session?.result
	if (!result) return null
	const copy = value => JSON.parse(JSON.stringify(value))
	const next = copy({
		answers: state.answers,
		mistakes: state.mistakes,
		exams: state.exams,
		examSnapshots: state.examSnapshots,
		activeExam: null
	})
	if (!examRecord(result.sessionId)) {
		for (const q of paperOf(session)) {
			const chosen = session.answers[q.id] || []
			// 未答在本场复盘计错，不算学习作答次数，不自动收录个人错题本。
			if (!chosen.length) continue
			const ok = isCorrect(q, chosen)
			const prev = next.answers[q.id] || {
				n: 0,
				ok: 0
			}
			next.answers[q.id] = {
				n: prev.n + 1,
				ok: prev.ok + (ok ? 1 : 0),
				last: [...chosen],
				lastOk: ok,
				ts: result.submitAt
			}
			if (ok) delete next.mistakes[q.id]
			else next.mistakes[q.id] = {
				n: (next.mistakes[q.id]?.n || 0) + 1,
				chosen: [...chosen],
				ts: result.submitAt
			}
		}
		next.exams.unshift(toHistoryRecord(result))
		next.exams = next.exams.slice(0, MAX_EXAM_HISTORY)
	}
	next.examSnapshots[result.sessionId] = {
		sessionId: result.sessionId,
		bankVersion: result.bankVersion,
		result,
		answers: session.answers,
		paperIds: session.paperIds,
		paperSnapshot: paperOf(session),
		minutes: session.minutes,
		startAt: session.startAt,
		submitAt: result.submitAt,
		submitReason: session.submitReason,
		savedAt: Date.now()
	}
	const ids = Object.keys(next.examSnapshots)
	while (ids.length > MAX_EXAM_SNAPSHOTS) delete next.examSnapshots[ids.shift()]
	const entries = {}
	for (const [field, value] of Object.entries(next)) entries[STORAGE_KEY[field]] = value
	if (!atomicWriteJSON(entries)) return null
	Object.assign(state, next)
	return result
}

export function resetAll() {
	clearProgressKeys()
	state.answers = {}
	state.mistakes = {}
	state.favorites = []
	state.notes = {}
	state.exams = []
	state.examSnapshots = {}
	state.activeExam = null
	state.lastPractice = null
	state.practiceSessions = {}
	refreshStorageInfo()
}

export function refreshStorageInfo() {
	state.storage = storageUsage()
	return state.storage
}

/** 清理历史考试记录与考试快照（保留错题、笔记、收藏） */
export function clearExamData() {
	state.exams = []
	state.examSnapshots = {}
	persist('exams')
	persist('examSnapshots')
	refreshStorageInfo()
}

export {
	state,
	DEFAULT_SETTINGS
}
export default {
	state,
	init,
	flush,
	touchResume,
	setSettings,
	resetSettings,
	themeClass,
	recordAnswer,
	answerOf,
	isAnswered,
	isFavorite,
	toggleFavorite,
	favoriteIds,
	noteOf,
	setNote,
	noteCount,
	mistakeIds,
	removeMistake,
	clearMistakes,
	saveLastPractice,
	lastPractice,
	practiceKey,
	practiceSession,
	savePracticeSession,
	saveActiveExam,
	clearActiveExam,
	addExamRecord,
	examHistory,
	examRecord,
	clearExamHistory,
	saveExamSnapshot,
	examSnapshot,
	summary,
	summaryByType,
	latestExam,
	exportPayload,
	importProgress,
	previewImport,
	completeExam,
	resetAll,
	refreshStorageInfo,
	clearExamData
}
