<template>
	<view class="timer" :class="[themeClass(), toneClass]">
		<text class="timer-label">{{ label }}</text>
		<text class="timer-value">{{ clock }}</text>
	</view>
</template>

<script>
	import store from '../core/store.js'
	import { formatClock } from '../core/format.js'

	export default {
		name: 'ExamTimer',
		props: {
			remaining: { type: Number, default: 0 },
			label: { type: String, default: '剩余时间' },
			warnSeconds: { type: Number, default: 300 }
		},
		computed: {
			clock() {
				return formatClock(this.remaining)
			},
			toneClass() {
				if (this.remaining <= 60) return 'timer-danger'
				if (this.remaining <= this.warnSeconds) return 'timer-warn'
				return ''
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
	.timer {
		display: flex;
		align-items: baseline;
		padding: 12rpx 20rpx;
		border-radius: 16rpx;
		background-color: var(--np-surface);
		border: 1px solid var(--np-border);
	}

	.timer-label {
		font-size: 20rpx;
		color: var(--np-text-3);
		margin-right: 10rpx;
	}

	.timer-value {
		font-size: 30rpx;
		font-weight: 700;
		color: var(--np-primary);
		font-variant-numeric: tabular-nums;
	}

	.timer-warn {
		border-color: var(--np-caution);
	}

	.timer-warn .timer-value {
		color: var(--np-caution);
	}

	.timer-danger {
		border-color: var(--np-wrong);
	}

	.timer-danger .timer-value {
		color: var(--np-wrong);
	}
</style>
