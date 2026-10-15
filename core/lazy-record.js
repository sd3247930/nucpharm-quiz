/** 同步惰性记录：只推迟读取，不引入异步加载与保存之间的竞态。 */
export function lazyRecord(load) {
	let loaded = false
	let value
	return {
		get loaded() { return loaded },
		reset() { loaded = false; value = undefined },
		descriptor: {
			enumerable: true,
			configurable: true,
			get() {
				if (!loaded) {
					value = load()
					loaded = true
				}
				return value
			},
			set(next) { value = next; loaded = true }
		}
	}
}
