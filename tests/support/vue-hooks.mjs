/**
 * Node ESM 解析钩子：把 `import ... from 'vue'` 指向测试替身。
 */

const STUB_URL = new URL('./vue-stub.mjs', import.meta.url).href

export function resolve(specifier, context, nextResolve) {
	if (specifier === 'vue') {
		return { url: STUB_URL, shortCircuit: true }
	}
	return nextResolve(specifier, context)
}
