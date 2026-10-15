<template>
	<view class="np-page" :class="[theme, fontClass]">
		<app-header :title="modeLabel" :subtitle="subtitle" show-back :right-text="favorite ? '已收藏' : '收藏'"
			@right="toggleFav" />

		<scroll-view class="scroll" scroll-y :scroll-top="scrollTop">
			<view class="wrap">
				<template v-if="question">
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
					<view v-if="revealed" class="np-card-flat analysis">
						<view class="analysis-head" @tap="toggleExplanation">
							<text class="analysis-title">试题详解</text>
							<text class="analysis-toggle">{{ explanationOpen ? '收起' : '展开' }}</text>
						</view>
						<template v-if="explanationOpen">
							<text class="analysis-body">{{ question.explanation || '题库中本题暂无经核验的解析。' }}</text>
							<template v-if="question.law">
								<view class="np-divider analysis-divider"></view>
								<text class="analysis-title">相关法规条文</text>
								<text class="analysis-body">{{ question.law }}</text>
							</template>
							<view class="np-divider analysis-divider"></view>
							<text class="analysis-src">
								题源：{{ question.source.file }} · {{ question.source.location }}
							</text>
						</template>
					</view>

					<!-- 笔记 -->
					<view class="np-card-flat note-card">
						<view class="analysis-head" @tap="toggleNote">
							<text class="analysis-title">我的笔记</text>
							<text class="analysis-toggle">{{ noteEditing ? '收起' : note ? '编辑' : '添加' }}</text>
						</view>
						<template v-if="noteEditing">
							<textarea v-model="noteText" class="note-area" placeholder="记录错因、易混点（保存在本机，不上传）"
								:maxlength="2000" @focus="onFocus" @blur="onBlur" />
							<view class="note-actions">
								<view class="np-btn np-btn-plain note-btn" @tap="saveNote"><text>保存笔记</text>
								</view>
							</view>
						</template>
						<template v-else>
							<text v-if="note" class="analysis-body">{{ note }}</text>
							<text v-else class="analysis-empty">暂无笔记</text>
						</template>
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
	</view>
</template>

<script>
import store from '../../core/store.js'
import AppHeader from '../../components/AppHeader.vue'
import QuestionCard from '../../components/QuestionCard.vue'
import AnswerOption from '../../components/AnswerOption.vue'
import QuestionNavigator from '../../components/QuestionNavigator.vue'
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
		QuestionNavigator
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
		this.persistCursor()
	},
	onShow() {
		this.noteText = this.note
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
		toggleExplanation() {
			this.cancelAutoNext();
			this.explanationOpen = !this.explanationOpen
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

.analysis,
.note-card {
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

.analysis-empty {
	display: block;
	font-size: 24rpx;
	color: var(--np-text-3);
	margin-top: 12rpx;
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

.note-area {
	width: 100%;
	height: 200rpx;
	background-color: var(--np-surface-2);
	border-radius: 16rpx;
	margin-top: 16rpx;
	padding: 20rpx;
	font-size: calc(14px * var(--np-fs-scale, 1));
	color: var(--np-text);
	box-sizing: border-box;
}

.note-actions {
	display: flex;
	justify-content: flex-end;
	margin-top: 16rpx;
}

.note-btn {
	height: 72rpx;
	font-size: 26rpx;
	padding: 0 32rpx;
	border-radius: 16rpx;
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
