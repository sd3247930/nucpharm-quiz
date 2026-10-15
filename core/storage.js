/**
 * 本地存储与进度备份（导出 / 导入）。
 *
 * 平台差异（iOS 网页端重点）：
 * - H5：localStorage 有 5MB 上限，需要容量监控；导出用 Blob + a[download]（Safari 长按保存兜底）；
 *   导入用 input[type=file] + FileReader。
 * - App：不支持 a[download]，导出走剪贴板；导入走剪贴板粘贴。
 * 所有写入都先序列化成功再落盘，避免半截数据覆盖旧数据。
 */

import {
	STORAGE_PREFIX,
	STORAGE_KEY,
	BACKUP_SCHEMA,
	BACKUP_APP_TAG,
	H5_STORAGE_WARN_BYTES,
	MAX_IMPORT_CHARS
} from './constants.js'

function key(name) {
	return STORAGE_PREFIX + name
}

export function readJSON(name, fallback) {
	try {
		const raw = uni.getStorageSync(key(name))
		if (!raw) return fallback
		if (typeof raw === 'object') return raw
		return JSON.parse(raw)
	} catch (e) {
		// 结构化数据损坏时一律回退默认值，绝不把半截垃圾数据喂给业务层
		console.warn('[storage] 内容损坏，回退默认值：', name, e)
		return fallback
	}
}

/** 读取标量字符串（题库版本号等非 JSON 内容） */
export function readScalar(name, fallback = '') {
	try {
		const raw = uni.getStorageSync(key(name))
		if (raw === '' || raw === null || raw === undefined) return fallback
		if (typeof raw === 'object') return fallback
		return String(raw)
	} catch (e) {
		return fallback
	}
}

/** 写入标量字符串（与 readScalar 配对，不使用 JSON 编码） */
export function writeScalar(name, value) {
	try {
		uni.setStorageSync(key(name), String(value))
		return true
	} catch (e) {
		console.error('[storage] 标量写入失败：', name, e)
		return false
	}
}

export function writeJSON(name, value) {
	try {
		uni.setStorageSync(key(name), JSON.stringify(value))
		return true
	} catch (e) {
		console.error('[storage] 写入失败：', name, e)
		return false
	}
}

export function removeKey(name) {
	try {
		uni.removeStorageSync(key(name))
		return true
	} catch (e) {
		return false
	}
}

export function readRaw(name) {
	try {
		return uni.getStorageSync(key(name)) || ''
	} catch (e) {
		return ''
	}
}

/** H5：统计 localStorage 占用（UTF-16 估算），返回字节数与是否超阈值 */
export function storageUsage() {
	// #ifdef H5
	try {
		let total = 0
		if (typeof localStorage !== 'undefined') {
			for (let i = 0; i < localStorage.length; i += 1) {
				const k = localStorage.key(i)
				if (!k.startsWith(STORAGE_PREFIX)) continue
				const v = localStorage.getItem(k) || ''
				total += (k.length + v.length) * 2
			}
		}
		return {
			bytes: total,
			warn: total > H5_STORAGE_WARN_BYTES,
			platform: 'h5'
		}
	} catch (e) {
		return {
			bytes: 0,
			warn: false,
			platform: 'h5'
		}
	}
	// #endif
	/* eslint-disable no-unreachable */
	try {
		const info = uni.getStorageInfoSync();
		return {
			bytes: (info.currentSize || 0) * 1024,
			warn: false,
			measured: true,
			platform: 'app'
		}
	} catch (e) {
		return {
			bytes: 0,
			warn: false,
			measured: false,
			platform: 'app'
		}
	}
}

/** 组装备份对象 */
export function buildBackup(data, bankVersion) {
	return {
		app: BACKUP_APP_TAG,
		schema: BACKUP_SCHEMA,
		schemaVersion: BACKUP_SCHEMA,
		bankVersion,
		exportedAt: Date.now(),
		data
	}
}

/**
 * 解析备份文本；任何异常都返回明确原因，绝不部分覆盖。
 * @returns {{ok:boolean, error?:string, payload?:object}}
 */
export function parseBackup(text) {
	if (!text) return {
		ok: false,
		error: '内容为空'
	}
	if (text.length > MAX_IMPORT_CHARS) return {
		ok: false,
		error: '文件过大，疑似非进度备份文件'
	}
	let payload
	try {
		payload = JSON.parse(text)
	} catch (e) {
		return {
			ok: false,
			error: 'JSON 解析失败，文件可能已损坏'
		}
	}
	if (!payload || typeof payload !== 'object') return {
		ok: false,
		error: '不是合法的备份结构'
	}
	if (payload.app !== BACKUP_APP_TAG) return {
		ok: false,
		error: '不是核药通的进度备份文件'
	}
	if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return {
		ok: false,
		error: '备份缺少有效数据段'
	}
	if (payload.schema !== BACKUP_SCHEMA) {
		return {
			ok: false,
			error: '备份格式版本不支持（schema=' + payload.schema + '）'
		}
	}
	return {
		ok: true,
		payload
	}
}

/**
 * 导出进度。
 * - H5：触发文件下载（iOS Safari 未触发时提示长按保存）
 * - App：复制到剪贴板
 */
export async function exportProgress(payload) {
	const json = JSON.stringify(payload, null, 2)
	const fileName = `nucpharm-progress-${new Date()
		.toISOString()
		.slice(0, 19)
		.replace(/[:T]/g, '')}.json`

	// #ifdef H5
	try {
		const blob = new Blob([json], {
			type: 'application/json'
		})
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = fileName
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		setTimeout(() => URL.revokeObjectURL(url), 1000)
		return {
			ok: true,
			mode: 'download',
			fileName
		}
	} catch (e) {
		// 兜底：复制到剪贴板
		return {
			...(await exportToClipboard(payload)),
			mode: 'clipboard',
			fileName
		}
	}
	// #endif
	/* eslint-disable no-unreachable */
	return {
		...(await exportToClipboard(payload)),
		mode: 'clipboard',
		fileName
	}
}

const IMPORT_JOURNAL = 'import-rollback'

/** 写入中断后恢复导入前的键；保留日志直到所有旧值恢复成功。 */
export function recoverStorageTransaction() {
	const journal = readJSON(IMPORT_JOURNAL, null)
	if (!journal) return true
	try {
		for (const [name, raw] of Object.entries(journal.before)) {
			if (raw === '') uni.removeStorageSync(key(name))
			else uni.setStorageSync(key(name), raw)
		}
		uni.removeStorageSync(key(IMPORT_JOURNAL))
		return true
	} catch (e) {
		return false
	}
}

export function atomicWriteJSON(entries) {
	if (!recoverStorageTransaction()) return false
	const before = {}
	try {
		const encoded = Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, JSON
			.stringify(value)
		]))
		for (const name of Object.keys(encoded)) before[name] = uni.getStorageSync(key(name)) || ''
		uni.setStorageSync(key(IMPORT_JOURNAL), JSON.stringify({
			before
		}))
		for (const [name, value] of Object.entries(encoded)) uni.setStorageSync(key(name), value)
		uni.removeStorageSync(key(IMPORT_JOURNAL))
		return true
	} catch (e) {
		recoverStorageTransaction()
		return false
	}
}

/** 把备份内容复制到剪贴板（H5 与 App 通用，iOS 上最稳的保存方式） */
export function exportToClipboard(payload) {
	const json = JSON.stringify(payload, null, 2)
	return new Promise((resolve) => {
		uni.setClipboardData({
			data: json,
			success: () => resolve({
				ok: true
			}),
			fail: (err) => resolve({
				ok: false,
				error: err && err.errMsg ? err.errMsg : '复制失败'
			})
		})
	})
}

/**
 * 选择备份文件并读取内容。
 * - H5：input[type=file] + FileReader（iOS Safari 可用）
 * - App：走剪贴板读取（App 端文件系统交互受权限与路径限制，剪贴板最稳）
 */
export function pickBackupText() {
	return new Promise((resolve) => {
		// #ifdef H5
		const input = document.createElement('input')
		let settled = false
		const finish = result => {
			if (settled) return
			settled = true
			input.remove()
			resolve(result)
		}
		input.type = 'file'
		input.accept = '.json,application/json'
		input.style.position = 'fixed'
		input.style.left = '-9999px'
		input.onchange = (e) => {
			const file = e.target.files && e.target.files[0]
			if (!file) {
				finish({ ok: false, cancelled: true })
				return
			}
			const reader = new FileReader()
			reader.onload = (ev) => finish({
				ok: true,
				text: String(ev.target.result || '')
			})
			reader.onerror = () => finish({
				ok: false,
				error: '文件读取失败'
			})
			reader.readAsText(file)
		}
		input.oncancel = () => finish({ ok: false, cancelled: true })
		document.body.appendChild(input)
		input.click()
		return
		// #endif
		/* eslint-disable no-unreachable */
		readClipboardText().then(resolve)
	})
}

/** 读取剪贴板文本 */
export function readClipboardText() {
	return new Promise((resolve) => {
		uni.getClipboardData({
			success: (res) => {
				const text = (res && res.data) || ''
				if (!text) resolve({
					ok: false,
					error: '剪贴板为空'
				})
				else resolve({
					ok: true,
					text
				})
			},
			fail: (err) =>
				resolve({
					ok: false,
					error: err && err.errMsg ? err.errMsg : '读取剪贴板失败'
				})
		})
	})
}

/** 清空全部本地进度（保留设置） */
export function clearProgressKeys() {
	;
	[
		STORAGE_KEY.answers,
		STORAGE_KEY.mistakes,
		STORAGE_KEY.favorites,
		STORAGE_KEY.notes,
		STORAGE_KEY.exams,
		STORAGE_KEY.activeExam,
		STORAGE_KEY.lastPractice,
		STORAGE_KEY.examSnapshots,
		STORAGE_KEY.practiceSessions
	].forEach(removeKey)
}
