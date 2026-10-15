<template>
	<view class="card np-card" :class="themeClass()">
		<view class="card-head">
			<view class="np-tag" :class="tagClass">
				<text>{{ qtypeLabel }}</text>
			</view>
			<text v-if="multipleHint" class="card-hint">选全才算对</text>
			<view class="card-spacer"></view>
			<text class="card-index">{{ indexText }}</text>
		</view>
		<text class="card-stem">{{ question.stem }}</text>
		<slot></slot>
	</view>
</template>

<script>
	import store from '../core/store.js'
	import { TYPE_LABEL } from '../core/constants.js'

	export default {
		name: 'QuestionCard',
		props: {
			question: { type: Object, required: true },
			index: { type: Number, default: 0 },
			total: { type: Number, default: 0 }
		},
		computed: {
			qtypeLabel() {
				return TYPE_LABEL[this.question.type] || this.question.qtype || ''
			},
			tagClass() {
				if (this.question.type === 'multiple') return 'np-tag-multiple'
				if (this.question.type === 'boolean') return 'np-tag-boolean'
				return 'np-tag-single'
			},
			multipleHint() {
				return this.question.type === 'multiple'
			},
			indexText() {
				if (!this.total) return ''
				return `${this.index + 1} / ${this.total}`
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
	.card {
		padding: 32rpx 28rpx;
	}

	.card-head {
		display: flex;
		align-items: center;
		margin-bottom: 20rpx;
	}

	.card-hint {
		font-size: 20rpx;
		color: var(--np-text-3);
		margin-left: 12rpx;
	}

	.card-spacer {
		flex: 1;
	}

	.card-index {
		font-size: 22rpx;
		color: var(--np-text-3);
	}

	.card-stem {
		font-size: calc(32rpx * var(--np-fs-scale, 1));
		line-height: 1.7;
		color: var(--np-text);
		font-weight: 500;
	}
</style>
