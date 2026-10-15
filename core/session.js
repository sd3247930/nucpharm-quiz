/**
 * 练习会话构建（顺序 / 随机 / 错题 / 收藏）。
 *
 * 与考试不同，练习允许一轮内不重复、但不限制跨轮重复；
 * 随机练习采用无放回抽样，保证同一轮里不出现同一道题。
 */

import {
	PRACTICE_MODE,
	PRACTICE_DEFAULT_COUNT
} from './constants.js'
import {
	fisherYates
} from './sampler.js'
import {
	getQuestionsByType,
	getQuestions,
	getBankVersion
} from './bank-service.js'
import store from './store.js'
import {
	searchQuestions
} from './bank-service.js'

/**
 * 构建练习题目列表。
 * @param {object} options
 * @param {string} options.mode PRACTICE_MODE.*
 * @param {string} options.type 'all' | 'single' | 'multiple' | 'boolean'
 * @param {number} [options.count] 随机练习抽题数
 * @param {string} [options.keyword] 关键词过滤
 * @param {function} [options.random]
 * @returns {{mode:string,type:string,ids:string[],questions:Array}}
 */
export function buildPracticeList(options = {}) {
	const mode = options.mode || PRACTICE_MODE.sequence
	const type = options.type || 'all'
	const random = options.random || Math.random
	const keyword = options.keyword || ''

	let list
	if (mode === PRACTICE_MODE.mistakes) {
		const ids = store.mistakeIds().sort(
			(a, b) => (store.state.mistakes[b].ts || 0) - (store.state.mistakes[a].ts || 0)
		)
		list = getQuestions(ids)
		if (type !== 'all') list = list.filter((q) => q.type === type)
	} else if (mode === PRACTICE_MODE.favorites) {
		list = getQuestions(store.favoriteIds())
		if (type !== 'all') list = list.filter((q) => q.type === type)
	} else if (mode === PRACTICE_MODE.random) {
		const pool = getQuestionsByType(type)
		list = fisherYates(pool, random).slice(0, options.count || PRACTICE_DEFAULT_COUNT)
	} else {
		list = getQuestionsByType(type)
	}

	if (keyword) {
		const allowed = new Set(searchQuestions(list.map((q) => q.id), keyword).map((q) => q.id))
		list = list.filter((q) => allowed.has(q.id))
	}

	return {
		mode,
		type,
		ids: list.map((q) => q.id),
		questions: list
	}
}

/** 定位某题在练习列表中的下标（找不到返回 0） */
export function indexOfId(list, id) {
	const idx = list.ids.indexOf(id)
	return idx < 0 ? 0 : idx
}

/** 保存本轮题序与各筛选游标；旧版单游标只在模式、题型均吻合时接续。 */
export function loadPractice(options = {}) {
	const mode = PRACTICE_MODE[options.mode] || PRACTICE_MODE.sequence
	const type = ['all', 'single', 'multiple', 'boolean'].includes(options.type) ? options.type : 'all'
	const pool = getQuestionsByType(type)
	const requested = Number(options.count) || 20
	const count = mode === 'random' ? Math.max(1, Math.min(pool.length, requested)) : 0
	const saved = store.practiceSession(mode, type, count)
	let questions = []
	let index = 0
	const canResume = !options.fresh && saved && saved.bankVersion === getBankVersion() && (mode !==
		'random' || !saved.completed)
	if (canResume) {
		questions = getQuestions(saved.ids || []).filter(q => type === 'all' || q.type === type)
		if (mode === 'mistakes') questions = questions.filter(q => store.mistakeIds().includes(q.id))
		if (mode === 'favorites') questions = questions.filter(q => store.isFavorite(q.id))
		const currentId = saved.ids[saved.index]
		index = Math.max(0, questions.findIndex(q => q.id === currentId))
	}
	if (!questions.length) {
		questions = buildPracticeList({
			mode,
			type,
			count,
			random: options.random
		}).questions
		const old = store.lastPractice()
		if (!saved && !options.fresh && mode === 'sequence' && old?.mode === mode && old?.type === type)
			index = old.index || 0
	}
	if (options.id) index = Math.max(0, questions.findIndex(q => q.id === options.id))
	else if (options.index !== undefined) index = Number(options.index) || 0
	index = Math.min(Math.max(0, index), Math.max(0, questions.length - 1))
	return {
		mode,
		type,
		count,
		questions,
		ids: questions.map(q => q.id),
		index,
		completed: false,
		responses: canResume ? saved.responses || {} : {}
	}
}
