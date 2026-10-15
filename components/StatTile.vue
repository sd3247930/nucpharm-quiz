<template>
	<view class="tile" @tap="$emit('tap')">
		<text class="tile-value" :style="{ color: valueColor }">{{ value }}</text>
		<text class="tile-label">{{ label }}</text>
		<text v-if="hint" class="tile-hint">{{ hint }}</text>
	</view>
</template>

<script>
import store from '../core/store.js'

export default {
	name: 'StatTile',
	props: {
		label: {
			type: String,
			default: ''
		},
		value: {
			type: String,
			default: '—'
		},
		hint: {
			type: String,
			default: ''
		},
		tone: {
			type: String,
			default: 'primary'
		} // primary | correct | wrong | caution | plain
	},
	computed: {
		valueColor() {
			const map = {
				primary: 'var(--np-primary)',
				correct: 'var(--np-correct)',
				wrong: 'var(--np-wrong)',
				caution: 'var(--np-caution)',
				plain: 'var(--np-text)'
			}
			return map[this.tone] || map.primary
		}
	},
	methods: {
		themeClass() {
			return store.themeClass()
		}
	}
}
</script>

<style lang="scss" scoped>
.tile {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 14px 4px;
	background-color: var(--np-surface-2);
	border-radius: 10px;
	min-width: 0;
}

.tile-value {
	font-size: 24px;
	font-weight: 700;
	line-height: 1.1;
}

.tile-label {
	font-size: 11px;
	color: var(--np-text-2);
	margin-top: 8rpx;
}

.tile-hint {
	font-size: 11px;
	color: var(--np-text-3);
	margin-top: 4rpx;
}
</style>
