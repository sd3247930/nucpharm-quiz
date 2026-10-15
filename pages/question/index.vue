<template>
	<view class="np-page" :class="[theme, fontClass]">
		<app-header :title="modeLabel" :subtitle="subtitle" show-back :right-text="favorite ? '已收藏' : '收藏'"
			@right="toggleFav" />

		<scroll-view class="scroll" :scroll-y="!lawVisible" :scroll-top="scrollTop">
			<view class="wrap">
				<template v-if="question">
					<view class="np-card practice-tools">
						<view class="explanation-control">
							<view class="control-copy">
								<text class="control-title">试题详解</text>
								<text class="control-hint">作答后显示解析</text>
							</view>
							<switch class="explanation-switch" :checked="explanationOpen" :color="switchColor"
								aria-label="显示试题详解" @change="onExplanationChange" />
						</view>
						<button class="law-trigger" role="button" tabindex="0" aria-label="查看本题法规" aria-haspopup="dialog"
							:aria-expanded="lawVisible" @tap="openLaw" @keydown.enter.prevent="openLaw"
							@keydown.space.prevent="openLaw">法规</button>
					</view>

					<question-card :question="question" :index="index" :total="total">
						<view class="options">
							<answer-option v-for="opt in question.options" :key="opt.key" :option="opt"
								:selected="chosen.includes(opt.key)" :revealed="revealed"
								:is-answer="question.answer.includes(opt.key)" :disabled="revealed"
								:multiple="question.type === 'multiple'" @choose="onChoose" />
						</view>

						<!-- 多选确认 -->
						<view v-if="question.type === 'multiple' && !revealed"
							class="np-btn np-btn-primary submit-btn"
							:class="{ 'np-btn-disabled': !chosen.length }" @tap="submitAnswer">
							<text>确定答案（已选 {{ chosen.length }} 项）</text>
						</view>

						<!-- 判定结果 -->
						<view v-if="revealed" class="result-line"
							:class="isRight ? 'result-ok' : 'result-bad'">
							<text class="result-text">
								{{ isRight ? '回答正确' : '回答错误' }} · 正确答案：{{ answerText(question.answer) }}
							</text>
							<text v-if="chosenText" class="result-sub">你的选择：{{ chosenText }}</text>
						</view>
					</question-card>

					<!-- 解析 -->
					<view v-if="revealed && explanationOpen" class="np-card-flat analysis">
						<view class="analysis-head">
							<text class="analysis-title">试题详解</text>
						</view>
						<text class="analysis-body">{{ question.explanation || '题库中本题暂无经核验的解析。' }}</text>
						<view class="np-divider analysis-divider"></view>
						<text class="analysis-src">题源：{{ questionSource }}</text>
					</view>

					<!-- 笔记 -->
					<view class="np-card note-card">
						<view class="analysis-head note-head" @tap="toggleNote">
							<view class="note-heading">
								<text class="analysis-title note-title">我的笔记</text>
								<text class="note-subtitle">记录错因，梳理易混点</text>
							</view>
							<text class="analysis-toggle note-toggle">{{ noteEditing ? '收起' : note ? '编辑' : '添加' }}</text>
						</view>
						<view v-if="noteEditing" class="note-editor">
							<textarea v-model="noteText" class="note-area" placeholder="记录本题错因、易混点或复习要点"
								:maxlength="2000" @focus="onFocus" @blur="onBlur" />
							<view class="note-editor-meta">
								<text>仅保存在本机</text>
								<text class="note-count">{{ noteText.length }} / 2000</text>
							</view>
							<view class="note-actions">
								<view class="np-btn np-btn-primary note-btn" @tap="saveNote"><text>保存笔记</text>
								</view>
							</view>
						</view>
						<view v-else-if="note" class="note-preview">
							<text class="note-content">{{ note }}</text>
						</view>
						<view v-else class="note-empty">
							<text class="note-empty-title">暂无笔记</text>
							<text class="note-empty-hint">点击“添加”，记录本题的复习要点。</text>
						</view>
					</view>

					<view class="tail-pad"></view>
				</template>

				<view v-else class="empty">
					<text class="empty-title">暂无题目</text>
					<text class="empty-desc">{{ emptyReason }}</text>
				</view>
			</view>
		</scroll-view>

		<!-- 底部操作栏 -->
		<view class="bottom np-safe-bottom">
			<view class="bottom-row">
				<view class="bottom-btn" :class="{ 'bottom-disabled': index === 0 }" @tap="prev">
					<text class="bottom-text">上一题</text>
				</view>
				<view class="bottom-btn" @tap="openNavigator">
					<text class="bottom-text">答题卡 {{ answeredCount }}/{{ total }}</text>
				</view>
				<view class="bottom-btn" @tap="toggleFav">
					<text class="bottom-text">{{ favorite ? '★ 已收藏' : '☆ 收藏' }}</text>
				</view>
				<view class="bottom-btn bottom-primary" :class="{ 'bottom-disabled': index >= total - 1 }"
					@tap="next">
					<text class="bottom-text bottom-primary-text">下一题</text>
				</view>
			</view>
		</view>

		<question-navigator :visible="navigatorVisible" title="答题卡" mode="practice" :items="navItems"
			:current-id="question ? question.id : ''" @close="navigatorVisible = false" @jump="jumpTo" />
		<law-dialog :visible="lawVisible" :content="question ? question.law || '' : ''"
			:source="questionSource" @close="closeLaw" />
	</view>
</template>

<script>
import store from '../../core/store.js'
import AppHeader from '../../components/AppHeader.vue'
import QuestionCard from '../../components/QuestionCard.vue'
import AnswerOption from '../../components/AnswerOption.vue'
import QuestionNavigator from '../../components/QuestionNavigator.vue'
import LawDialog from '../../components/LawDialog.vue'
import {
	PRACTICE_MODE,
	PRACTICE_MODE_LABEL,
	TYPE_LABEL
} from '../../core/constants.js'
import {
	loadPractice
} from '../../core/session.js'
import {
	isCorrect
} from '../../core/grading.js'
import {
	answerText
} from '../../core/format.js'
import {
	rememberScrollForKeyboard,
	restoreScrollAfterKeyboard
} from '../../core/platform.js'

export default {
	components: {
		AppHeader,
		QuestionCard,
		AnswerOption,
		QuestionNavigator,
		LawDialog
	},
	data() {
		return {
			list: [],
			index: 0,
			chosen: [],
			revealed: false,
			isRight: false,
			navigatorVisible: false,
			explanationOpen: true,
			lawVisible: false,
			noteEditing: false,
			noteText: '',
			scrollTop: 0,
			params: {},
			emptyReason: '',
			practice: null,
			autoNextTimer: null
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
			return this.list[this.index] || null
		},
		questionSource() {
			if (!this.question) return ''
			return [TYPE_LABEL[this.question.type] || this.question.qtype, this.question.source?.location]
				.filter(Boolean).join(' ')
		},
		switchColor() {
			return store.state.settings.appearance === 'dark' ? '#4FB99F' : '#1A6B5A'
		},
		total() {
			return this.list.length
		},
		modeLabel() {
			return PRACTICE_MODE_LABEL[this.params.mode] || '练习'
		},
		subtitle() {
			if (!this.question) return ''
			const typeLabel = TYPE_LABEL[this.question.type] || ''
			const scope = this.params.type === 'all' ? '全部题型' : TYPE_LABEL[this.params.type] || ''
			return `${typeLabel} · ${scope}`
		},
		favorite() {
			return this.question ? store.isFavorite(this.question.id) : false
		},
		note() {
			return this.question ? store.noteOf(this.question.id) : ''
		},
		chosenText() {
			return this.chosen.length ? answerText(this.chosen) : ''
		},
		answeredCount() {
			return this.list.filter(q => !!this.practice?.responses?.[q.id]).length
		},
		navItems() {
			return this.list.map((q, i) => {
				const rec = this.practice?.responses?.[q.id]
				return {
					id: q.id,
					index: i,
					answered: !!rec,
					correct: rec ? !!rec.lastOk : null,
					flag: false
				}
			})
		}
	},
	onLoad(options) {
		const built = loadPractice({
			mode: options.mode,
			type: options.type,
			count: options.count,
			fresh: options.fresh === '1',
			id: options.id,
			index: options.index
		})
		this.params = {
			mode: built.mode,
			type: built.type,
			count: built.count
		}
		this.practice = built
		this.list = built.questions
		this.index = built.index
		if (!this.list.length) this.emptyReason = '当前筛选条件下暂无可练习题目，可返回练习页更换题型。'

		this.syncQuestionState()
	},
	onUnload() {
		this.cancelAutoNext()
		this.persistCursor()
	},
	onHide() {
		this.cancelAutoNext()
		this.lawVisible = false
		this.persistCursor()
	},
	onShow() {
		this.noteText = this.note
		this.explanationOpen = store.state.settings.showExplanation === 'immediate'
	},
	onBackPress() {
		if (!this.lawVisible) return false
		this.closeLaw()
		return true
	},
	methods: {
		answerText,
		/** 还原当前题的作答状态（已答过的题再次进入时展示判定结果） */
		syncQuestionState() {
			this.cancelAutoNext()
			const q = this.question
			this.chosen = []
			this.revealed = false
			this.isRight = false
			this.noteText = q ? store.noteOf(q.id) : ''
			this.noteEditing = false
			this.lawVisible = false
			this.explanationOpen = store.state.settings.showExplanation === 'immediate'
			this.scrollTop = this.scrollTop === 0 ? 0.01 : 0
			if (!q) return
			const rec = this.practice?.responses?.[q.id]
			if (rec && rec.last && rec.last.length) {
				this.chosen = [...rec.last]
				this.revealed = true
				this.isRight = !!rec.lastOk
			}
		},
		cancelAutoNext() {
			if (this.autoNextTimer) clearTimeout(this.autoNextTimer);
			this.autoNextTimer = null
		},
		onExplanationChange(event) {
			this.cancelAutoNext()
			this.explanationOpen = !!event.detail.value
			store.setSettings({ showExplanation: this.explanationOpen ? 'immediate' : 'afterSubmit' })
		},
		openLaw() {
			this.cancelAutoNext()
			if (this.question) this.lawVisible = true
		},
		closeLaw() {
			this.lawVisible = false
		},
		persistCursor() {
			if (!this.practice || !this.list.length) return
			store.savePracticeSession({
				mode: this.params.mode,
				type: this.params.type,
				count: this.params.count,
				ids: this.list.map(q => q.id),
				index: this.index,
				responses: this.practice.responses,
				completed: this.params.mode === 'random' && this.list.every(q => !!this.practice
					.responses[q.id])
			})
		},

		onChoose(key) {
			const q = this.question
			if (!q || this.revealed) return
			if (q.type === 'multiple') {
				const pos = this.chosen.indexOf(key)
				if (pos >= 0) this.chosen.splice(pos, 1)
				else this.chosen.push(key)
				this.chosen.sort()
				return
			}
			this.chosen = [key]
			this.submitAnswer()
		},
		submitAnswer() {
			const q = this.question
			if (!q || this.revealed || !this.chosen.length) return
			this.isRight = store.recordAnswer(q, this.chosen)
			this.revealed = true
			this.practice.responses[q.id] = {
				last: [...this.chosen],
				lastOk: this.isRight
			}
			this.persistCursor()
			if (store.state.settings.showExplanation === 'afterSubmit') {
				this.explanationOpen = false
			}
			if (this.isRight && store.state.settings.autoNext && this.index < this.total - 1) {
				this.cancelAutoNext()
				this.autoNextTimer = setTimeout(() => this.next(), 650)
			}
		},
		prev() {
			if (this.index === 0) return
			this.index -= 1
			this.syncQuestionState()
			this.persistCursor()
		},
		next() {
			if (this.index >= this.total - 1) {
				uni.showToast({
					title: '已经是最后一题',
					icon: 'none'
				})
				return
			}
			this.index += 1
			this.syncQuestionState()
			this.persistCursor()
		},
		jumpTo(item) {
			this.index = item.index
			this.navigatorVisible = false
			this.syncQuestionState()
			this.persistCursor()
		},
		openNavigator() {
			this.cancelAutoNext()
			if (!this.total) return
			this.navigatorVisible = true
		},
		toggleFav() {
			const q = this.question
			if (!q) return
			const added = store.toggleFavorite(q.id)
			uni.showToast({
				title: added ? '已收藏' : '已取消收藏',
				icon: 'none'
			})
		},
		toggleNote() {
			this.cancelAutoNext()
			this.noteEditing = !this.noteEditing
			if (this.noteEditing) this.noteText = this.note
		},
		saveNote() {
			const q = this.question
			if (!q) return
			store.setNote(q.id, this.noteText)
			this.noteEditing = false
			uni.showToast({
				title: '笔记已保存',
				icon: 'none'
			})
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
	padding: 8rpx 32rpx 0;
}

.practice-tools {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px;
	margin-bottom: 12px;
}

.explanation-control {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.control-copy {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.control-title {
	color: var(--np-text);
	font-size: 14px;
	font-weight: 600;
	line-height: 1.5;
}

.control-hint {
	color: var(--np-text-2);
	font-size: 12px;
	line-height: 1.5;
}

.explanation-switch {
	flex-shrink: 0;
}

.law-trigger {
	flex-shrink: 0;
	min-width: 64px;
	min-height: 44px;
	margin: 0;
	padding: 10px 14px;
	border: 1px solid var(--np-border);
	border-radius: 10px;
	background-color: var(--np-primary-soft);
	color: var(--np-primary);
	font-size: 14px;
	font-weight: 600;
	line-height: 1.5;
}

.options {
	margin-top: 32rpx;
}

.submit-btn {
	margin-top: 12rpx;
}

.result-line {
	margin-top: 20rpx;
	display: flex;
	flex-direction: column;
}

.result-text {
	font-size: 28rpx;
	font-weight: 600;
}

.result-ok .result-text {
	color: var(--np-correct);
}

.result-bad .result-text {
	color: var(--np-wrong);
}

.result-sub {
	font-size: 23rpx;
	color: var(--np-text-3);
	margin-top: 6rpx;
}

.analysis {
	margin-top: 24rpx;
	padding: 24rpx;
}

.analysis-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.analysis-title {
	font-size: 28rpx;
	font-weight: 600;
	color: var(--np-text);
}

.analysis-toggle {
	font-size: 23rpx;
	color: var(--np-primary);
}

.analysis-body {
	display: block;
	font-size: calc(26rpx * var(--np-fs-scale, 1));
	color: var(--np-text-2);
	line-height: 1.8;
	margin-top: 14rpx;
}

.analysis-divider {
	margin: 20rpx 0 12rpx;
}

.analysis-src {
	display: block;
	font-size: 21rpx;
	color: var(--np-text-3);
	margin-top: 4rpx;
}

.note-card {
	margin-top: 16px;
	padding: 16px;
}

.note-head {
	min-height: 44px;
	gap: 12px;
}

.note-heading {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.note-title {
	font-size: 16px;
	line-height: 1.5;
	font-weight: 700;
}

.note-subtitle {
	font-size: 12px;
	line-height: 1.6;
	color: var(--np-text-2);
}

.note-toggle {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 36px;
	padding: 6px 12px;
	box-sizing: border-box;
	border-radius: 8px;
	background-color: var(--np-primary-soft);
	font-size: 13px;
	line-height: 1.5;
	white-space: nowrap;
}

.note-editor,
.note-preview,
.note-empty {
	margin-top: 16px;
}

.note-preview,
.note-empty {
	padding: 14px 16px;
	border-radius: 10px;
	background-color: var(--np-surface-2);
}

.note-content {
	display: block;
	font-size: calc(14px * var(--np-fs-scale, 1));
	line-height: 1.8;
	color: var(--np-text-2);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.note-empty-title,
.note-empty-hint {
	display: block;
	color: var(--np-text-2);
	line-height: 1.7;
}

.note-empty-title {
	font-size: 14px;
	font-weight: 500;
}

.note-empty-hint {
	margin-top: 4px;
	font-size: 12px;
}

.note-area {
	width: 100%;
	height: 160px;
	background-color: var(--np-surface-2);
	border: 1px solid var(--np-border);
	border-radius: 10px;
	padding: 14px 16px;
	font-size: calc(14px * var(--np-fs-scale, 1));
	line-height: 1.8;
	color: var(--np-text);
	box-sizing: border-box;
}

.note-area:focus-within {
	border-color: var(--np-primary);
}

.note-editor-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-top: 8px;
	font-size: 12px;
	line-height: 1.6;
	color: var(--np-text-2);
}

.note-count {
	flex-shrink: 0;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.note-actions {
	display: flex;
	margin-top: 16px;
}

.note-btn {
	width: 100%;
	min-height: 48px;
	font-size: 15px;
	padding: 12px 16px;
	border-radius: 10px;
}

.tail-pad {
	height: 40rpx;
}

.empty {
	margin-top: 160rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.empty-title {
	font-size: 32rpx;
	font-weight: 600;
	color: var(--np-text);
}

.empty-desc {
	font-size: 25rpx;
	color: var(--np-text-2);
	text-align: center;
	line-height: 1.7;
	margin-top: 16rpx;
	padding: 0 40rpx;
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
	flex: 1.2;
}

.bottom-primary-text {
	color: #ffffff;
	font-weight: 600;
}

.bottom-disabled {
	opacity: 0.4;
}
</style>
