<template>
	<view class="np-page" :class="theme">
		<app-header title="错题" show-logo :right-text="ids.length ? '管理' : ''" @right="askClear" />
		<view class="np-content">
			<view class="np-section-heading"><text class="np-section-title">错题本</text><text
					class="np-caption">{{ids.length}} 道题待复习</text></view>
			<view class="mistake-tiles"><stat-tile label="当前待复习" :value="String(ids.length)"
					tone="wrong" /><stat-tile label="涉及题型" :value="String(typeCount)" /><stat-tile
					label="含笔记题目" :value="String(noteCount)" tone="caution" /></view>
			<button class="np-btn np-btn-primary start-btn" :disabled="!list.length"
				@tap="startPractice">开始错题练习（{{list.length}} 题）</button>
			<type-filter v-model="type" :items="typeChips" />
			<template v-if="list.length">
				<view v-for="item in list" :key="item.id" class="np-card np-section wrong-item" role="button"
					:aria-label="'练习错题 '+item.id" @tap="openDetail(item)">
					<view class="wrong-head"><text class="np-tag"
							:class="item.tagClass">{{item.qtype}}</text><text class="wrong-times">错
							{{item.times}} 次</text><text v-if="item.hasNote" class="wrong-note">有笔记</text>
					</view>
					<text class="wrong-stem">{{item.stem}}</text>
					<view class="wrong-foot"><button class="answer-toggle"
							@tap.stop="toggleAnswer(item.id)">{{expanded[item.id] ? '收起答案' : '查看正确答案'}}</button><text
							v-if="expanded[item.id]" class="wrong-answer">正确答案：{{item.answerText}}</text><text
							class="wrong-source">题源：{{item.source}}</text></view>
				</view>
				<text class="review-note">在练习中再次答对后自动移出错题本。笔记、收藏与作答历史独立保留。</text>
			</template>
			<empty-state v-else :title="ids.length ? '当前题型暂无错题' : '暂时没有待复习错题'"
				description="练习或考试中答错的题会收进错题本，复习答对后自动移出。保持练习，慢慢巩固。" action="去练习" @action="goStudy" />
			<view :style="{height:tabPad + 'px'}" />
		</view>
		<confirm-dialog :visible="confirmVisible" title="清空错题本？"
			content="仅清空当前错题集合，不影响作答历史、笔记、收藏和考试成绩。清空后不可恢复，建议先备份。" confirm-text="清空" @confirm="clearAll"
			@cancel="confirmVisible=false" />
	</view>
</template>
<script>
import store from '../../core/store.js'
import AppHeader from '../../components/AppHeader.vue'
import StatTile from '../../components/StatTile.vue'
import TypeFilter from '../../components/TypeFilter.vue'
import EmptyState from '../../components/EmptyState.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import {
	TYPE_LABEL
} from '../../core/constants.js'
import {
	getQuestions
} from '../../core/bank-service.js'
import {
	answerText
} from '../../core/format.js'
import {
	tabBarPadBottom
} from '../../core/platform.js'
export default {
	components: {
		AppHeader,
		StatTile,
		TypeFilter,
		EmptyState,
		ConfirmDialog
	},
	data: () => ({
		type: 'all',
		ids: [],
		confirmVisible: false,
		expanded: {},
		tabPad: tabBarPadBottom()
	}),
	computed: {
		theme: () => store.themeClass(),
		questions() {
			return getQuestions(this.ids).sort((a, b) => (store.state.mistakes[b.id]?.ts || 0) - (store.state
				.mistakes[a.id]?.ts || 0))
		},
		list() {
			return this.questions.filter(q => this.type === 'all' || q.type === this.type).map(q => ({
				id: q.id,
				qtype: TYPE_LABEL[q.type],
				stem: q.stem,
				times: store.state.mistakes[q.id]?.n || 1,
				hasNote: !!store.noteOf(q.id),
				answerText: answerText(q.answer),
				source: q.source?.location ? TYPE_LABEL[q.type] + ' ' + q.source.location : '暂无来源信息',
				tagClass: 'np-tag-' + q.type
			}))
		},
		typeChips() {
			return ['all', 'single', 'multiple', 'boolean'].map(value => ({
				value,
				label: value === 'all' ? '全部' : TYPE_LABEL[value],
				count: value === 'all' ? this.ids.length : this.questions.filter(q => q.type ===
					value).length
			}))
		},
		typeCount() {
			return new Set(this.questions.map(q => q.type)).size
		},
		noteCount() {
			return this.questions.filter(q => !!store.noteOf(q.id)).length
		}
	},
	onShow() {
		this.ids = store.mistakeIds();
		store.touchResume()
	},
	methods: {
		toggleAnswer(id) {
			this.expanded = {
				...this.expanded,
				[id]: !this.expanded[id]
			}
		},
		startPractice() {
			if (this.list.length) uni.navigateTo({
				url: `/pages/question/index?mode=mistakes&type=${this.type}&fresh=1`
			})
		},
		openDetail(item) {
			uni.navigateTo({
				url: `/pages/question/index?mode=mistakes&type=${this.type}&id=${item.id}&fresh=1`
			})
		},
		askClear() {
			if (this.ids.length) this.confirmVisible = true
		},
		clearAll() {
			store.clearMistakes();
			this.ids = store.mistakeIds();
			this.confirmVisible = false;
			this.expanded = {};
			uni.showToast({
				title: '已清空错题本',
				icon: 'none'
			})
		},
		goStudy() {
			uni.switchTab({
				url: '/pages/study/index'
			})
		}
	}
}
</script>
<style scoped>
.mistake-tiles {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px
}

.start-btn {
	width: 100%;
	margin: 16px 0
}

.wrong-head {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap
}

.wrong-times {
	font-size: 12px;
	color: var(--np-wrong);
	padding: 2px 7px;
	background: var(--np-wrong-soft);
	border-radius: 5px
}

.wrong-note {
	color: var(--np-caution);
	font-size: 11px
}

.wrong-stem {
	display: block;
	font-size: calc(16px * var(--np-fs-scale, 1));
	line-height: 1.8;
	color: var(--np-text);
	font-weight: 500;
	margin: 14px 0
}

.wrong-foot {
	border-radius: 8px;
	background: var(--np-surface-2);
	padding: 2px 12px 12px
}

.answer-toggle {
	font-size: 12px;
	color: var(--np-primary);
	background: transparent;
	min-height: 44px;
	display: flex;
	align-items: center;
	text-align: left;
	padding: 0;
	margin: 0;
	line-height: 1.5
}

.wrong-answer {
	display: block;
	color: var(--np-correct);
	font-size: 13px;
	margin-bottom: 8px
}

.wrong-source {
	display: block;
	color: var(--np-text-2);
	font-size: 11px;
	line-height: 1.7;
	overflow-wrap: anywhere
}

.review-note {
	display: block;
	font-size: 12px;
	line-height: 1.7;
	color: var(--np-text-2);
	text-align: center;
	margin: 20px 0
}
</style>
