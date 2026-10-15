<template>
	<view
		class="opt"
		:class="[themeClass(), stateClass]"
		@tap="onTap"
	>
		<view class="opt-key" :class="keyClass">
			<text class="opt-key-text">{{ option.key }}</text>
		</view>
		<view class="opt-body">
			<text class="opt-text">{{ option.text }}</text>
		</view>
		<view v-if="revealed" class="opt-mark">
			<text class="opt-mark-text">{{ markText }}</text>
		</view>
	</view>
</template>

<script>
	import store from '../core/store.js'

	export default {
		name: 'AnswerOption',
		props: {
			option: { type: Object, required: true },
			selected: { type: Boolean, default: false },
			revealed: { type: Boolean, default: false }, // 是否揭示对错（作答后 / 复盘）
			isAnswer: { type: Boolean, default: false }, // 是否为标准答案
			disabled: { type: Boolean, default: false },
			multiple: { type: Boolean, default: false }
		},
		computed: {
			stateClass() {
				if (this.revealed) {
					if (this.isAnswer) return 'opt-correct'
					if (this.selected) return 'opt-wrong'
					return 'opt-idle'
				}
				return this.selected ? 'opt-selected' : 'opt-idle'
			},
			keyClass() {
				if (this.revealed) {
					if (this.isAnswer) return 'opt-key-correct'
					if (this.selected) return 'opt-key-wrong'
					return ''
				}
				return this.selected ? 'opt-key-selected' : ''
			},
			markText() {
				if (this.isAnswer) return '✓'
				if (this.selected) return '✗'
				return ''
			}
		},
		methods: {
			themeClass() {
				return store.themeClass()
			},
			onTap() {
				if (this.disabled) return
				this.$emit('choose', this.option.key)
			}
		}
	}
</script>

<style lang="scss" scoped>
	.opt {
		display: flex;
		align-items: flex-start;
		padding: 26rpx 24rpx;
		background-color: var(--np-surface);
		border: 2rpx solid var(--np-border);
		border-radius: 20rpx;
		margin-bottom: 20rpx;
		transition: border-color 0.12s ease, background-color 0.12s ease;
	}

	.opt:active {
		background-color: var(--np-surface-2);
	}

	.opt-idle {
		border-color: var(--np-border);
	}

	.opt-selected {
		border-color: var(--np-primary);
		background-color: var(--np-primary-soft);
	}

	.opt-correct {
		border-color: var(--np-correct);
		background-color: var(--np-correct-soft);
	}

	.opt-wrong {
		border-color: var(--np-wrong);
		background-color: var(--np-wrong-soft);
	}

	.opt-key {
		width: 52rpx;
		height: 52rpx;
		border-radius: 50%;
		border: 2rpx solid var(--np-border-strong, #cbd5e1);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 20rpx;
		flex-shrink: 0;
	}

	.opt-key-selected {
		background-color: var(--np-primary);
		border-color: var(--np-primary);
	}

	.opt-key-correct {
		background-color: var(--np-correct);
		border-color: var(--np-correct);
	}

	.opt-key-wrong {
		background-color: var(--np-wrong);
		border-color: var(--np-wrong);
	}

	.opt-key-selected .opt-key-text,
	.opt-key-correct .opt-key-text,
	.opt-key-wrong .opt-key-text {
		color: #ffffff;
	}

	.opt-key-text {
		font-size: 26rpx;
		font-weight: 600;
		color: var(--np-text-2);
		line-height: 1;
	}

	.opt-body {
		flex: 1;
		min-width: 0;
	}

	.opt-text {
		font-size: calc(30rpx * var(--np-fs-scale, 1));
		line-height: 1.6;
		color: var(--np-text);
	}

	.opt-mark {
		width: 40rpx;
		display: flex;
		justify-content: flex-end;
		flex-shrink: 0;
	}

	.opt-mark-text {
		font-size: 32rpx;
		line-height: 1.5;
		color: var(--np-text-2);
	}
</style>
