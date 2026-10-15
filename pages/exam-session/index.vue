<template>
	<view class="np-page" :class="[theme, fontClass]">
		<!-- 考试状态栏 -->
		<view class="status-bar">
			<view :style="{ height: statusBar + 'px' }"></view>
			<view class="status-row">
				<view class="status-left" @tap="askQuit">
					<text class="status-quit">退出</text>
				</view>
				<exam-timer :remaining="remaining" label="剩余" />
				<view class="status-right">
					<text class="status-count">{{ index + 1 }} / {{ total }}</text>
				</view>
			</view>
			<view class="progress">
				<view class="progress-fill" :style="{ width: progressWidth }"></view>
			</view>
		</view>

		<scroll-view class="scroll" scroll-y :scroll-top="scrollTop">
			<view class="wrap">
				<template v-if="question">
					<question-card :question="question" :index="index" :total="total">
						<view class="options">
							<answer-option v-for="opt in question.options" :key="opt.key" :option="opt"
								:selected="chosen.includes(opt.key)" :revealed="false"
								:multiple="question.type === 'multiple'" @choose="onChoose" />
						</view>
					</question-card>

					<view class="ops">
						<view class="op" :class="{ 'op-active': flagged }" @tap="toggleFlag">
							<text class="op-text">{{ flagged ? '★ 已标记' : '☆ 标记本题' }}</text>
						</view>
						<view class="op" @tap="clearCurrent">
							<text class="op-text">清空本题</text>
						</view>
					</view>
					<view class="tail-pad"></view>
				</template>
			</view>
		</scroll-view>

		<!-- 底部操作 -->
		<view class="bottom np-safe-bottom">
			<view class="bottom-row">
				<view class="bottom-btn" :class="{ 'bottom-disabled': index === 0 }" @tap="prev">
					<text class="bottom-text">上一题</text>
				</view>
				<view class="bottom-btn" @tap="navigatorVisible = true">
					<text class="bottom-text">答题卡</text>
				</view>
				<view class="bottom-btn" :class="{ 'bottom-disabled': index >= total - 1 }" @tap="next">
					<text class="bottom-text">下一题</text>
				</view>
				<view class="bottom-btn bottom-primary" @tap="askSubmit">
					<text class="bottom-text bottom-primary-text">交卷</text>
				</view>
			</view>
		</view>

		<question-navigator :visible="navigatorVisible" title="答题卡" mode="exam" :items="navItems"
			:current-id="question ? question.id : ''" @close="navigatorVisible = false" @jump="jumpTo" />

		<confirm-dialog :visible="submitVisible" title="确认交卷？" :content="submitContent" confirm-text="确认交卷"
			@confirm="doSubmit" @cancel="submitVisible = false" />

		<confirm-dialog :visible="quitVisible" title="退出考试？" content="退出后本次考试仍会保留，可在考试页点击「继续作答」；倒计时按真实时间继续走。"
			confirm-text="退出" @confirm="doQuit" @cancel="quitVisible = false" />
	</view>
</template>

<script>
import store from '../../core/store.js'
import QuestionCard from '../../components/QuestionCard.vue'
import AnswerOption from '../../components/AnswerOption.vue'
import QuestionNavigator from '../../components/QuestionNavigator.vue'
import ExamTimer from '../../components/ExamTimer.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import {
	statusBarHeight
} from '../../core/platform.js'
import {
	createSession,
	restoreSession,
	remainingSeconds,
	isExpired,
	setAnswer,
	toggleFlag,
	answerOf,
	progress,
	submit,
	toHistoryRecord,
	paperOf
} from '../../core/exam-state.js'
import {
	rememberScrollForKeyboard,
	restoreScrollAfterKeyboard
} from '../../core/platform.js'

export default {
	components: {
		QuestionCard,
		AnswerOption,
		QuestionNavigator,
		ExamTimer,
		ConfirmDialog
	},
	data() {
		return {
			statusBar: statusBarHeight(),
			session: null,
			paper: [],
			index: 0,
			chosen: [],
			remaining: 0,
			timer: null,
			navigatorVisible: false,
			submitVisible: false,
			quitVisible: false,
			scrollTop: 0,
			submitting: false
		}
	},
	computed: {
		theme() {
			return store.themeClass()
		},
		fontClass() {
			const scale = store.state.settings.fontScale
			return scale === 'small' ? 'np-fs-small' : scale === 'large' ? 'np-fs-large' : 'np-fs-normal'
		},
		question() {
			return this.paper[this.index] || null
		},
		total() {
			return this.paper.length
		},
		flagged() {
			return !!(this.session && this.question && this.session.flags.includes(this.question.id))
		},
		answeredCount() {
			if (!this.session) return 0
			return Object.keys(this.session.answers).filter((id) => this.session.answers[id].length).length
		},
		progressWidth() {
			if (!this.total) return '0%'
			return Math.max(2, Math.round((this.answeredCount / this.total) * 100)) + '%'
		},
		navItems() {
			if (!this.session) return []
			return this.paper.map((q, i) => ({
				id: q.id,
				index: i,
				answered: answerOf(this.session, q.id).length > 0,
				flag: this.session.flags.includes(q.id)
			}))
		},
		submitContent() {
			const p = this.session ? progress(this.session) : {
				unanswered: 0
			}
			if (!p.unanswered) return '已作答全部题目，交卷后将立即判分。'
			return `还有 ${p.unanswered} 道题未作答，未作答按 0 分计。确认交卷？`
		}
	},
	onLoad(options) {
		const fresh = options.fresh === '1'
		let session = store.state.activeExam
		try {
			if (session?.status === 'submitted' && session.result) {
				this.session = session;
				this.finalize(session);
				return
			}
			if (!session || session.status !== 'active') {
				session = createSession({
					minutes: store.state.settings.examMinutes
				})
			}
		} catch (e) {
			uni.showModal({
				title: '无法生成试卷',
				content: e.message,
				showCancel: false,
				success: () => uni.navigateBack()
			})
			return
		}
		const restored = restoreSession(session, Date.now())
		this.session = restored.session
		if (restored.autoSubmitted) {
			// 恢复时已超过截止时间：自动交卷一次
			this.finalize(this.session)
			return
		}
		this.paper = paperOf(this.session)
		// 从上次离开的题目继续
		const firstUnanswered = this.paper.findIndex((q) => answerOf(this.session, q.id).length === 0)
		this.index = firstUnanswered >= 0 ? firstUnanswered : 0
		this.syncChosen()
		this.startTimer()
		store.saveActiveExam(this.session)
	},
	onShow() {
		// 退后台/锁屏回来：按 deadlineAt 重算剩余时间，并检查是否已到时
		if (!this.session || this.session.status !== 'active') return
		this.tick()
		this.startTimer()
	},
	onHide() {
		this.stopTimer()
		this.persistIfActive()
	},
	onUnload() {
		this.stopTimer()
		this.persistIfActive()
	},
	methods: {
		/** 只持久化「进行中」的会话，交卷后不得再写回活动快照 */
		persistIfActive() {
			if (this.session && this.session.status === 'active') {
				store.saveActiveExam(this.session)
			}
		},
		startTimer() {
			this.stopTimer()
			this.timer = setInterval(() => this.tick(), 1000)
		},
		stopTimer() {
			if (this.timer) {
				clearInterval(this.timer)
				this.timer = null
			}
		},
		tick() {
			if (!this.session || this.session.status !== 'active') return
			const now = Date.now()
			this.remaining = remainingSeconds(this.session, now)
			if (isExpired(this.session, now)) {
				this.stopTimer()
				const {
					session
				} = submit(this.session, {
					now,
					reason: 'timeout'
				})
				this.session = session
				this.finalize(session)
			}
		},
		syncChosen() {
			this.chosen = this.question ? [...answerOf(this.session, this.question.id)] : []
			this.scrollTop = this.scrollTop === 0 ? 0.01 : 0
		},
		onChoose(key) {
			const q = this.question
			if (!q || !this.session || this.session.status !== 'active') return
			let next
			if (q.type === 'multiple') {
				const cur = answerOf(this.session, q.id)
				next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
			} else {
				next = [key]
			}
			setAnswer(this.session, q.id, next)
			this.chosen = [...answerOf(this.session, q.id)]
			store.saveActiveExam(this.session)
		},
		clearCurrent() {
			if (!this.question) return
			setAnswer(this.session, this.question.id, [])
			this.chosen = []
			store.saveActiveExam(this.session)
		},
		toggleFlag() {
			if (!this.question) return
			toggleFlag(this.session, this.question.id)
			store.saveActiveExam(this.session)
		},
		prev() {
			if (this.index === 0) return
			this.index -= 1
			this.syncChosen()
		},
		next() {
			if (this.index >= this.total - 1) return
			this.index += 1
			this.syncChosen()
		},
		jumpTo(item) {
			this.index = item.index
			this.navigatorVisible = false
			this.syncChosen()
		},
		askSubmit() {
			if (this.submitting) return
			this.submitVisible = true
		},
		doSubmit() {
			this.submitVisible = false
			if (this.submitting) return
			this.submitting = true
			const {
				session
			} = submit(this.session, {
				now: Date.now(),
				reason: 'manual'
			})
			this.session = session
			this.stopTimer()
			this.finalize(session)
		},
		askQuit() {
			this.quitVisible = true
		},
		doQuit() {
			this.quitVisible = false
			this.persistIfActive()
			uni.navigateBack()
		},
		/** 交卷后写入历史与快照，并跳转成绩页（幂等：同一 sessionId 只记一条） */
		finalize(session) {
			const result = session.result
			if (!result) return
			if (!store.completeExam(session)) {
				this.submitting = false
				uni.showModal({
					title: '成绩尚未保存',
					content: '本地写入失败，原有记录已保留。请释放空间后再次点击交卷。',
					showCancel: false
				})
				return
			}
			this.session = null

			if (session.submitReason === 'timeout') {
				uni.showToast({
					title: '考试时间已到，已自动交卷',
					icon: 'none',
					duration: 1800
				})
			}
			setTimeout(() => {
				uni.redirectTo({
					url: `/pages/exam-result/index?sessionId=${result.sessionId}`
				})
			}, session.submitReason === 'timeout' ? 1600 : 0)
		},
		onFocus() {
			rememberScrollForKeyboard()
		},
		onBlur() {
			restoreScrollAfterKeyboard()
		}
	}
}
</script>

<style lang="scss" scoped>
.status-bar {
	background-color: var(--np-surface);
	border-bottom: 1px solid var(--np-border);
}

.status-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12rpx 24rpx 8rpx;
}

.status-left,
.status-right {
	width: 130rpx;
}

.status-quit {
	font-size: 26rpx;
	color: var(--np-text-2);
}

.status-count {
	font-size: 26rpx;
	color: var(--np-text-2);
	text-align: right;
	font-variant-numeric: tabular-nums;
}

.progress {
	height: 6rpx;
	background-color: var(--np-surface-2);
}

.progress-fill {
	height: 100%;
	background-color: var(--np-primary);
}

.np-page {
	height: 100vh;
	display: flex;
	flex-direction: column;
}

.scroll {
	flex: 1;
	height: 0;
	min-height: 0;
}

.wrap {
	padding: 24rpx 32rpx 0;
}

.options {
	margin-top: 32rpx;
}

.ops {
	display: flex;
	margin-top: 8rpx;
}

.op {
	flex: 1;
	height: 76rpx;
	border-radius: 16rpx;
	background-color: var(--np-surface);
	border: 2rpx solid var(--np-border);
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: 16rpx;
}

.op:last-child {
	margin-right: 0;
}

.op-active {
	border-color: var(--np-caution);
	background-color: var(--np-caution-soft);
}

.op-text {
	font-size: 25rpx;
	color: var(--np-text-2);
}

.op-active .op-text {
	color: var(--np-caution);
}

.tail-pad {
	height: 40rpx;
}

.bottom {
	position: relative;
	flex-shrink: 0;
	background-color: var(--np-surface);
	border-top: 1px solid var(--np-border);
	padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
}

.bottom-row {
	display: flex;
	align-items: center;
}

.bottom-btn {
	flex: 1;
	min-height: 44px;
	height: auto;
	border-radius: 16rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: 12rpx;
	background-color: var(--np-surface-2);
}

.bottom-btn:last-child {
	margin-right: 0;
}

.bottom-text {
	font-size: 25rpx;
	color: var(--np-text-2);
}

.bottom-primary {
	background-color: var(--np-primary);
}

.bottom-primary-text {
	color: #ffffff;
	font-weight: 600;
}

.bottom-disabled {
	opacity: 0.4;
}
</style>
