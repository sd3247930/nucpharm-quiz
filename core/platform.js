/**
 * 平台能力封装。
 *
 * 需求：Android（App）与 iOS 网页端（H5）功能完全一致，
 * iOS Safari 的差异点（路由、安全区、文件导入导出、存储上限、键盘回弹、手势返回）
 * 都集中在这里分支处理，页面代码不散落平台判断。
 */

/** 当前平台：'h5' | 'app' | 'other' */
export function currentPlatform() {
	// #ifdef H5
	return 'h5'
	// #endif
	// #ifdef APP-PLUS
	return 'app'
	// #endif
	/* eslint-disable no-unreachable */
	return 'other'
}

export function isH5() {
	return currentPlatform() === 'h5'
}

export function isIOSWeb() {
	// #ifdef H5
	if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)) return true
	// #endif
	return false
}

/** 状态栏高度（App 自定义导航栏时需要；H5 用 env(safe-area-inset-top) 兜底） */
export function statusBarHeight() {
	try {
		const info = uni.getSystemInfoSync()
		return info.statusBarHeight || 0
	} catch (e) {
		return 0
	}
}

/** 顶部安全区总高度（状态栏 + 导航栏内容区） */
export function safeTopHeight() {
	const status = statusBarHeight()
	// 自定义页头高度 44px，与 AppHeader 组件保持一致
	return status + 44
}

export function systemInfo() {
	try {
		return uni.getSystemInfoSync()
	} catch (e) {
		return {}
	}
}

/**
 * Tab 页内容底部需要预留的高度（原生 TabBar + 手势条安全区 + 呼吸空间）。
 *
 * 真机验收时发现：若不预留，页面最后一个元素（例如考试页的「开始考试」主按钮）
 * 会被底部 TabBar 压住。不同机型 TabBar 高度与安全区不同，因此按系统信息计算。
 */
export function tabBarPadBottom() {
	const info = systemInfo()
	// windowHeight 已排除原生 TabBar；H5 由 uni-page-wrapper 预留 windowBottom。
	// 仅加阅读呼吸空间，避免再次叠加完整底栏高度。
	return 20 + Math.max(0, Number(info.safeAreaInsets?.bottom) || 0)
}

let appearanceTimer = null
let appliedAppearance = null
let appearanceRequest = 0
let appearanceInFlight = 0
export function applyAppearance(settings) {
	const dark = settings.appearance === 'dark'
	if (appearanceTimer) clearTimeout(appearanceTimer)
	const request = ++appearanceRequest
	if (appliedAppearance === dark && !appearanceInFlight) return
	// init/App.onShow/首页onShow会连续触发；待底栏挂载后统一执行一批原生桥接。
	appearanceTimer = setTimeout(async () => {
		appearanceTimer = null
		appearanceInFlight++
		try {
			const ok = await updateAppearance(dark)
			if (request === appearanceRequest) appliedAppearance = ok ? dark : null
		} finally { appearanceInFlight-- }
	}, 100)
}

async function updateAppearance(dark) {
	const updates = []
	const settle = result => updates.push(Promise.resolve(result))
	try {
		// #ifdef H5
		// 网页底栏在页面根节点之外，用全局主题标记同步其磨砂底色。
		if (typeof document !== 'undefined') document.documentElement.dataset.npAppearance = dark ? 'dark' : 'light'
		// #endif
		// 显式引用 API，让 H5 编译器保留这些能力（动态 uni[name] 会被 tree-shaking 移除）。
		if (typeof uni.setTabBarStyle === 'function') settle(uni.setTabBarStyle({
			color: dark ? '#B0BED0' : '#526175',
			selectedColor: dark ? '#B6CBFF' : '#315CA8',
			backgroundColor: dark ? '#17212B' : '#FFFFFF',
			borderStyle: dark ? 'black' : 'white'
		}));
		['home', 'study', 'exam', 'mistakes', 'settings'].forEach((name, index) => {
			if (typeof uni.setTabBarItem === 'function') settle(uni.setTabBarItem({
			index,
			iconPath: `/static/tabbar/soft-gradient/${name}${dark ? '-dark-idle' : ''}.png`,
			selectedIconPath: `/static/tabbar/soft-gradient/${name}${dark ? '-dark' : '-on'}.png`
			}))
		})
		if (typeof uni.setNavigationBarColor === 'function') settle(uni.setNavigationBarColor({
			frontColor: dark ? '#ffffff' : '#000000',
			backgroundColor: dark ? '#17212B' : '#FFFFFF'
		}))
	} catch (e) {
		await Promise.allSettled(updates)
		return false
	}
	if (!updates.length) return false
	const results = await Promise.allSettled(updates)
	return results.every(result => result.status === 'fulfilled')
}

/**
 * 软键盘收起后恢复滚动位置（iOS Safari 常见问题）。
 * 在含输入框的页面 onFocus/onBlur 中调用。
 */
let savedScrollY = 0
export function rememberScrollForKeyboard() {
	// #ifdef H5
	if (typeof window !== 'undefined') savedScrollY = window.scrollY || 0
	// #endif
}

export function restoreScrollAfterKeyboard() {
	// #ifdef H5
	if (typeof window !== 'undefined' && isIOSWeb()) {
		setTimeout(() => {
			try {
				window.scrollTo(0, savedScrollY)
			} catch (e) {
				/* 忽略：部分 Safari 版本忽略该调用 */
			}
		}, 100)
	}
	// #endif
}
