<template>
	<view class="np-page" :class="theme">
		<app-header title="设置" show-logo />
		<view class="np-content">
			<view class="np-card np-section overview">
				<view class="np-section-heading"><text class="np-section-title">学习总览</text><text
						class="local-badge">✓ 数据保存在本机</text></view>
				<view class="overview-grid">
					<view class="overview-tile"><text class="np-caption">已做不同题目</text><text
							class="overview-value np-number">{{summary.done}}<text> / {{summary.total}}
								题</text></text></view>
					<view class="overview-tile correct"><text class="np-caption">累计作答正确率</text><text
							class="overview-value np-number">{{accuracy}}<text
								v-if="summary.attempts">%</text></text></view>
					<view class="overview-tile wrong"><text class="np-caption">当前错题待复习</text><text
							class="overview-value np-number">{{summary.mistakes}}<text> 题</text></text></view>
					<view class="overview-tile caution"><text class="np-caption">重点收藏</text><text
							class="overview-value np-number">{{summary.favorites}}<text> 题</text></text>
					</view>
				</view>
				<view class="overview-foot"><text>笔记 {{summary.notes}} 条 · 模拟考试 {{summary.exams}}
						次</text><text>最近学习：{{summary.lastStudyAt ? dateText(summary.lastStudyAt) : '暂无记录'}}</text>
				</view>
				<text class="metric-note">正确率按累计作答次数计算；已做题目按不同题目去重。</text>
			</view>
			<view class="np-card np-section">
				<text class="np-section-title">外观与显示</text>
				<view class="setting-row">
					<view class="setting-label"><text>界面主题</text><text class="np-caption">适合当前阅读环境</text>
					</view><segmented-control :model-value="settings.appearance" :options="appearanceOptions"
						label="界面主题" @update:model-value="patch({appearance:$event})" />
				</view>
				<view class="np-divider" />
				<view class="setting-row">
					<view class="setting-label"><text>阅读字号</text><text class="np-caption">题干、选项、解析与笔记</text>
					</view><segmented-control :model-value="settings.fontScale" :options="fontOptions"
						label="阅读字号" @update:model-value="patch({fontScale:$event})" />
				</view>
				<view class="reading-sample">阅读预览：核药学与放射药剂学</view>
			</view>
			<view class="np-card np-section">
				<text class="np-section-title">答题偏好</text>
				<view class="setting-row">
					<view class="setting-label"><text>答对自动下一题</text><text
							class="np-caption">手动查看解析、笔记时会暂停跳题</text></view>
					<switch :checked="settings.autoNext"
						:color="settings.appearance === 'dark' ? '#4FB99F' : '#1A6B5A'"
						@change="patch({autoNext:$event.detail.value})" />
				</view>
				<view class="np-divider" />
				<view class="setting-block">
					<view class="setting-block-head"><text>解析展示方式</text><text class="np-caption">仅用于练习</text>
					</view><segmented-control :model-value="settings.showExplanation"
						:options="explanationOptions" label="解析展示方式"
						@update:model-value="patch({showExplanation:$event})" />
				</view>
			</view>
			<view class="np-card np-section">
				<view class="np-section-heading"><text class="np-section-title">模拟考试</text><text
						class="np-caption">新试卷默认时长</text></view>
				<segmented-control :model-value="settings.examMinutes" :options="minuteOptions" label="考试默认时长"
					@update:model-value="patch({examMinutes:$event})" />
				<text class="metric-note">修改仅影响新试卷，已开始考试的截止时间保持不变。</text>
			</view>
			<view class="np-card np-section data-card">
				<view class="np-section-heading"><text class="np-section-title">数据管理与备份</text><text
						class="local-badge">本地</text></view>
				<view class="storage-box">
					<view class="storage-head"><text>本地进度存储占用</text><text>{{storageText}}</text></view><text
						class="np-caption">{{storage.platform === 'h5' ? '按浏览器存储估算，实际容量取决于浏览器。' : '使用设备本地存储；不设统一 5MB 上限。'}}</text><text
						v-if="storage.warn" class="storage-warning">存储占用较高，建议先导出备份。</text>
				</view>
				<button class="setting-entry" @tap="exportProgress">
					<view class="entry-icon">↑</view>
					<view class="setting-label"><text>导出学习进度</text><text
							class="np-caption">{{exportHint}}</text></view><text class="np-arrow">›</text>
				</button>
				<button class="setting-entry" @tap="exportClipboard">
					<view class="entry-icon">⧉</view>
					<view class="setting-label"><text>复制进度到剪贴板</text><text class="np-caption">复制 JSON
							文本，自行保存备份</text></view><text class="np-arrow">›</text>
				</button>
				<button class="setting-entry" @tap="askImport">
					<view class="entry-icon blue">↓</view>
					<view class="setting-label"><text>导入进度备份</text><text
							class="np-caption">先校验与预览，再合并现有数据</text></view><text class="np-arrow">›</text>
				</button>
			</view>
			<view class="np-card np-section cleanup-card">
				<text class="np-section-title">清理操作</text>
				<button class="setting-entry" @tap="clearVisible=true">
					<view class="setting-label"><text>清理考试历史</text><text
							class="np-caption">保留当前考试、作答历史、错题、收藏与笔记</text></view><text
						class="np-arrow">›</text>
				</button>
				<view class="danger-box"><text class="danger-title">清除全部学习进度</text><text
						class="np-caption">删除作答、错题、笔记、收藏、练习游标、考试历史及未完成考试。保留外观与答题偏好。</text><button
						class="np-btn danger-btn" @tap="resetVisible=true">清除全部学习进度</button></view>
			</view>
			<view class="np-card np-section about-card">
				<text class="np-section-title">题库与关于</text>
				<view class="about-row">
					<text>应用版本</text><text>v{{appInfo.version}}（{{appInfo.versionCode}}）</text></view>
				<view class="about-row"><text>题库版本</text><text>v{{bank.version}} · {{bank.total}} 题</text>
				</view>
				<view class="bank-tags"><text class="np-tag np-tag-single">单选
						{{bank.counts.single}}</text><text class="np-tag np-tag-multiple">多选
						{{bank.counts.multiple}}</text><text class="np-tag np-tag-boolean">判断
						{{bank.counts.boolean}}</text></view>
				<view class="about-row"><text>数据自检</text><button class="np-link validation-button"
						:class="validation.ok ? 'valid' : 'invalid'"
						@tap="runValidation">{{validation.ok ? '✓ 结构自检通过' : '自检失败 · 查看'}}</button></view>
				<text
					class="source-description">题库来自用户提供的放射药学学习资料，原题、答案、解析与法规条文随题离线保存。结构自检不代表专业内容经权威认证。</text>
				<button class="np-link issue-toggle"
					@tap="issuesOpen=!issuesOpen">{{issuesOpen ? '收起' : '查看'}}题库已知问题（{{knownIssues.length}}）</button>
				<view v-if="issuesOpen" class="issue-list"><text v-for="(issue,i) in knownIssues" :key="i">·
						{{issue}}</text><text v-if="!knownIssues.length">当前元数据中无已登记问题。</text></view>
				<button class="np-link" @tap="restoreDefaults">恢复默认设置</button>
			</view>
			<text class="disclaimer">核药通为离线学习与自测工具，题目与解析仅供学习交流，不作为临床、药学或辐射防护执业依据；模拟考试不属于官方认证考试。</text>
			<view :style="{height:tabPad + 'px'}" />
		</view>
		<confirm-dialog :visible="importVisible" title="合并备份？" :content="importPreview" confirm-text="确认合并"
			@confirm="applyImport" @cancel="cancelImport" />
		<confirm-dialog :visible="clearVisible" title="清理考试历史？"
			content="删除历史成绩及其复盘快照。保留未完成考试、作答记录、错题、收藏与笔记。建议先导出备份。" confirm-text="确认清理" @confirm="clearExams"
			@cancel="clearVisible=false" />
		<confirm-dialog :visible="resetVisible" title="清除全部学习进度？"
			content="作答、错题、收藏、笔记、练习游标、考试历史及未完成考试将永久删除，仅保留设置。此操作不可撤销，请先导出备份。" confirm-text="确认清除"
			@confirm="doReset" @cancel="resetVisible=false" />
		<view v-if="pasteVisible" class="paste-mask">
			<view class="paste-box"><text class="np-section-title">粘贴进度备份内容</text><textarea
					v-model="pasteText" class="paste-area" placeholder="粘贴导出的 JSON 内容" :maxlength="-1"
					@focus="onFocus" @blur="onBlur" />
				<view class="paste-actions"><button class="np-btn np-btn-plain"
						@tap="pasteVisible=false">取消</button><button class="np-btn np-btn-primary"
						@tap="previewPaste">校验并预览</button></view>
			</view>
		</view>
	</view>
</template>
<script>
import store from '../../core/store.js'
import AppHeader from '../../components/AppHeader.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import SegmentedControl from '../../components/SegmentedControl.vue'
import {
	bankSummary,
	validateBank,
	getMeta
} from '../../core/bank-service.js'
import {
	exportProgress,
	exportToClipboard,
	pickBackupText,
	readClipboardText
} from '../../core/storage.js'
import {
	rememberScrollForKeyboard,
	restoreScrollAfterKeyboard,
	isH5,
	tabBarPadBottom
} from '../../core/platform.js'
import {
	formatDateTime
} from '../../core/format.js'
import appInfo from '../../core/app-info.js'
export default {
	components: {
		AppHeader,
		ConfirmDialog,
		SegmentedControl
	},
	data: () => ({
		summary: store.summary(),
		settings: {
			...store.state.settings
		},
		bank: bankSummary(),
		validation: validateBank(),
		storage: store.refreshStorageInfo(),
		appInfo,
		tabPad: tabBarPadBottom(),
		issuesOpen: false,
		importVisible: false,
		clearVisible: false,
		resetVisible: false,
		pasteVisible: false,
		pasteText: '',
		pendingText: '',
		importPreview: '',
		importing: false,
		appearanceOptions: [{
			label: '浅色',
			value: 'light'
		}, {
			label: '深色',
			value: 'dark'
		}],
		fontOptions: [{
			label: '小',
			value: 'small'
		}, {
			label: '标准',
			value: 'normal'
		}, {
			label: '大',
			value: 'large'
		}],
		explanationOptions: [{
			label: '立即展示',
			value: 'immediate'
		}, {
			label: '手动展开',
			value: 'afterSubmit'
		}],
		minuteOptions: [30, 45, 60, 90].map(value => ({
			label: value + ' 分',
			value
		}))
	}),
	computed: {
		theme: () => store.themeClass(),
		accuracy() {
			return this.summary.attempts ? (this.summary.accuracy * 100).toFixed(1) : '—'
		},
		exportHint() {
			return isH5() ? '下载包含设置与学习记录的 JSON 文件' : '复制 JSON 备份，自行保存到文件或备忘录'
		},
		storageText() {
			return this.storage.measured === false ? '平台未提供计量' : (this.storage.bytes / 1024 / 1024).toFixed(
				2) + ' MB'
		},
		knownIssues() {
			const meta = getMeta();
			const rows = Object.entries(meta.anomalies || {}).map(([kind, value]) =>
				`${kind}：${value.count} 处`);
			for (const item of meta.needsReview || []) rows.push(`${item.id}：${item.note}`);
			return rows
		}
	},
	onShow() {
		this.refresh();
		store.touchResume()
	},
	methods: {
		dateText: formatDateTime,
		onFocus: rememberScrollForKeyboard,
		onBlur: restoreScrollAfterKeyboard,
		refresh() {
			this.summary = store.summary();
			this.settings = {
				...store.state.settings
			};
			this.storage = store.refreshStorageInfo();
			this.validation = validateBank()
		},
		patch(value) {
			store.setSettings(value);
			this.settings = {
				...store.state.settings
			}
		},
		async exportProgress() {
			const res = await exportProgress(store.exportPayload());
			uni.showModal({
				title: res.ok ? res.mode === 'download' ? '已开始下载' : '已复制到剪贴板' : '导出失败',
				content: res.ok ? res.mode === 'download' ?
					`文件名：${res.fileName}。请妥善保存，此备份含个人笔记与学习记录。` : '请将 JSON 内容粘贴到文件或备忘录中保存。' : res
					.error || '请使用复制进度到剪贴板重试。',
				showCancel: false
			})
		},
		async exportClipboard() {
			const res = await exportToClipboard(store.exportPayload());
			uni.showToast({
				title: res.ok ? '已复制到剪贴板' : res.error || '复制失败',
				icon: 'none'
			})
		},
		askImport() {
			const items = isH5() ? ['选择 JSON 文件', '从剪贴板读取', '手动粘贴'] : ['从剪贴板读取', '手动粘贴'];
			uni.showActionSheet({
				itemList: items,
				success: async res => {
					const choice = items[res.tapIndex];
					if (choice === '手动粘贴') {
						this.pasteText = '';
						this.pasteVisible = true;
						return
					}
					const result = await (choice === '选择 JSON 文件' ? pickBackupText() :
						readClipboardText());
					if (result.cancelled) return
					if (result.ok) this.prepareImport(result.text);
					else uni.showModal({
						title: '无法读取备份',
						content: result.error || '请改用手动粘贴',
						showCancel: false
					})
				}
			})
		},
		previewPaste() {
			if (this.prepareImport(this.pasteText)) this.pasteVisible = false
		},
		prepareImport(text) {
			const result = store.previewImport(text);
			if (!result.ok) {
				uni.showModal({
					title: '备份校验失败',
					content: result.error,
					showCancel: false
				});
				return false
			}
			const p = result.preview;
			this.pendingText = text;
			this.importPreview =
				`备份包含作答 ${p.answers} 题、错题 ${p.mistakes} 题、笔记 ${p.notes} 条、收藏 ${p.favorites} 题、考试 ${p.exams} 次。合并保留较完整记录；本机正在进行的考试优先。确认后保存。`;
			this.importVisible = true;
			return true
		},
		cancelImport() {
			this.importVisible = false;
			this.pendingText = ''
		},
		applyImport() {
			if (this.importing) return;
			this.importing = true;
			const result = store.importProgress(this.pendingText, 'merge');
			this.importing = false;
			if (!result.ok) {
				uni.showModal({
					title: '导入失败',
					content: result.error,
					showCancel: false
				});
				return
			}
			this.cancelImport();
			this.refresh();
			uni.showModal({
				title: '合并完成',
				content: `新增作答 ${result.stats.answers} 题、错题 ${result.stats.mistakes} 题、笔记 ${result.stats.notes} 条、收藏 ${result.stats.favorites} 题、考试 ${result.stats.exams} 次。重复导入不会重复累计。`,
				showCancel: false
			})
		},
		clearExams() {
			store.clearExamData();
			this.clearVisible = false;
			this.refresh();
			uni.showToast({
				title: '已清理考试历史',
				icon: 'none'
			})
		},
		doReset() {
			store.resetAll();
			this.resetVisible = false;
			this.refresh();
			uni.showToast({
				title: '已清除学习进度',
				icon: 'none'
			})
		},
		runValidation() {
			this.validation = validateBank();
			uni.showModal({
				title: this.validation.ok ? '结构自检通过' : '题库自检失败',
				content: this.validation.ok ? '题量、题型、唯一 ID、选项、答案、题源和考试库一致性检查通过。专业内容仍需参考权威资料。' : this
					.validation.errors.join('；'),
				showCancel: false
			})
		},
		restoreDefaults() {
			uni.showModal({
				title: '恢复默认设置？',
				content: '恢复浅色、标准字号、自动下一题、立即解析与60分钟新卷；学习记录保留。',
				success: r => {
					if (r.confirm) {
						store.resetSettings();
						store.touchResume();
						this.refresh()
					}
				}
			})
		}
	}
}
</script>
<style scoped>
.local-badge {
	background: var(--np-surface-2);
	border-radius: 12px;
	padding: 3px 7px;
	color: var(--np-text-2);
	font-size: 10px;
	white-space: nowrap
}

.overview-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px
}

.overview-tile {
	padding: 12px;
	border-radius: 9px;
	background: var(--np-primary-soft);
	color: var(--np-primary);
	display: flex;
	flex-direction: column
}

.overview-value {
	font-size: 29px;
	font-weight: 700;
	line-height: 1.4;
	margin-top: 4px
}

.overview-value text {
	font-size: 11px;
	font-weight: 400;
	color: var(--np-text-2)
}

.correct {
	background: var(--np-correct-soft);
	color: var(--np-correct)
}

.wrong {
	background: var(--np-wrong-soft);
	color: var(--np-wrong)
}

.caution {
	background: var(--np-caution-soft);
	color: var(--np-caution)
}

.overview-foot {
	padding: 10px;
	margin-top: 10px;
	border-radius: 7px;
	background: var(--np-surface-2);
	display: flex;
	flex-direction: column;
	gap: 4px;
	color: var(--np-text-2);
	font-size: 11px
}

.metric-note {
	display: block;
	margin-top: 10px;
	font-size: 11px;
	line-height: 1.7;
	color: var(--np-text-2)
}

.setting-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 16px 0
}

.setting-row .segmented {
	width: 158px;
	flex-shrink: 0
}

.setting-label {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 14px;
	color: var(--np-text);
	line-height: 1.5
}

.setting-label>.np-caption {
	font-size: 11px
}

.setting-block {
	padding: 16px 0 0
}

.setting-block-head {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 14px;
	color: var(--np-text);
	margin-bottom: 12px
}

.reading-sample {
	padding: 10px;
	background: var(--np-primary-soft);
	color: var(--np-primary);
	font-size: calc(14px * var(--np-fs-scale, 1));
	border-radius: 7px;
	line-height: 1.7
}

.storage-box {
	background: var(--np-surface-2);
	border-radius: 9px;
	padding: 12px;
	margin: 14px 0 4px
}

.storage-head {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 12px;
	color: var(--np-text);
	margin-bottom: 6px
}

.storage-head>text:last-child {
	color: var(--np-primary);
	font-weight: 600
}

.storage-warning {
	display: block;
	font-size: 12px;
	color: var(--np-caution);
	margin-top: 6px
}

.setting-entry {
	background: transparent;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 16px 0;
	margin: 0;
	width: 100%;
	text-align: left;
	line-height: 1.5;
	border-bottom: 1px solid var(--np-border)
}

.setting-entry:last-child {
	border: 0
}

.entry-icon {
	width: 34px;
	height: 34px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 22px;
	border-radius: 8px;
	background: var(--np-primary-soft);
	color: var(--np-primary);
	flex-shrink: 0
}

.entry-icon.blue {
	background: var(--np-accent-soft);
	color: var(--np-accent)
}

.danger-box {
	display: flex;
	flex-direction: column;
	gap: 8px;
	background: var(--np-wrong-soft);
	padding: 12px;
	border-radius: 9px;
	margin-top: 14px
}

.danger-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--np-wrong)
}

.danger-btn {
	margin-top: 6px;
	background: #b72f36;
	color: white;
	font-size: 14px
}

.about-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 14px 0;
	border-bottom: 1px solid var(--np-border);
	font-size: 12px;
	color: var(--np-text-2)
}

.about-row>text:last-child {
	text-align: right;
	color: var(--np-text)
}

.bank-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding: 12px 0 0
}

.valid {
	color: var(--np-correct)
}

.invalid {
	color: var(--np-wrong)
}

.validation-button {
	font-size: 12px;
	min-height: 44px;
	padding: 4px
}

.source-description {
	display: block;
	font-size: 12px;
	color: var(--np-text-2);
	line-height: 1.8;
	margin-top: 14px
}

.issue-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	font-size: 12px;
	color: var(--np-text-2);
	padding: 10px;
	border-radius: 8px;
	background: var(--np-surface-2)
}

.disclaimer {
	display: block;
	font-size: 11px;
	line-height: 1.8;
	color: var(--np-text-2);
	text-align: center;
	margin: 24px 8px
}

.paste-mask {
	position: fixed;
	inset: 0;
	background: rgba(15, 23, 32, .55);
	z-index: 960;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20px;
	box-sizing: border-box
}

.paste-box {
	width: 100%;
	max-width: 480px;
	box-sizing: border-box;
	border-radius: 16px;
	padding: 20px;
	background: var(--np-surface)
}

.paste-area {
	width: 100%;
	height: 220px;
	box-sizing: border-box;
	background: var(--np-surface-2);
	color: var(--np-text);
	font-size: 13px;
	line-height: 1.7;
	border-radius: 8px;
	padding: 12px;
	margin: 16px 0
}

.paste-actions {
	display: flex;
	gap: 10px
}

.paste-actions button {
	flex: 1;
	font-size: 14px
}

@media(max-width:350px) {
	.setting-row {
		flex-wrap: wrap
	}

	.setting-row .segmented {
		width: 100%
	}

	.local-badge {
		font-size: 9px
	}

	.overview-value {
		font-size: 26px
	}
}
</style>
