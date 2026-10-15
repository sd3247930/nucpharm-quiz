<template>
	<view v-if="visible" class="law-mask" :class="theme" @tap="$emit('close')">
		<view ref="dialog" class="law-dialog" role="dialog" aria-modal="true"
			aria-labelledby="law-dialog-title" @tap.stop>
			<view class="law-head">
				<view class="law-heading">
					<text id="law-dialog-title" class="law-title">相关法规条文</text>
					<text v-if="source" class="law-source">题源：{{ source }}</text>
				</view>
				<button class="law-close" role="button" tabindex="0" aria-label="关闭法规" @tap="$emit('close')"
					@keydown.enter.prevent="$emit('close')" @keydown.space.prevent="$emit('close')">×</button>
			</view>
			<scroll-view class="law-scroll" scroll-y tabindex="0" aria-label="法规条文内容">
				<text class="law-text" selectable>{{ content || '本题暂无法规条文。' }}</text>
			</scroll-view>
			<view class="law-footer">
				<button class="np-btn np-btn-primary law-dismiss" role="button" tabindex="0" @tap="$emit('close')"
					@keydown.enter.prevent="$emit('close')" @keydown.space.prevent="$emit('close')">关闭</button>
			</view>
		</view>
	</view>
</template>

<script>
import store from '../core/store.js'

export default {
	name: 'LawDialog',
	props: {
		visible: Boolean,
		content: { type: String, default: '' },
		source: { type: String, default: '' }
	},
	emits: ['close'],
	computed: {
		theme: () => store.themeClass()
	},
	beforeUnmount() {
		// #ifdef H5
		document.removeEventListener('keydown', this.onKeydown, true)
		// #endif
	},
	watch: {
		visible(value) {
			// #ifdef H5
			if (value) {
				this.previousFocus = document.activeElement
				document.addEventListener('keydown', this.onKeydown, true)
				this.$nextTick(() => this.dialogElement()?.querySelector('.law-close')?.focus())
			} else {
				document.removeEventListener('keydown', this.onKeydown, true)
				this.previousFocus?.focus?.()
			}
			// #endif
		}
	},
	methods: {
		dialogElement() {
			return this.$refs.dialog?.$el || this.$refs.dialog
		},
		onKeydown(event) {
			// #ifdef H5
			if (event.key === 'Escape') {
				event.preventDefault()
				this.$emit('close')
				return
			}
			if (event.key !== 'Tab') return
			const controls = Array.from(this.dialogElement()?.querySelectorAll('[tabindex="0"]') || [])
			const first = controls[0], last = controls[controls.length - 1]
			if (!first) return
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault()
				last.focus()
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault()
				first.focus()
			}
			// #endif
		}
	}
}
</script>

<style scoped>
.law-mask {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: calc(24px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px));
	box-sizing: border-box;
	background-color: rgba(15, 23, 32, 0.45);
}

.law-dialog {
	width: 100%;
	max-width: 560px;
	max-height: 100%;
	display: flex;
	flex-direction: column;
	padding: 20px;
	box-sizing: border-box;
	border-radius: 16px;
	background-color: var(--np-surface);
	overflow: hidden;
}

.law-head {
	flex-shrink: 0;
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.law-heading {
	min-width: 0;
}

.law-title {
	display: block;
	font-size: 18px;
	font-weight: 700;
	line-height: 1.5;
	color: var(--np-text);
}

.law-source {
	display: block;
	margin-top: 6px;
	font-size: 12px;
	line-height: 1.6;
	color: var(--np-text-2);
}

.law-close {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 44px;
	height: 44px;
	margin: 0;
	padding: 0;
	border-radius: 10px;
	background-color: var(--np-surface-2);
	color: var(--np-text);
	font-size: 24px;
	line-height: 1;
}

.law-scroll {
	height: 50vh;
	max-height: 480px;
	min-height: 0;
	margin: 16px 0;
	overscroll-behavior: contain;
}

.law-text {
	display: block;
	font-size: calc(15px * var(--np-fs-scale, 1));
	line-height: 1.9;
	color: var(--np-text-2);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.law-footer {
	flex-shrink: 0;
	padding-top: 16px;
	border-top: 1px solid var(--np-border);
}

.law-dismiss {
	width: 100%;
}
</style>
