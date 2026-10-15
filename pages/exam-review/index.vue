<template>
	<view class="np-page" :class="[theme, fontClass]">
		<app-header title="试卷复盘" :subtitle="headerSub" show-back />

		<view class="filter-bar">
			<view v-for="chip in filterChips" :key="chip.value" class="chip"
				:class="{ 'chip-active': filter === chip.value }" @tap="filter = chip.value">
				<text>{{ chip.label }}（{{ chip.count }}）</text>
			</view>
		</view>

		<scroll-view class="scroll" scroll-y>
			<view class="wrap">
				<template v-if="items.length">
					<view v-for="item in items" :key="item.id" class="np-card-flat review-item">
						<view class="item-head">
							<text class="item-no">第 {{ item.index + 1 }} 题</text>
							<view class="np-tag" :class="item.tagClass"><text>{{ item.qtype }}</text></view>
							<view class="spacer"></view>
							<text class="item-state" :class="item.correct ? 'state-ok' : 'state-bad'">
								{{ item.correct ? '✓ 正确' : '✗ 错误' }}
							</text>
						</view>
						<text class="item-stem">{{ item.stem }}</text>

						<view class="options">
							<answer-option v-for="opt in item.question.options" :key="opt.key" :option="opt"
								:selected="item.chosen.includes(opt.key)" :revealed="true"
								:is-answer="item.answerKeys.includes(opt.key)" disabled />
						</view>

						<view class="answer-line">
							<text class="answer-own">你的选择：{{ item.chosenText }}</text>
							<text class="answer-right">正确答案：{{ item.answerText }}</text>
						</view>

						<view class="explain-head" @tap="toggle(item.id)">
							<text class="explain-title">试题详解</text>
							<text class="explain-toggle">{{ expanded[item.id] ? '收起' : '展开' }}</text>
						</view>
						<template v-if="expanded[item.id]">
							<text class="explain-body">{{ item.explanation || '题库中本题暂无经核验的解析。' }}</text>
							<template v-if="item.law">
								<view class="np-divider explain-divider"></view>
								<text class="explain-title">相关法规条文</text>
								<text class="explain-body">{{ item.law }}</text>
							</template>
							<text class="explain-src">题源：{{ item.source }}</text>
						</template>
					</view>
				</template>
				<view v-else class="empty">
					<text class="empty-title">没有符合条件的题目</text>
				</view>
				<view class="tail-pad"></view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
import store from '../../core/store.js'
import AppHeader from '../../components/AppHeader.vue'
import AnswerOption from '../../components/AnswerOption.vue'
import {
	TYPE_LABEL
} from '../../core/constants.js'
import {
	getQuestion
} from '../../core/bank-service.js'
import {
	answerText
} from '../../core/format.js'

export default {
	components: {
		AppHeader,
		AnswerOption
	},
	data() {
		return {
			sessionId: '',
			snapshot: null,
			filter: 'all',
			expanded: {}
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
		headerSub() {
			if (!this.snapshot) return ''
			const r = this.snapshot.result
			return `得分 ${r.score} / ${r.totalPoints} · 正确 ${r.correctCount} / ${r.totalQuestions}`
		},
		allItems() {
			if (!this.snapshot) return []
			return this.snapshot.paperIds.map((id, index) => {
				const question = this.snapshot.paperSnapshot?.find(q => q.id === id) || getQuestion(
					id)
				const detail = (this.snapshot.result.details || []).find((d) => d.id === id)
				const chosen = (detail && detail.chosen) || this.snapshot.answers[id] || []
				const correct = detail ? detail.correct : false
				return {
					id,
					index,
					question,
					qtype: question ? TYPE_LABEL[question.type] : '',
					stem: question ? question.stem : '',
					chosen,
					chosenText: chosen.length ? answerText(chosen) : '未作答',
					answerKeys: question ? question.answer : [],
					answerText: question ? answerText(question.answer) : '',
					correct,
					explanation: question ? question.explanation : '',
					law: question ? question.law : '',
					source: question && question.source ? question.source.file + ' · ' + question
						.source.location : '',
					tagClass: question ?
						question.type === 'multiple' ?
						'np-tag-multiple' :
						question.type === 'boolean' ?
						'np-tag-boolean' :
						'np-tag-single' :
						'np-tag-single'
				}
			})
		},
		items() {
			if (this.filter === 'wrong') return this.allItems.filter((it) => !it.correct)
			return this.allItems
		},
		filterChips() {
			const wrong = this.allItems.filter((it) => !it.correct).length
			return [{
					label: '全部',
					value: 'all',
					count: this.allItems.length
				},
				{
					label: '只看错题',
					value: 'wrong',
					count: wrong
				}
			]
		}
	},
	onLoad(options) {
		this.sessionId = options.sessionId || ''
		this.snapshot = store.examSnapshot(this.sessionId)
		if (!this.snapshot) {
			uni.showModal({
				title: '无法复盘',
				content: '本场考试的逐题解析已不在本机，仅保留了成绩概要。',
				showCancel: false
			})
		}
	},
	methods: {
		toggle(id) {
			this.expanded = {
				...this.expanded,
				[id]: !this.expanded[id]
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.filter-bar {
	display: flex;
	padding: 8rpx 32rpx 16rpx;
	background-color: var(--np-canvas);
}

.chip {
	padding: 10rpx 24rpx;
	border-radius: 999rpx;
	background-color: var(--np-surface);
	border: 2rpx solid var(--np-border);
	margin-right: 16rpx;
}

.chip text {
	font-size: 24rpx;
	color: var(--np-text-2);
}

.chip-active {
	background-color: var(--np-primary-soft);
	border-color: var(--np-primary);
}

.chip-active text {
	color: var(--np-primary);
	font-weight: 600;
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
	padding: 0 32rpx;
}

.review-item {
	padding: 24rpx;
	margin-bottom: 20rpx;
}

.item-head {
	display: flex;
	align-items: center;
}

.item-no {
	font-size: 24rpx;
	color: var(--np-text-3);
	margin-right: 14rpx;
}

.spacer {
	flex: 1;
}

.item-state {
	font-size: 24rpx;
	font-weight: 600;
}

.state-ok {
	color: var(--np-correct);
}

.state-bad {
	color: var(--np-wrong);
}

.item-stem {
	display: block;
	font-size: calc(29rpx * var(--np-fs-scale, 1));
	line-height: 1.7;
	color: var(--np-text);
	margin-top: 16rpx;
}

.options {
	margin-top: 20rpx;
}

.answer-line {
	display: flex;
	justify-content: space-between;
	margin-top: 4rpx;
}

.answer-own {
	font-size: 23rpx;
	color: var(--np-text-3);
}

.answer-right {
	font-size: 23rpx;
	color: var(--np-correct);
	font-weight: 600;
}

.explain-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 20rpx;
}

.explain-title {
	font-size: 26rpx;
	font-weight: 600;
	color: var(--np-text);
}

.explain-toggle {
	font-size: 23rpx;
	color: var(--np-primary);
}

.explain-body {
	display: block;
	font-size: calc(25rpx * var(--np-fs-scale, 1));
	color: var(--np-text-2);
	line-height: 1.8;
	margin-top: 12rpx;
}

.explain-divider {
	margin: 18rpx 0 10rpx;
}

.explain-src {
	display: block;
	font-size: 21rpx;
	color: var(--np-text-3);
	margin-top: 12rpx;
}

.empty {
	margin-top: 160rpx;
	display: flex;
	justify-content: center;
}

.empty-title {
	font-size: 28rpx;
	color: var(--np-text-2);
}

.tail-pad {
	height: 60rpx;
}
</style>
