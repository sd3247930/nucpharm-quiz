/**
 * 测试用的极简 Vue 响应式替身。
 *
 * 线上代码只用到 reactive（core/store.js）。在 Node 里没有 Vue 运行时，
 * 也不希望为了测试引入第三方依赖，因此用最朴素的实现替代：
 * reactive 直接返回原对象（测试关心的是数据流，不关心渲染触发）。
 */

export function reactive(target) {
	return target
}

export function ref(value) {
	return { value }
}

export function computed(getter) {
	return {
		get value() {
			return getter()
		}
	}
}

export function watch() {
	return () => {}
}

export function nextTick(fn) {
	if (fn) fn()
	return Promise.resolve()
}

export function onMounted() {}
export function onUnmounted() {}
export function onShow() {}
export function onHide() {}
export function createApp() {
	return { mount() {} }
}

export default { reactive, ref, computed, watch, nextTick }
