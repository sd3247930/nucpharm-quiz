<template>
	<view class="np-page" :class="theme">
		<app-header title="考试成绩" :subtitle="headerSub" show-back />

		<view class="body">
			<!-- 总分 -->
			<view class="score-card">
				<text class="score-label">本次得分</text>
				<view class="score-row">
					<text class="score-value">{{ scoreText(summary.score) }}</text>
					<text class="score-total">/ {{ summary.totalPoints || 100 }}</text>
				</view>
				<view class="score-foot">
					<text class="score-foot-text">{{ accuracyLine }}</text>
				</view>
			</view>

			<!-- 概览 -->
			<view class="tiles">
				<stat-tile label="正确题数" :value="`${summary.correctCount || 0}/${summary.totalQuestions || 0}`"
					tone="correct" />
				<stat-tile label="用时" :value="durationText" tone="primary" />
				<stat-tile label="未作答" :value="unansweredText" tone="caution" />
			</view>

			<!-- 分题型 -->
			<text class="section-title">分题型表现</text>
			<view class="np-card-flat bytype-card">
				<view v-for="row in typeRows" :key="row.type" class="bytype-row">
					<view class="np-tag" :class="row.tagClass"><text>{{ row.label }}</text></view>
					<view class="bytype-mid">
						<text class="bytype-count">{{ row.correct }} / {{ row.total }} 题正确</text>
						<view class="bytype-bar">
							<view class="bytype-fill" :style="{ width: row.width }"></view>
						</view>
					</view>
					<text class="bytype-score">{{ row.score }} / {{ row.points }} 分</text>
				</view>
			</view>

			<!-- 操作 -->
			<view v-if="hasSnapshot" class="np-btn np-btn-primary action-btn" @tap="goReview">
				<text>查看试卷复盘（{{ wrongCount }} 道错题）</text>
			</view>
			<view class="np-btn np-btn-ghost action-btn" @tap="retake"><text>再考一次</text></view>
			<view class="np-btn np-btn-plain action-btn" @tap="goExamTab"><text>返回考试页</text></view>

			<view v-if="!hasSnapshot" class="tip">
				<text class="tip-text">
					本场考试的完整复盘已不在本机（仅保留最近 {{ maxSnapshots }} 场的逐题解析），上方为成绩概要。
				</text>
			</view>

			<view class="page-pad"></view>
		</view>
	</view>
</template>

<script>
import store from '../../core/store.js'
import AppHeader from '../../components/AppHeader.vue'
import StatTile from '../../components/StatTile.vue'
import {
	TYPE_LABEL,
	MAX_EXAM_SNAPSHOTS
} from '../../core/constants.js'
import {
	formatDuration,
	formatDateTime,
	rateText,
	scoreText
} from '../../core/format.js'

export default {
	components: {
		AppHeader,
		StatTile
	},
	data() {
		return {
			sessionId: '',
			record: null,
			snapshot: null,
			maxSnapshots: MAX_EXAM_SNAPSHOTS
		}
	},
	computed: {
		theme() {
			return store.themeClass()
		},
		summary() {
			if (this.record) return this.record
			if (this.snapshot && this.snapshot.result) return this.snapshot.result
			return {}
		},
		headerSub() {
			const ts = this.summary.submitAt
			return ts ? '交卷时间 ' + formatDateTime(ts) : '成绩概要'
		},
		accuracyLine() {
			return `正确率 ${rateText(this.summary.correctCount || 0, this.summary.totalQuestions || 0)} · 已作答 ${this.summary.answeredCount || 0} 题`
		},
		durationText() {
			return formatDuration(this.summary.usedSeconds || 0)
		},
		unansweredText() {
			const total = this.summary.totalQuestions || 0
			const answered = this.summary.answeredCount || 0
			return String(Math.max(0, total - answered))
		},
		typeRows() {
			const byType = this.summary.byType || {}
			return ['single', 'multiple', 'boolean'].map((type) => {
				const t = byType[type] || {
					total: 0,
					correct: 0,
					score: 0,
					points: 0
				}
				const totalPoints = t.total * (t.points || 0)
				return {
					type,
					label: TYPE_LABEL[type],
					correct: t.correct,
					total: t.total,
					score: t.score,
					points: totalPoints,
					width: t.total ? Math.min(100, Math.max(0, Math.round((t.correct / t.total) *
						100))) + '%' : '0%',
					tagClass: type === 'multiple' ?
						'np-tag-multiple' :
						type === 'boolean' ?
						'np-tag-boolean' :
						'np-tag-single'
				}
			})
		},
		hasSnapshot() {
			return !!this.snapshot
		},
		wrongCount() {
			if (this.snapshot && this.snapshot.result) return this.snapshot.result.wrongIds.length
			return (this.record && this.record.wrongIds ? this.record.wrongIds.length : 0)
		}
	},
	onLoad(options) {
		this.sessionId = options.sessionId || ''
		this.load()
	},
	methods: {
		scoreText,
		load() {
			this.record = store.examRecord(this.sessionId)
			this.snapshot = store.examSnapshot(this.sessionId)
			if (!this.record && this.snapshot && this.snapshot.result) {
				this.record = this.snapshot.result
			}
			if (!this.record && !this.snapshot) {
				uni.showToast({
					title: '未找到该场考试记录',
					icon: 'none'
				})
			}
		},
		goReview() {
			uni.navigateTo({
				url: `/pages/exam-review/index?sessionId=${this.sessionId}`
			})
		},
		retake() {
			uni.switchTab({
				url: '/pages/exam/index'
			})
		},
		goExamTab() {
			uni.switchTab({
				url: '/pages/exam/index'
			})
		}
	}
}
</script>

<style lang="scss" scoped>
.body {
	padding: 8rpx 32rpx 0;
}

.score-card {
	background: linear-gradient(160deg, #0b3d38 0%, #14554a 55%, #1a6b5a 100%);
	border-radius: 24rpx;
	padding: 40rpx 32rpx 32rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.score-label {
	font-size: 24rpx;
	color: rgba(255, 255, 255, 0.75);
}

.score-row {
	display: flex;
	align-items: baseline;
	margin-top: 12rpx;
}

.score-value {
	font-size: 96rpx;
	font-weight: 700;
	color: #ffffff;
	line-height: 1;
}

.score-total {
	font-size: 28rpx;
	color: rgba(255, 255, 255, 0.75);
	margin-left: 12rpx;
}

.score-foot {
	margin-top: 20rpx;
}

.score-foot-text {
	font-size: 24rpx;
	color: rgba(255, 255, 255, 0.85);
}

.tiles {
	display: flex;
	margin-top: 24rpx;
}

.tiles>* {
	margin-right: 16rpx;
}

.tiles>*:last-child {
	margin-right: 0;
}

.section-title {
	display: block;
	font-size: 28rpx;
	font-weight: 600;
	color: var(--np-text);
	margin: 32rpx 0 16rpx;
}

.bytype-card {
	padding: 20rpx 24rpx;
}

.bytype-row {
	display: flex;
	align-items: center;
	padding: 16rpx 0;
}

.bytype-mid {
	flex: 1;
	margin-left: 18rpx;
}

.bytype-count {
	font-size: 24rpx;
	color: var(--np-text-2);
}

.bytype-bar {
	height: 8rpx;
	background-color: var(--np-surface-2);
	border-radius: 4rpx;
	margin-top: 10rpx;
	overflow: hidden;
}

.bytype-fill {
	height: 100%;
	background-color: var(--np-primary);
	border-radius: 4rpx;
}

.bytype-score {
	font-size: 24rpx;
	color: var(--np-text);
	font-weight: 600;
	margin-left: 16rpx;
}

.action-btn {
	margin-top: 24rpx;
}

.tip {
	margin-top: 24rpx;
}

.tip-text {
	font-size: 21rpx;
	color: var(--np-text-3);
	line-height: 1.7;
}

.page-pad {
	height: 60rpx;
}
</style>
