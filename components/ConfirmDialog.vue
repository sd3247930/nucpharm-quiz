<template>
	<view v-if="visible" class="mask" :class="themeClass()" @tap="onMask">
		<view class="dialog" @tap.stop>
			<text class="dlg-title">{{ title }}</text>
			<text v-if="content" class="dlg-content">{{ content }}</text>
			<view class="dlg-actions">
				<view v-if="showCancel" class="dlg-btn np-btn np-btn-plain" @tap="onCancel">
					<text>{{ cancelText }}</text>
				</view>
				<view class="dlg-btn np-btn np-btn-primary" :class="{ 'np-btn-disabled': disabled }"
					@tap="onConfirm">
					<text>{{ confirmText }}</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import store from '../core/store.js'

export default {
	name: 'ConfirmDialog',
	props: {
		visible: {
			type: Boolean,
			default: false
		},
		title: {
			type: String,
			default: '提示'
		},
		content: {
			type: String,
			default: ''
		},
		confirmText: {
			type: String,
			default: '确定'
		},
		cancelText: {
			type: String,
			default: '取消'
		},
		showCancel: {
			type: Boolean,
			default: true
		},
		closeOnMask: {
			type: Boolean,
			default: true
		},
		disabled: {
			type: Boolean,
			default: false
		}
	},
	methods: {
		themeClass() {
			return store.themeClass()
		},
		onConfirm() {
			if (this.disabled) return
			this.$emit('confirm')
		},
		onCancel() {
			this.$emit('cancel')
		},
		onMask() {
			if (this.closeOnMask) this.$emit('cancel')
		}
	}
}
</script>

<style lang="scss" scoped>
.mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background-color: rgba(15, 23, 32, 0.45);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 900;
}

.dialog {
	width: calc(100% - 40px);
	max-width: 420px;
	max-height: 85vh;
	overflow-y: auto;
	box-sizing: border-box;
	background-color: var(--np-surface);
	border-radius: 24rpx;
	padding: 24px 20px 20px;
	display: flex;
	flex-direction: column;
}

.dlg-title {
	font-size: 18px;
	font-weight: 600;
	color: var(--np-text);
	text-align: center;
}

.dlg-content {
	font-size: 14px;
	color: var(--np-text-2);
	line-height: 1.6;
	margin-top: 20rpx;
	text-align: center;
}

.dlg-actions {
	display: flex;
	margin-top: 36rpx;
}

.dlg-btn {
	flex: 1;
	min-height: 44px;
	height: auto;
	border-radius: 18rpx;
}

.dlg-btn+.dlg-btn {
	margin-left: 20rpx;
}
</style>
