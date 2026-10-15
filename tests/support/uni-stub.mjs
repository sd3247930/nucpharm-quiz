/**
 * Node 环境下的 uni-app 运行时替身。
 *
 * core/ 里的模块在真机/网页上依赖全局 `uni`，我们在 Node 里提供一个
 * 内存版实现，用来验证存储、备份恢复等纯逻辑。
 */

const memory = new Map()

export function installUniStub() {
	const calls = []
	globalThis.uni = {
		getStorageSync: (key) => (memory.has(key) ? memory.get(key) : ''),
		setStorageSync: (key, value) => {
			memory.set(key, value)
		},
		removeStorageSync: (key) => {
			memory.delete(key)
		},
		clearStorageSync: () => memory.clear(),
		getSystemInfoSync: () => ({
			platform: 'devtools',
			statusBarHeight: 24,
			windowWidth: 390,
			windowHeight: 844,
			osName: 'test'
		}),
		showToast: (opt) => calls.push(['showToast', opt]),
		showModal: (opt) => calls.push(['showModal', opt]),
		navigateTo: (opt) => calls.push(['navigateTo', opt]),
		switchTab: (opt) => calls.push(['switchTab', opt]),
		redirectTo: (opt) => calls.push(['redirectTo', opt]),
		navigateBack: () => calls.push(['navigateBack']),
		setClipboardData: (opt) => {
			calls.push(['setClipboardData', opt])
			globalThis.__clipboard = opt && opt.data
			if (opt && opt.success) opt.success({ data: opt.data })
		},
		getClipboardData: (opt) => {
			if (opt && opt.success) opt.success({ data: globalThis.__clipboard || '' })
		}
	}
	return {
		calls,
		memory,
		reset() {
			memory.clear()
			calls.length = 0
			globalThis.__clipboard = undefined
		},
		get(key) {
			return memory.get(key)
		}
	}
}

export function installVueStubIfNeeded() {
	// 由 --import ./tests/support/register.mjs 注入，这里只做兜底提示
	if (!globalThis.__vueStubInstalled) {
		// 不抛错：纯逻辑测试可以不依赖 vue
	}
}
