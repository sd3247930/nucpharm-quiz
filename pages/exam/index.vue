<template>
	<view class="np-page" :class="theme">
		<app-header title="考试" show-logo />
		<view class="np-content">
			<view class="exam-banner">
				<view class="banner-label"><text>放射药学模拟考试</text><text>{{minutes}} 分钟</text></view><text
					class="banner-title">检验学习，稳步进阶。</text><text class="banner-sub">70 题 · 100 分 ·
					分层随机抽题</text>
			</view>
			<view v-if="activeBrief" class="active-card np-section">
				<view class="np-section-heading"><text class="active-title">有未完成的考试</text><text
						class="active-time np-number">{{clockText(activeBrief.remaining)}}</text></view>
				<text class="np-muted">已作答 {{activeBrief.answered}} / {{activeBrief.total}} 题 · 本场
					{{activeMinutes}} 分钟</text>
				<view class="active-progress"><progress-bar
						:value="activeBrief.answered/activeBrief.total*100" tone="caution" /></view>
				<button class="np-btn np-btn-primary" :disabled="starting" @tap="resumeExam">继续作答</button>
				<view class="active-secondary"><button class="np-link" @tap="askAbandon">放弃本次</button><button
						class="np-link" @tap="startExam">开始新的考试</button></view>
			</view>
			<view class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">试卷结构与分值</text><text
						class="np-caption">学习自测</text></view>
				<view v-for="row in quotaRows" :key="row.type" class="rule-row"><text class="np-tag"
						:class="row.tagClass">{{row.label}}</text><text class="rule-mid">{{row.count}} 题 ×
						{{row.points}} 分</text><text class="rule-points np-number">{{row.subtotal}} 分</text>
				</view>
				<view class="rule-total"><text class="np-muted">试卷汇总 / 共 70 题</text><text
						class="total-score">100 <text>分</text></text></view>
			</view>
			<button v-if="!activeBrief" class="np-btn np-btn-primary start-btn"
				:disabled="!availability.ok || starting"
				@tap="startExam">{{starting ? '正在准备试卷…' : '开始考试'}}</button>
			<text v-if="!availability.ok" class="availability-error">{{availabilityMessage}}</text>
			<view class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">考试须知</text><text
						class="np-caption">非官方认证考试</text></view>
				<view v-for="row in instructions" :key="row.label" class="info-row"><text
						class="info-label">{{row.label}}</text><text class="info-value">{{row.text}}</text>
				</view>
			</view>
			<view v-if="history.length" class="np-card np-section history-card">
				<view class="np-section-heading"><text class="np-section-title">最近考试记录</text><text
						class="np-caption">共 {{history.length}} 次</text></view>
				<button v-for="(rec,i) in history" :key="rec.sessionId" class="history-row"
					@tap="openResult(rec.sessionId)">
					<view class="history-score np-number">{{rec.score}}<text>分</text></view>
					<view class="np-grow history-body"><text class="history-title">第 {{history.length-i}}
							次模拟考试</text><text class="np-caption">正确率
							{{rate(rec.correctCount,rec.totalQuestions)}} · 用时
							{{duration(rec.usedSeconds)}}</text><text
							class="np-caption">{{dateText(rec.submitAt)}}</text></view><text
						class="np-arrow">›</text>
				</button>
			</view>
			<view :style="{height:tabPad + 'px'}" />
		</view>
		<confirm-dialog :visible="confirmVisible" :title="newAfterAbandon ? '放弃并开始新考试？' : '放弃本次考试？'"
			content="当前试卷与本次作答将被清除，不计入成绩。已有学习记录不受影响。" :confirm-text="newAfterAbandon ? '开始新考试' : '确认放弃'"
			@confirm="abandonExam" @cancel="confirmVisible=false" />
	</view>
</template>
<script>
import store from '../../core/store.js'
import AppHeader from '../../components/AppHeader.vue'
import ProgressBar from '../../components/ProgressBar.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import {
	EXAM_QUOTA,
	TYPE_LABEL
} from '../../core/constants.js'
import {
	examAvailability,
	sessionBrief,
	restoreSession,
	createSession
} from '../../core/exam-state.js'
import {
	formatClock,
	formatDuration,
	formatDateTime,
	rateText
} from '../../core/format.js'
import {
	tabBarPadBottom
} from '../../core/platform.js'
export default {
	components: {
		AppHeader,
		ProgressBar,
		ConfirmDialog
	},
	data: () => ({
		tabPad: tabBarPadBottom(),
		activeBrief: null,
		availability: examAvailability(),
		history: [],
		confirmVisible: false,
		newAfterAbandon: false,
		starting: false,
		timer: null
	}),
	computed: {
		theme: () => store.themeClass(),
		minutes: () => store.state.settings.examMinutes,
		activeMinutes: () => store.state.activeExam?.minutes,
		quotaRows() {
			return ['single', 'multiple', 'boolean'].map(type => ({
				type,
				label: TYPE_LABEL[type],
				...EXAM_QUOTA[type],
				subtotal: EXAM_QUOTA[type].count * EXAM_QUOTA[type].points,
				tagClass: 'np-tag-' + type
			}))
		},
		availabilityMessage() {
			return '题库数量不足：' + ['single', 'multiple', 'boolean'].filter(t => !this.availability[t].ok).map(
				t => `${TYPE_LABEL[t]}缺 ${this.availability[t].missing} 题`).join('，')
		},
		instructions() {
			return [{
				label: '时长规则',
				text: `新卷 ${this.minutes} 分钟，可在设置中调整，进行中的试卷时长保持不变。`
			}, {
				label: '抽题机制',
				text: '各题型池无放回抽题后混排，同一份试卷内不重复。'
			}, {
				label: '判分标准',
				text: '单选与判断选对得分；多选须与答案完全一致，不计部分分。'
			}, {
				label: '计时说明',
				text: '根据绝对截止时间计时，退后台、锁屏或重启仍消耗时间，到时自动交卷。'
			}, {
				label: '离线学习',
				text: '题库、作答与成绩均保存在本机，全程无需联网。'
			}]
		}
	},
	onShow() {
		this.starting = false;
		this.refresh();
		this.stopTimer();
		this.timer = setInterval(() => this.refresh(), 1000);
		store.touchResume()
	},
	onHide() {
		this.stopTimer()
	},
	onUnload() {
		this.stopTimer()
	},
	methods: {
		clockText: formatClock,
		duration: formatDuration,
		dateText: formatDateTime,
		rate: rateText,
		stopTimer() {
			if (this.timer) clearInterval(this.timer);
			this.timer = null
		},
		refresh() {
			const active = store.state.activeExam;
			if (active?.status === 'submitted' && active.result) store.completeExam(active);
			if (active?.status === 'active') {
				const restored = restoreSession(active);
				if (restored.autoSubmitted) {
					const saved = store.completeExam(restored.session);
					if (saved) uni.showToast({
						title: '考试已到时，已自动交卷',
						icon: 'none'
					})
				}
			}
			this.history = store.examHistory();
			this.availability = examAvailability();
			this.activeBrief = store.state.activeExam?.status === 'active' ? sessionBrief(store.state
				.activeExam) : null
		},
		startExam() {
			if (this.starting || !this.availability.ok) return;
			this.refresh();
			if (this.activeBrief) {
				this.newAfterAbandon = true;
				this.confirmVisible = true;
				return
			}
			this.beginExam()
		},
		beginExam() {
			if (this.starting) return;
			this.starting = true;
			try {
				if (!store.state.activeExam) store.saveActiveExam(createSession({
					minutes: this.minutes
				}));
				uni.navigateTo({
					url: '/pages/exam-session/index',
					fail: () => {
						this.starting = false;
						uni.showToast({
							title: '打开失败，可继续当前试卷',
							icon: 'none'
						})
					}
				})
			} catch (e) {
				this.starting = false;
				uni.showModal({
					title: '无法开始考试',
					content: e.message,
					showCancel: false
				})
			}
		},
		resumeExam() {
			if (this.starting) return;
			this.refresh();
			if (!this.activeBrief) return;
			this.starting = true;
			uni.navigateTo({
				url: '/pages/exam-session/index',
				fail: () => {
					this.starting = false
				}
			})
		},
		askAbandon() {
			this.newAfterAbandon = false;
			this.confirmVisible = true
		},
		abandonExam() {
			this.confirmVisible = false;
			store.clearActiveExam();
			this.refresh();
			if (this.newAfterAbandon) this.beginExam()
		},
		openResult(id) {
			uni.navigateTo({
				url: `/pages/exam-result/index?sessionId=${id}`
			})
		}
	}
}
</script>
<style scoped>
.exam-banner {
	background: linear-gradient(115deg, #0e3b33, #1a6b5a);
	color: #fff;
	padding: 18px 20px;
	border-radius: 16px;
	margin-bottom: 16px
}

.banner-label {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 11px;
	color: #c9e5dc
}

.banner-title {
	display: block;
	font-size: 22px;
	font-weight: 700;
	line-height: 1.4;
	margin: 10px 0 5px
}

.banner-sub {
	font-size: 14px;
	color: #c9e5dc
}

.active-card {
	border-radius: 12px;
	background: var(--np-caution-soft);
	border: 1px solid transparent
}

.active-title {
	font-size: 15px;
	font-weight: 600;
	color: var(--np-caution)
}

.active-time {
	font-size: 19px;
	font-weight: 700;
	color: var(--np-caution)
}

.active-progress {
	margin: 12px 0 16px
}

.active-secondary {
	display: flex;
	justify-content: space-between;
	margin-top: 4px
}

.rule-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 11px 10px;
	background: var(--np-surface-2);
	border-radius: 8px;
	margin-bottom: 8px
}

.rule-mid {
	flex: 1;
	min-width: 0;
	font-size: 13px;
	color: var(--np-text-2)
}

.rule-points {
	font-size: 15px;
	color: var(--np-text);
	font-weight: 600
}

.rule-total {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 10px;
	background: var(--np-primary-soft);
	border-radius: 8px;
	margin-top: 10px
}

.total-score {
	font-size: 25px;
	line-height: 1.4;
	font-weight: 700;
	color: var(--np-primary)
}

.total-score text {
	font-size: 12px
}

.start-btn {
	width: 100%;
	margin: 0 0 16px
}

.info-row {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 10px 0;
	border-top: 1px solid var(--np-border)
}

.info-label {
	font-size: 11px;
	color: var(--np-text-2);
	width: 52px;
	flex-shrink: 0;
	padding-top: 2px
}

.info-value {
	font-size: 13px;
	line-height: 1.7;
	color: var(--np-text);
	flex: 1;
	min-width: 0
}

.availability-error {
	display: block;
	color: var(--np-wrong);
	font-size: 13px;
	margin-bottom: 16px
}

.history-row {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 12px;
	text-align: left;
	line-height: 1.5;
	padding: 14px 0;
	margin: 0;
	background: transparent;
	border-top: 1px solid var(--np-border)
}

.history-score {
	width: 48px;
	min-height: 48px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	color: var(--np-primary);
	font-size: 23px;
	font-weight: 700;
	background: var(--np-primary-soft)
}

.history-score text {
	font-size: 10px
}

.history-body {
	display: flex;
	flex-direction: column;
	gap: 4px
}

.history-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--np-text)
}
</style>
