<template>
	<view class="np-page" :class="theme"><text>正在打开设置…</text></view>
</template>
<script>
import store from '../../core/store.js'
export default {
	computed: {
		theme: () => store.themeClass()
	},
	onShow() {
		uni.switchTab({
			url: '/pages/settings/index'
		})
	}
}
</script>
