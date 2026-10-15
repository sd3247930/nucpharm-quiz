<template>
	<view v-if="visible" class="sheet-mask" :class="themeClass()" @tap="close">
		<view class="sheet" @tap.stop>
			<view class="sheet-head">
				<text class="sheet-title">{{ title }}</text>
				<view class="sheet-close" @tap="close"><text>✕</text></view>
			</view>

			<view class="sheet-stats">
				<view class="stat">
					<text class="stat-value">{{ stats.answered }}</text>
					<text class="stat-label">已答</text>
				</view>
				<view class="stat">
					<text class="stat-value">{{ stats.unanswered }}</text>
					<text class="stat-label">未答</text>
				</view>
				<view v-if="stats.flags !== null" class="stat">
					<text class="stat-value">{{ stats.flags }}</text>
					<text class="stat-label">标记</text>
				</view>
				<view v-if="stats.correct !== null" class="stat">
					<text class="stat-value stat-correct">{{ stats.correct }}</text>
					<text class="stat-label">答对</text>
				</view>
				<view v-if="stats.wrong !== null" class="stat">
					<text class="stat-value stat-wrong">{{ stats.wrong }}</text>
					<text class="stat-label">答错</text>
				</view>
			</view>

			<scroll-view class="sheet-body" scroll-y>
				<view class="grid">
					<view v-for="item in items" :key="item.id" class="cell" :class="cellClass(item)"
						@tap="jump(item)">
						<text class="cell-text">{{ item.index + 1 }}</text>
						<text v-if="item.flag" class="cell-flag">•</text>
					</view>
				</view>
				<view class="sheet-legend">
					<view class="legend-item">
						<view class="legend-dot legend-unanswered"></view><text>未答</text>
					</view>
					<view class="legend-item">
						<view class="legend-dot legend-answered"></view><text>已答</text>
					</view>
					<view v-if="mode === 'practice'" class="legend-item">
						<view class="legend-dot legend-correct"></view><text>答对</text>
					</view>
					<view v-if="mode === 'practice'" class="legend-item">
						<view class="legend-dot legend-wrong"></view><text>答错</text>
					</view>
					<view v-if="mode === 'exam'" class="legend-item"><text
							class="legend-mark">•</text><text>已标记</text></view>
				</view>
				<view class="sheet-pad"></view>
			</scroll-view>
		</view>
	</view>
</template>

<script>
import store from '../core/store.js'

export default {
	name: 'QuestionNavigator',
	props: {
		visible: {
			type: Boolean,
			default: false
		},
		title: {
			type: String,
			default: '答题卡'
		},
		// [{ id, index, answered, correct|null, flag }]
		items: {
			type: Array,
			default: () => []
		},
		mode: {
			type: String,
			default: 'practice'
		}, // practice | exam
		currentId: {
			type: String,
			default: ''
		}
	},
	computed: {
		stats() {
			let answered = 0
			let correct = 0
			let wrong = 0
			let flags = 0
			let hasResult = false
			let hasFlag = false
			for (const it of this.items) {
				if (it.answered) answered += 1
				if (it.flag) {
					flags += 1
					hasFlag = true
				}
				if (it.correct === true) {
					correct += 1
					hasResult = true
				} else if (it.correct === false) {
					wrong += 1
					hasResult = true
				}
			}
			return {
				answered,
				unanswered: this.items.length - answered,
				flags: hasFlag || this.mode === 'exam' ? flags : null,
				correct: hasResult && this.mode === 'practice' ? correct : null,
				wrong: hasResult && this.mode === 'practice' ? wrong : null
			}
		}
	},
	methods: {
		themeClass() {
			return store.themeClass()
		},
		cellClass(item) {
			const classes = []
			if (this.mode === 'exam') {
				classes.push(item.answered ? 'cell-answered' : 'cell-unanswered')
				if (item.flag) classes.push('cell-flagged')
			} else if (item.correct === true) {
				classes.push('cell-correct')
			} else if (item.correct === false) {
				classes.push('cell-wrong')
			} else if (item.answered) {
				classes.push('cell-answered')
			} else {
				classes.push('cell-unanswered')
			}
			if (item.id === this.currentId) classes.push('cell-current')
			return classes
		},
		close() {
			this.$emit('close')
		},
		jump(item) {
			this.$emit('jump', item)
		}
	}
}
</script>

<style lang="scss" scoped>
.sheet-mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background-color: rgba(15, 23, 32, 0.45);
	z-index: 950;
	display: flex;
	align-items: flex-end;
}

.sheet {
	width: 100%;
	max-height: 78vh;
	background-color: var(--np-surface);
	border-radius: 28rpx 28rpx 0 0;
	display: flex;
	flex-direction: column;
	padding-bottom: env(safe-area-inset-bottom);
}

.sheet-head {
	display: flex;
	align-items: center;
	padding: 28rpx 32rpx 8rpx;
}

.sheet-title {
	flex: 1;
	font-size: 32rpx;
	font-weight: 600;
	color: var(--np-text);
}

.sheet-close {
	width: 44px;
	height: 44px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--np-text-3);
	font-size: 30rpx;
}

.sheet-stats {
	display: flex;
	padding: 8rpx 32rpx 20rpx;
}

.stat {
	display: flex;
	flex-direction: column;
	align-items: center;
	margin-right: 40rpx;
}

.stat-value {
	font-size: 34rpx;
	font-weight: 700;
	color: var(--np-text);
}

.stat-correct {
	color: var(--np-correct);
}

.stat-wrong {
	color: var(--np-wrong);
}

.stat-label {
	font-size: 20rpx;
	color: var(--np-text-3);
	margin-top: 4rpx;
}

.sheet-body {
	max-height: 52vh;
}

.grid {
	display: flex;
	flex-wrap: wrap;
	padding: 8rpx 24rpx;
}

.cell {
	width: 44px;
	height: 44px;
	margin: 4px;
	border-radius: 16rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
	border: 2rpx solid var(--np-border);
}

.cell-text {
	font-size: 26rpx;
	font-weight: 600;
	color: var(--np-text-2);
}

.cell-unanswered {
	background-color: var(--np-surface-2);
}

.cell-answered {
	background-color: var(--np-primary-soft);
	border-color: var(--np-primary);
}

.cell-answered .cell-text {
	color: var(--np-primary);
}

.cell-correct {
	background-color: var(--np-correct-soft);
	border-color: var(--np-correct);
}

.cell-correct .cell-text {
	color: var(--np-correct);
}

.cell-wrong {
	background-color: var(--np-wrong-soft);
	border-color: var(--np-wrong);
}

.cell-wrong .cell-text {
	color: var(--np-wrong);
}

.cell-flagged {
	border-color: var(--np-caution);
}

.cell-current {
	border-width: 4rpx;
	border-color: var(--np-accent);
}

.cell-flag {
	position: absolute;
	top: 2rpx;
	right: 8rpx;
	font-size: 30rpx;
	color: var(--np-caution);
	line-height: 1;
}

.sheet-legend {
	display: flex;
	flex-wrap: wrap;
	padding: 12rpx 32rpx 0;
}

.legend-item {
	display: flex;
	align-items: center;
	margin-right: 28rpx;
	margin-bottom: 12rpx;
	font-size: 22rpx;
	color: var(--np-text-3);
}

.legend-dot {
	width: 24rpx;
	height: 24rpx;
	border-radius: 6rpx;
	margin-right: 8rpx;
	border: 2rpx solid var(--np-border);
}

.legend-unanswered {
	background-color: var(--np-surface-2);
}

.legend-answered {
	background-color: var(--np-primary-soft);
	border-color: var(--np-primary);
}

.legend-correct {
	background-color: var(--np-correct-soft);
	border-color: var(--np-correct);
}

.legend-wrong {
	background-color: var(--np-wrong-soft);
	border-color: var(--np-wrong);
}

.legend-mark {
	color: var(--np-caution);
	font-size: 30rpx;
	margin-right: 8rpx;
	line-height: 1;
}

.sheet-pad {
	height: 32rpx;
}
</style>
