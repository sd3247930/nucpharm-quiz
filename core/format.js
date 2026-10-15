/**
 * 格式化工具（纯函数，可在 Node 中直接测试）
 */

function pad2(n) {
	return n < 10 ? '0' + n : String(n)
}

/** 时间戳 → YYYY-MM-DD HH:mm */
export function formatDateTime(ts) {
	if (!ts) return '—'
	const d = new Date(ts)
	return (
		d.getFullYear() +
		'-' +
		pad2(d.getMonth() + 1) +
		'-' +
		pad2(d.getDate()) +
		' ' +
		pad2(d.getHours()) +
		':' +
		pad2(d.getMinutes())
	)
}

/** 时间戳 → YYYY-MM-DD */
export function formatDate(ts) {
	if (!ts) return '—'
	const d = new Date(ts)
	return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

/** 秒 → mm:ss（倒计时用，超过 1 小时显示 hh:mm:ss） */
export function formatClock(seconds) {
	const s = Math.max(0, Math.floor(seconds))
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const sec = s % 60
	if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`
	return `${pad2(m)}:${pad2(sec)}`
}

/** 秒 → 「1 小时 23 分」「3 分 05 秒」 */
export function formatDuration(seconds) {
	const s = Math.max(0, Math.floor(seconds))
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const sec = s % 60
	if (h > 0) return `${h} 小时 ${pad2(m)} 分`
	if (m > 0) return `${m} 分 ${pad2(sec)} 秒`
	return `${sec} 秒`
}

/** 正确率：分母为 0 时返回 null，避免出现 NaN% */
export function rateText(correct, total) {
	if (!total) return '—'
	return ((correct / total) * 100).toFixed(1) + '%'
}

export function percentText(part, total) {
	if (!total) return '0%'
	return Math.round((part / total) * 100) + '%'
}

/** 答案数组 → 展示文本（A、B、E） */
export function answerText(list) {
	if (!list || !list.length) return '未作答'
	return list.join('、')
}

/** 选项 key 数组 → 稳定排序字符串，用于比较 */
export function answerKey(list) {
	if (!list || !list.length) return ''
	return [...new Set(list)].sort().join('')
}

/** 分数展示：整数不带小数 */
export function scoreText(score) {
	if (score === null || score === undefined) return '—'
	return Number.isInteger(score) ? String(score) : score.toFixed(1)
}
