<template>
	<view class="np-page" :class="theme">
		<app-header title="首页" show-logo />
		<view v-if="startupError" class="np-content">
			<view class="np-card startup-error">
				<text class="np-section-title">暂时无法读取学习进度</text>
				<text class="np-muted">{{startupError}}</text>
				<button class="np-btn np-btn-primary" @tap="retryStartup">重试加载</button>
			</view>
		</view>
		<view v-else class="np-content">
			<view class="home-hero">
				<view class="hero-top"><text class="hero-name">核药通</text><text class="hero-brand">NucPharm ·
						放射药学</text></view>
				<text class="hero-slogan">把专业知识，练成实力。</text>
				<view class="hero-metric"><text>题库学习覆盖率</text><text class="np-number">{{summary.done}} /
						{{summary.total}} 题</text></view>
				<progress-bar :value="summary.coverage * 100" tone="inverse" />
				<view class="hero-foot"><text>已做不同题数 · 不重复累计</text><text
						class="np-number">{{(summary.coverage * 100).toFixed(1)}}%</text></view>
			</view>
			<button class="np-card continue-card np-row" @tap="continueStudy">
				<view class="np-icon-box"><text class="play">▷</text></view>
				<view class="np-grow continue-body"><text
						class="entry-title">{{last ? '继续练习' : '开始顺序练习'}}</text><text
						class="np-caption">{{continueSub}}</text></view><text class="np-arrow">›</text>
			</button>
			<button class="exam-entry np-row" @tap="goExam">
				<view class="np-icon-box">
					<image src="/static/tabbar/soft-gradient/exam-on.png" />
				</view>
				<view class="np-grow continue-body"><text class="entry-title">模拟考试</text><text
						class="np-caption">70 题 · 100 分 · {{examMinutes}} 分钟</text></view>
				<text class="exam-action">{{activeExam ? '继续考试' : '开始'}} →</text>
			</button>
			<view class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">快速开始练习</text><text
						class="np-caption">随时随地，自主训练</text></view>
				<view class="quick-grid">
					<button v-for="item in quickItems" :key="item.mode" class="quick-item" :class="item.mode"
						@tap="quickStart(item.mode)">
						<view class="quick-symbol">{{item.icon}}</view>
						<view class="quick-text"><text class="quick-title">{{item.title}}</text><text
								class="np-caption">{{item.description}}</text></view>
					</button>
				</view>
			</view>
			<view class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">题型学习覆盖率</text><text
						class="np-caption">共 {{summary.total}} 题</text></view>
				<view v-for="row in typeRows" :key="row.type" class="type-row">
					<view class="type-head"><text class="type-label"><text class="type-dot"
								:class="row.type">●</text> {{row.label}}</text><text
							class="np-caption np-number">{{row.done}} /
							{{row.total}}（{{row.percent.toFixed(1)}}%）</text></view>
					<progress-bar :value="row.percent"
						:tone="row.type === 'multiple' ? 'accent' : row.type === 'boolean' ? 'caution' : ''" />
				</view>
			</view>
			<view v-if="latest" class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">最近一次考试</text><text
						class="np-caption">{{dateText(latest.submitAt)}}</text></view>
				<button class="latest-row" @tap="goResult(latest.sessionId)">
					<view class="score"><text class="score-value np-number">{{latest.score}}</text><text
							class="np-caption">/ {{latest.totalPoints}} 分</text></view>
					<view class="latest-stats"><text class="np-caption">正确率
							{{rateText(latest.correctCount,latest.totalQuestions)}}</text><text
							class="np-muted">用时 {{durationText(latest.usedSeconds)}}</text></view><text
						class="np-arrow">›</text>
				</button>
			</view>
			<view class="home-footer"><text class="offline">✓ 完全离线可用</text><text
					class="np-caption">{{bank.name}} v{{bank.version}} · 共 {{bank.total}} 题</text></view>
			<view :style="{height:tabPad + 'px'}" />
		</view>
	</view>
</template>
<script>
import AppHeader from '../../components/AppHeader.vue'
import ProgressBar from '../../components/ProgressBar.vue'
import store from '../../core/store.js'
import { startupState, beginStartup, markStartup, failStartup, finishStartup } from '../../core/startup.js'
import {
	bankSummary,
	poolCount
} from '../../core/bank-service.js'
import {
	PRACTICE_MODE_LABEL,
	TYPE_LABEL
} from '../../core/constants.js'
import {
	formatDateTime,
	formatDuration,
	rateText
} from '../../core/format.js'
import {
	tabBarPadBottom
} from '../../core/platform.js'
export default {
	components: {
		AppHeader,
		ProgressBar
	},
	data: () => ({
		summary: store.summary(),
		byType: store.summaryByType(),
		latest: store.latestExam(),
		last: store.lastPractice(),
		bank: bankSummary(),
		tabPad: tabBarPadBottom()
	}),
	computed: {
		startupError: () => startupState.error,
		theme: () => store.themeClass(),
		activeExam: () => store.state.activeExam?.status === 'active',
		examMinutes() {
			return this.activeExam ? store.state.activeExam.minutes : store.state.settings.examMinutes
		},
		continueSub() {
			return this.last ?
				`${PRACTICE_MODE_LABEL[this.last.mode] || '练习'} · 第 ${(this.last.index || 0)+1} 题 · ${formatDateTime(this.last.ts)}` :
				'从第 1 题开始，逐步建立知识体系'
		},
		quickItems() {
			return [{
				mode: 'sequence',
				icon: '序',
				title: '顺序练习',
				description: '按题库序号推进'
			}, {
				mode: 'random',
				icon: '随',
				title: '随机练习',
				description: '每轮抽题不重复'
			}, {
				mode: 'mistakes',
				icon: '错',
				title: '错题练习',
				description: `${this.summary.mistakes} 道待复习`
			}, {
				mode: 'favorites',
				icon: '藏',
				title: '收藏练习',
				description: `${this.summary.favorites} 道已收藏`
			}]
		},
		typeRows() {
			return ['single', 'multiple', 'boolean'].map(type => {
				const done = this.byType[type]?.done || 0;
				const total = poolCount(type);
				return {
					type,
					label: TYPE_LABEL[type],
					done,
					total,
					percent: total ? done / total * 100 : 0
				}
			})
		}
	},
	onShow() {
		this.summary = store.summary();
		this.byType = store.summaryByType();
		this.latest = store.latestExam();
		this.last = store.lastPractice();
		store.touchResume()
	},
	methods: {
		retryStartup() {
			beginStartup()
			try {
				store.init()
				markStartup('essentialDataReady')
				this.summary = store.summary()
				this.byType = store.summaryByType()
				this.latest = store.latestExam()
				this.last = store.lastPractice()
			} catch (error) { failStartup() }
			this.$nextTick(() => finishStartup())
		},
		rateText,
		dateText: formatDateTime,
		durationText: formatDuration,
		continueStudy() {
			const p = this.last || {
				mode: 'sequence',
				type: 'all'
			};
			uni.navigateTo({
				url: `/pages/question/index?mode=${p.mode}&type=${p.type || 'all'}&count=${p.count || 0}`
			})
		},
		quickStart(mode) {
			if (mode === 'mistakes') {
				uni.switchTab({
					url: '/pages/mistakes/index'
				});
				return
			}
			if (mode === 'favorites' && !this.summary.favorites) {
				uni.showToast({
					title: '还没有收藏题目',
					icon: 'none'
				});
				return
			}
			uni.navigateTo({
				url: `/pages/question/index?mode=${mode}&type=all`
			})
		},
		goExam() {
			uni.switchTab({
				url: '/pages/exam/index'
			})
		},
		goResult(id) {
			uni.navigateTo({
				url: `/pages/exam-result/index?sessionId=${id}`
			})
		}
	}
}
</script>
<style scoped>
.startup-error {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: 24px
}

.home-hero {
	background: linear-gradient(120deg, #0e3b33, #1a6b5a);
	padding: 20px;
	border-radius: 16px;
	color: #fff;
	margin-bottom: 12px
}

.hero-top {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
	flex-wrap: wrap
}

.hero-name {
	font-size: 24px;
	line-height: 1.4;
	font-weight: 700;
	letter-spacing: 1px
}

.hero-brand {
	font-size: 11px;
	color: #b6e9dc;
	letter-spacing: .2px
}

.hero-slogan {
	display: block;
	font-size: 14px;
	color: #d1e9e3;
	margin: 3px 0 20px
}

.hero-metric,
.hero-foot {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 12px;
	line-height: 1.5
}

.hero-metric {
	margin-bottom: 10px
}

.hero-metric .np-number {
	font-weight: 600
}

.hero-foot {
	margin-top: 9px;
	color: #c9e5dc;
	font-size: 11px
}

.continue-card {
	width: 100%;
	border-radius: 12px;
	padding: 16px;
	text-align: left;
	margin: 0 0 12px;
	background: var(--np-surface);
	line-height: 1.5
}

.continue-body {
	display: flex;
	flex-direction: column;
	gap: 4px
}

.entry-title {
	font-size: 17px;
	font-weight: 700;
	color: var(--np-text)
}

.play {
	font-size: 26px;
	line-height: 1
}

.exam-entry {
	width: 100%;
	background: var(--np-primary-soft);
	border: 1px solid transparent;
	border-radius: 12px;
	padding: 16px;
	margin: 0 0 16px;
	text-align: left;
	line-height: 1.5
}

.exam-entry .entry-title {
	color: var(--np-primary)
}

.exam-action {
	flex-shrink: 0;
	font-size: 12px;
	color: var(--np-primary);
	font-weight: 700
}

.quick-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px
}

.quick-item {
	display: flex;
	align-items: center;
	gap: 8px;
	background: var(--np-surface-2);
	padding: 12px 8px;
	border-radius: 10px;
	margin: 0;
	text-align: left;
	line-height: 1.5;
	min-height: 70px
}

.quick-symbol {
	width: 30px;
	height: 34px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	font-size: 18px;
	font-weight: 700;
	color: var(--np-primary);
	background: var(--np-primary-soft);
	border-radius: 8px
}

.random .quick-symbol {
	color: var(--np-accent);
	background: var(--np-accent-soft)
}

.mistakes .quick-symbol {
	color: var(--np-wrong);
	background: var(--np-wrong-soft)
}

.favorites .quick-symbol {
	color: var(--np-caution);
	background: var(--np-caution-soft)
}

.quick-text {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px
}

.quick-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--np-text)
}

.quick-text .np-caption {
	font-size: 11px
}

.type-row+.type-row {
	margin-top: 16px
}

.type-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px
}

.type-label {
	font-size: 13px;
	color: var(--np-text)
}

.type-dot {
	color: var(--np-primary);
	font-size: 10px
}

.type-dot.multiple {
	color: var(--np-accent)
}

.type-dot.boolean {
	color: var(--np-caution)
}

.latest-row {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	padding: 12px;
	border-radius: 10px;
	background: var(--np-surface-2);
	line-height: 1.5;
	text-align: left
}

.score {
	display: flex;
	align-items: baseline;
	gap: 4px
}

.score-value {
	font-size: 38px;
	line-height: 1.2;
	color: var(--np-primary);
	font-weight: 700
}

.latest-stats {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px
}

.home-footer {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	margin: 24px 0 0;
	text-align: center
}

.offline {
	color: var(--np-primary);
	font-size: 13px
}

@media(min-width:600px) {
	.quick-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr))
	}

	.home-hero {
		padding: 24px
	}

	.hero-slogan {
		margin-bottom: 24px
	}
}
</style>
