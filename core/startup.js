/** 首屏就绪后关闭原生启动页；记录本机阶段耗时，不上传或持久化个人数据。 */
import { reactive } from 'vue'

const now = () => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
export const startupState = reactive({ error: '', complete: false })
const stages = {}
let startedAt = now()
let navigationHidden = false

function hideStartupNavigation() {
	try {
		if (typeof uni !== 'undefined' && typeof uni.hideTabBar === 'function') {
			uni.hideTabBar({ animation: false })?.catch?.(() => {})
			navigationHidden = true
		}
	} catch (error) { /* 首屏就绪时重试 */ }
}

export function beginStartup() {
	startedAt = now()
	Object.keys(stages).forEach(key => {
		if (typeof performance !== 'undefined') performance.clearMarks?.('nucpharm:' + key)
		delete stages[key]
	})
	startupState.error = ''
	startupState.complete = false
}

export function markStartup(stage) {
	if (!(stage in stages)) {
		stages[stage] = Math.max(0, Math.round((now() - startedAt) * 100) / 100)
		if (typeof performance !== 'undefined') performance.mark?.('nucpharm:' + stage)
	}
}

export function failStartup() {
	// 不清空或覆盖无法恢复的进度；允许用户释放空间后重试。
	startupState.error = '本地学习进度暂时无法恢复，请确认存储空间充足后重试。'
	hideStartupNavigation()
	markStartup('initializationFailed')
}

export function finishStartup() {
	if (startupState.complete) return
	if (startupState.error) hideStartupNavigation()
	else if (navigationHidden) {
		try {
			uni.showTabBar({ animation: false })?.catch?.(() => {})
			navigationHidden = false
		} catch (error) { /* 不阻塞首屏 */ }
	}
	markStartup('firstPageReady')
	// #ifdef APP-PLUS
	if (typeof plus !== 'undefined' && plus.navigator && typeof plus.navigator.closeSplashscreen === 'function') {
		try {
			plus.navigator.closeSplashscreen()
		} catch (error) {
			return // 保留可重试状态，避免原生API尚未就绪时永久漏关。
		}
	}
	// #endif
	startupState.complete = true
	markStartup('splashCloseRequested')
}

export function startupMetrics() {
	return { ...stages, complete: startupState.complete, failed: !!startupState.error }
}
