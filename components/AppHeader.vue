<template>
	<view class="hdr" :class="[theme, { 'hdr-brand': showLogo && !showBack }]">
		<view class="hdr-status" :style="{ height: statusBar + 'px' }" />
		<view class="hdr-bar" :class="{ 'hdr-detail': showBack }">
			<button v-if="showBack" class="hdr-back" aria-label="返回" @tap="goBack"><text>‹</text></button>
			<view v-if="showLogo && !showBack" class="hdr-logo-frame">
				<image class="hdr-logo" src="/static/brand/logo-header-hd.png" mode="aspectFit" aria-label="核药通 Logo" />
			</view>
			<view class="hdr-center"><text class="hdr-title">{{ title }}</text><text v-if="displaySubtitle"
					class="hdr-sub">{{ displaySubtitle }}</text></view>
			<button v-if="rightText" class="hdr-right" @tap="onRight">{{ rightText }}</button>
			<!-- #ifdef H5 -->
			<InstallPanel v-if="showLogo && !showBack && !rightText" />
			<!-- #endif -->
		</view>
		<slot name="below" />
	</view>
</template>
<script>
import store from '../core/store.js'
// #ifdef H5
import InstallPanel from './InstallPanel.vue'
// #endif
import {
	statusBarHeight
} from '../core/platform.js'
import {
	openRoute
} from '../core/navigation.js'
export default {
	name: 'AppHeader',
	// #ifdef H5
	components: { InstallPanel },
	// #endif
	props: {
		title: {
			type: String,
			default: ''
		},
		subtitle: {
			type: String,
			default: ''
		},
		showBack: Boolean,
		showLogo: Boolean,
		rightText: {
			type: String,
			default: ''
		},
		rightTo: {
			type: String,
			default: ''
		}
	},
	emits: ['right'],
	data: () => ({
		statusBar: statusBarHeight()
	}),
	computed: {
		theme: () => store.themeClass(),
		displaySubtitle() {
			return this.showLogo && !this.showBack ? '核药学与放射药剂学规范题库' : this.subtitle
		}
	},
	methods: {
		goBack() {
			if (getCurrentPages().length > 1) uni.navigateBack();
			else uni.switchTab({
				url: '/pages/home/index'
			})
		},
		onRight() {
			this.$emit('right');
			if (this.rightTo) openRoute(this.rightTo)
		}
	}
}
</script>
<style scoped>
.hdr {
	position: sticky;
	top: 0;
	z-index: 20;
	background: var(--np-surface);
	border-bottom: 1px solid var(--np-border)
}

.hdr-status {
	min-height: env(safe-area-inset-top, 0px)
}

.hdr-brand {
	background: #edf5f3;
	border-bottom-color: #d3e3de
}

.hdr-brand.np-dark {
	background: #172b2a;
	border-bottom-color: #31514a
}

.hdr-bar {
	display: flex;
	align-items: center;
	min-height: 64px;
	padding: 8px 16px;
	box-sizing: border-box;
	max-width: 760px;
	margin: 0 auto;
	gap: 10px
}

.hdr-detail {
	min-height: 48px;
	padding: 2px 12px;
	gap: 4px
}

.hdr-brand .hdr-bar {
	min-height: 96px;
	padding: 12px 16px;
	gap: 14px
}

.hdr-logo-frame {
	width: 72px;
	height: 72px;
	padding: 3px;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	border: 1px solid #bdd5cf;
	border-radius: 20px;
	background: #ffffff;
	box-shadow: 0 3px 10px rgba(26, 83, 70, .10)
}

.np-dark .hdr-logo-frame {
	border-color: #7bada1;
	box-shadow: 0 3px 12px rgba(0, 0, 0, .24)
}

.hdr-logo {
	width: 64px;
	height: 64px;
	border-radius: 16px;
	flex-shrink: 0
}

.hdr-center {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	justify-content: center
}

.hdr-title {
	font-size: 20px;
	line-height: 1.35;
	font-weight: 700;
	color: var(--np-text)
}

.hdr-detail .hdr-title {
	font-size: 17px
}

.hdr-brand .hdr-title {
	font-size: 22px;
	letter-spacing: .02em
}

.hdr-sub {
	font-size: 11px;
	line-height: 1.5;
	margin-top: 2px;
	color: var(--np-text-2);
	overflow-wrap: anywhere
}

.hdr-back,
.hdr-right {
	margin: 0;
	padding: 0 8px;
	background: transparent;
	min-height: 44px;
	min-width: 44px;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 0;
	flex-shrink: 0
}

.hdr-back {
	color: var(--np-text);
	font-size: 36px
}

.hdr-right {
	color: var(--np-primary);
	font-size: 13px
}

.hdr-brand .hdr-right {
	background: var(--np-surface);
	border: 1px solid var(--np-border);
	border-radius: 10px
}
</style>
