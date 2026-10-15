<template>
	<view class="np-page" :class="theme">
		<app-header title="练习" show-logo />
		<view class="np-content">
			<view class="np-section-heading"><text class="np-section-title">选择练习方式</text><text
					class="np-caption">顺序 / 随机 / 专项复习</text></view>
			<text class="filter-label">题型筛选</text><type-filter v-model="type" :items="typeChips" />
			<view class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">顺序练习</text><text
						class="np-caption">共 {{seqCount}} 题</text></view>
				<view class="progress-label"><text class="np-muted">已做 {{scopedDone}} /
						{{seqCount}}</text><text
						class="progress-rate np-number">{{coverage.toFixed(1)}}%</text></view>
				<progress-bar :value="coverage" />
				<text
					class="mode-description">{{cursor ? `上次进行到第 ${(cursor.index || 0)+1} 题，继续即可接着做。` : '按题库顺序逐题推进，学习进度自动保存在本机。'}}</text>
				<view class="mode-actions"><button class="np-btn np-btn-plain" @tap="restart">从第 1
						题重来</button><button class="np-btn np-btn-primary"
						@tap="start('sequence')">{{cursor ? '继续练习' : '开始练习'}}</button></view>
			</view>
			<view class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">随机练习</text><text
						class="np-caption">每轮不重复</text></view>
				<text class="mode-description no-top">从当前 {{seqCount}} 道题中无放回抽取，退出后可继续本轮。</text>
				<segmented-control v-model="randomCount" :options="countOptions" label="随机抽题数量" />
				<text v-if="randomSession" class="random-hint np-caption">本轮 {{randomSession.ids.length}} 题 ·
					第 {{randomSession.index+1}} 题</text>
				<button class="np-btn np-btn-primary random-start" :disabled="!canRandom"
					@tap="start('random')">{{randomSession ? '继续随机练习' : '开始随机练习'}}</button>
			</view>
			<view class="np-card np-section special-card">
				<text class="np-caption">专项复习 · 跟随当前题型筛选</text>
				<button class="special-row np-row" @tap="start('mistakes')">
					<view class="special-icon wrong">!</view>
					<view class="np-grow special-body"><text class="mode-title">错题练习</text><text
							class="np-caption">{{scopedMistakes}} 道待复习，答对后自动移出</text></view><text
						class="np-arrow">›</text>
				</button>
				<view class="np-divider" />
				<button class="special-row np-row" @tap="start('favorites')">
					<view class="special-icon favorite">☆</view>
					<view class="np-grow special-body"><text class="mode-title">收藏练习</text><text
							class="np-caption">{{scopedFavorites}} 道已收藏题目</text></view><text
						class="np-arrow">›</text>
				</button>
			</view>
			<view class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">学习概况</text><text
						class="np-caption">{{type === 'all' ? '全部题型' : typeLabel}}</text></view>
				<view class="stats-grid"><stat-tile label="已做不同题" :value="String(scopedDone)" /><stat-tile
						label="累计准确率" :value="accuracy" tone="correct" /><stat-tile label="当前错题"
						:value="String(scopedMistakes)" tone="wrong" /><stat-tile label="笔记数"
						:value="String(scopedNotes)" tone="caution" /></view>
				<text class="metrics-note">准确率 = 正确作答次数 / 累计作答次数，不含未作答题；覆盖率按不同题目去重。</text>
			</view>
			<view :style="{height:tabPad + 'px'}" />
		</view>
	</view>
</template>
<script>
import AppHeader from '../../components/AppHeader.vue'
import ProgressBar from '../../components/ProgressBar.vue'
import TypeFilter from '../../components/TypeFilter.vue'
import SegmentedControl from '../../components/SegmentedControl.vue'
import StatTile from '../../components/StatTile.vue'
import store from '../../core/store.js'
import {
	TYPE_LABEL
} from '../../core/constants.js'
import {
	poolCount,
	getQuestions
} from '../../core/bank-service.js'
import {
	tabBarPadBottom
} from '../../core/platform.js'
export default {
	components: {
		AppHeader,
		ProgressBar,
		TypeFilter,
		SegmentedControl,
		StatTile
	},
	data: () => ({
		type: 'all',
		randomCount: 20,
		summary: store.summary(),
		byType: store.summaryByType(),
		tabPad: tabBarPadBottom()
	}),
	computed: {
		theme: () => store.themeClass(),
		typeLabel() {
			return TYPE_LABEL[this.type]
		},
		seqCount() {
			return poolCount(this.type)
		},
		typeChips() {
			return ['all', 'single', 'multiple', 'boolean'].map(value => ({
				value,
				label: value === 'all' ? '全部' : TYPE_LABEL[value],
				count: poolCount(value)
			}))
		},
		cursor() {
			const saved = store.practiceSession('sequence', this.type);
			const last = store.lastPractice();
			return saved || (last?.mode === 'sequence' && last.type === this.type ? last : null)
		},
		countOptions() {
			return [{
				value: 20,
				label: '20 题',
				disabled: this.seqCount < 20
			}, {
				value: 50,
				label: '50 题',
				disabled: this.seqCount < 50
			}, {
				value: 0,
				label: `全部 ${this.seqCount}`
			}]
		},
		effectiveCount() {
			return this.randomCount || this.seqCount
		},
		canRandom() {
			return this.effectiveCount > 0 && this.effectiveCount <= this.seqCount
		},
		randomSession() {
			const s = store.practiceSession('random', this.type, this.effectiveCount);
			return s && !s.completed ? s : null
		},
		scopedDone() {
			return this.type === 'all' ? this.summary.done : this.byType[this.type]?.done || 0
		},
		scopedMistakes() {
			return this.filteredCount(store.mistakeIds())
		},
		scopedFavorites() {
			return this.filteredCount(store.favoriteIds())
		},
		scopedNotes() {
			return this.filteredCount(Object.keys(store.state.notes))
		},
		coverage() {
			return this.seqCount ? this.scopedDone / this.seqCount * 100 : 0
		},
		accuracy() {
			const s = this.type === 'all' ? {
				attempts: this.summary.attempts,
				correct: this.summary.accuracy * this.summary.attempts
			} : this.byType[this.type];
			return s?.attempts ? (s.correct / s.attempts * 100).toFixed(1) + '%' : '—'
		}
	},
	onShow() {
		this.summary = store.summary();
		this.byType = store.summaryByType();
		store.touchResume()
	},
	methods: {
		filteredCount(ids) {
			return getQuestions(ids).filter(q => this.type === 'all' || q.type === this.type).length
		},
		start(mode) {
			if (mode === 'mistakes' && !this.scopedMistakes || mode === 'favorites' && !this
				.scopedFavorites) {
				uni.showToast({
					title: '当前题型暂无可复习题目',
					icon: 'none'
				});
				return
			}
			if (mode === 'random' && !this.canRandom) return;
			uni.navigateTo({
				url: `/pages/question/index?mode=${mode}&type=${this.type}&count=${mode==='random' ? this.effectiveCount : 0}`
			})
		},
		restart() {
			uni.showModal({
				title: '从第一题重新练习？',
				content: '仅重置当前题型的顺序练习游标，保留作答历史、错题、笔记与收藏。',
				success: res => {
					if (res.confirm) uni.navigateTo({
						url: `/pages/question/index?mode=sequence&type=${this.type}&fresh=1`
					})
				}
			})
		}
	}
}
</script>
<style scoped>
.filter-label {
	font-size: 12px;
	color: var(--np-text-2)
}

.progress-label {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px
}

.progress-rate {
	font-size: 13px;
	color: var(--np-primary);
	font-weight: 600
}

.mode-description {
	display: block;
	font-size: 13px;
	line-height: 1.7;
	color: var(--np-text-2);
	margin: 14px 0
}

.no-top {
	margin-top: 0
}

.mode-actions {
	display: flex;
	gap: 8px
}

.mode-actions button {
	flex: 1;
	min-width: 0;
	font-size: 14px;
	padding: 10px 8px
}

.random-start {
	width: 100%;
	margin-top: 12px
}

.random-hint {
	display: block;
	margin-top: 8px
}

.special-row {
	margin: 0;
	padding: 16px 0;
	width: 100%;
	text-align: left;
	background: transparent;
	line-height: 1.5
}

.special-body {
	display: flex;
	flex-direction: column;
	gap: 4px
}

.special-icon {
	width: 38px;
	height: 38px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 10px;
	font-size: 22px;
	font-weight: 600;
	flex-shrink: 0
}

.wrong {
	background: var(--np-wrong-soft);
	color: var(--np-wrong)
}

.favorite {
	background: var(--np-caution-soft);
	color: var(--np-caution)
}

.mode-title {
	color: var(--np-text);
	font-size: 16px;
	font-weight: 600
}

.special-card {
	padding-bottom: 0
}

.stats-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px
}

.stats-grid :deep(.tile) {
	min-height: 108px;
	padding: 18px 16px;
	align-items: flex-start;
	border-radius: 12px;
	box-sizing: border-box
}

.stats-grid :deep(.tile-value) {
	font-size: 28px;
	line-height: 1.2;
	font-variant-numeric: tabular-nums;
	white-space: nowrap
}

.stats-grid :deep(.tile-label) {
	font-size: 13px;
	line-height: 1.5;
	margin-top: 8px
}

@media (max-width: 360px) {
	.stats-grid :deep(.tile-value) {
		font-size: 26px
	}
}

.metrics-note {
	display: block;
	font-size: 12px;
	color: var(--np-text-2);
	line-height: 1.7;
	margin-top: 14px
}
</style>
