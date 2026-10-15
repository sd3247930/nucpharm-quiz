<script>
import { beginStartup, markStartup, failStartup } from './core/startup.js'
import store from './core/store.js'

export default {
	onLaunch: function() {
		beginStartup()
		try {
			store.init()
			markStartup('essentialDataReady')
		} catch (error) {
			// 首页显示可重试状态，不能让存储恢复错误变成无限启动等待。
			failStartup()
		}

		// #ifdef H5
		// iOS Safari 手势返回/页面缓存恢复时兜底，避免白屏（见 docs/H5_IOS_COMPAT.md）
		if (typeof window !== 'undefined') {
			window.addEventListener('pageshow', function(e) {
				if (e && e.persisted) {
					store.touchResume()
					window.scrollTo(0, 0)
				}
			})
		}
		// #endif
	},
	onShow: function() {
		store.touchResume()
	},
	onHide: function() {
		store.flush()
	}
}
</script>

<style>
/* ==========================================================================
	   核药通 NucPharm · 全局样式
	   - 统一页面容器、卡片、按钮、标签的视觉语言（P5 统一 UI 口径）
	   - 浅色 / 深色两套 CSS 变量，运行期按设置在页面根节点切换
	   ========================================================================== */

:root,
page,
.np-light {
	--np-canvas: #f7f9fc;
	--np-surface: #ffffff;
	--np-surface-2: #f1f5f9;
	--np-border: #e2e8f0;
	--np-text: #1e293b;
	--np-text-2: #5b6b7f;
	--np-text-3: #5b6b7f;
	--np-on-primary: #ffffff;
	--np-primary: #1a6b5a;
	--np-primary-soft: #e8f4f0;
	--np-accent: #1f6b8e;
	--np-accent-soft: #e6f1f7;
	--np-correct: #0b7759;
	--np-correct-soft: #e6f5f0;
	--np-wrong: #bd3037;
	--np-wrong-soft: #fbeaea;
	--np-caution: #925b0b;
	--np-caution-soft: #fdf3e3;
	--np-shadow: 0 2px 12px rgba(16, 43, 54, 0.06);
}

.np-dark {
	--np-canvas: #0f1720;
	--np-surface: #17212b;
	--np-surface-2: #1f2b37;
	--np-border: #2b3947;
	--np-text: #e8eef4;
	--np-text-2: #9fb0c0;
	--np-text-3: #9fb0c0;
	--np-on-primary: #0f241e;
	--np-primary: #4fb99f;
	--np-primary-soft: #17322c;
	--np-accent: #62b0d8;
	--np-accent-soft: #16293a;
	--np-correct: #3fbf94;
	--np-correct-soft: #14312a;
	--np-wrong: #ef7676;
	--np-wrong-soft: #3a1f22;
	--np-caution: #e0a44a;
	--np-caution-soft: #3a2c15;
	--np-shadow: 0 2px 12px rgba(0, 0, 0, 0.32);
}

page {
	background-color: var(--np-canvas);
	color: var(--np-text);
	font-size: 28rpx;
	line-height: 1.6;
	-webkit-font-smoothing: antialiased;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}

.np-page {
	min-height: 100vh;
	background-color: var(--np-canvas);
	box-sizing: border-box;
	--np-fs-scale: 1;
	overflow-wrap: anywhere;
}

/* 字号档位（设置页可切换；作用于题干、选项、解析等阅读面） */
.np-fs-small {
	--np-fs-scale: 0.92;
}

.np-fs-normal {
	--np-fs-scale: 1;
}

.np-fs-large {
	--np-fs-scale: 1.14;
}

/* 顶部安全区（iOS 刘海 / Android 状态栏，含 H5 env() 兜底） */
.np-safe-top {
	padding-top: env(safe-area-inset-top);
}

/* 底部安全区（Home Indicator / 虚拟导航条） */
.np-safe-bottom {
	padding-bottom: env(safe-area-inset-bottom);
}

.np-container {
	padding-left: 32rpx;
	padding-right: 32rpx;
}

/* ---------- 卡片 ---------- */
.np-card {
	background-color: var(--np-surface);
	border-radius: 12px;
	box-shadow: var(--np-shadow);
	border: 1px solid transparent;
	box-sizing: border-box;
}

.np-card-flat {
	background-color: var(--np-surface);
	border-radius: 12px;
	border: 1px solid var(--np-border);
	box-sizing: border-box;
}

/* ---------- 按钮 ---------- */
.np-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 48px;
	height: auto;
	padding: 12px 16px;
	box-sizing: border-box;
	border-radius: 10px;
	font-size: 15px;
	font-weight: 600;
	border: none;
	line-height: 1.5;
	margin: 0;
}

.np-btn-primary {
	background-color: var(--np-primary);
	color: var(--np-on-primary);
}

.np-btn-primary:active {
	background-color: #145347;
}

.np-btn-ghost {
	background-color: var(--np-surface);
	color: var(--np-primary);
	border: 2rpx solid var(--np-primary);
}

.np-btn-plain {
	background-color: var(--np-surface-2);
	color: var(--np-text);
}

.np-btn-disabled {
	opacity: 0.45;
}

button::after {
	border: none;
}

button {
	font-family: inherit;
}

button[disabled] {
	opacity: .45;
}

button:focus-visible {
	outline: 2px solid var(--np-primary);
	outline-offset: 3px;
}

.np-content {
	max-width: 720px;
	margin: 0 auto;
	padding: 16px 16px 24px;
	box-sizing: border-box;
}

.np-section {
	margin-bottom: 16px;
	padding: 18px 16px;
}

.np-section-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 14px;
}

.np-section-title {
	color: var(--np-text);
	font-size: 16px;
	font-weight: 700;
	line-height: 1.5;
}

.np-caption {
	color: var(--np-text-2);
	font-size: 12px;
	line-height: 1.6;
}

.np-muted {
	color: var(--np-text-2);
	font-size: 13px;
	line-height: 1.6;
}

.np-link {
	background: transparent;
	color: var(--np-primary);
	font-size: 13px;
	margin: 0;
	padding: 8px 4px;
	min-height: 44px;
	border: 0;
	line-height: 1.5;
	display: flex;
	align-items: center;
	justify-content: center;
}

.np-number {
	font-variant-numeric: tabular-nums;
	letter-spacing: -.02em;
}

.np-row {
	display: flex;
	align-items: center;
	gap: 12px;
}

.np-grow {
	flex: 1;
	min-width: 0;
}

.np-arrow {
	color: var(--np-text-2);
	font-size: 24px;
}

.np-icon-box {
	width: 40px;
	height: 40px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	background: var(--np-primary-soft);
	color: var(--np-primary);
}

.np-icon-box image {
	width: 23px;
	height: 23px;
}

/* #ifdef H5 */
/* 继续由 uni-app 预留底栏高度/安全区，网页只增强材质与按压反馈。 */
.uni-tabbar-bottom .uni-tabbar {
	background-color: rgba(255, 255, 255, .97) !important;
	box-shadow: 0 -4px 20px rgba(43, 64, 101, .07);
	-webkit-backdrop-filter: blur(10px);
	backdrop-filter: blur(10px);
}

.uni-tabbar-bottom .uni-tabbar-border {
	background-color: rgba(100, 120, 153, .14) !important;
}

.uni-tabbar__item {
	min-width: 0;
	touch-action: manipulation;
}

.uni-tabbar__bd {
	transition: transform 160ms ease;
}

.uni-tabbar__item:active .uni-tabbar__bd {
	transform: scale(.95);
}

.uni-tabbar__icon img {
	object-fit: contain;
}

.uni-tabbar__label {
	font-weight: 600;
	line-height: 18px !important;
	white-space: nowrap;
	letter-spacing: .04em;
}

html[data-np-appearance="dark"] .uni-tabbar-bottom .uni-tabbar {
	background-color: #17212b !important;
	box-shadow: 0 -4px 20px rgba(0, 0, 0, .18);
}

html[data-np-appearance="dark"] .uni-tabbar-bottom .uni-tabbar-border {
	background-color: rgba(163, 183, 212, .18) !important;
}
/* #endif */

@media (prefers-reduced-motion: reduce) {
	* {
		scroll-behavior: auto !important;
		animation: none !important;
		transition: none !important;
	}
}

/* ---------- 文字 ---------- */
.np-title {
	font-size: 36rpx;
	font-weight: 600;
	color: var(--np-text);
	line-height: 1.35;
}

.np-sub {
	font-size: 26rpx;
	color: var(--np-text-2);
}

.np-mini {
	font-size: 22rpx;
	color: var(--np-text-3);
}

/* ---------- 题型标签（文字 + 颜色双通道） ---------- */
.np-tag {
	display: inline-flex;
	align-items: center;
	height: 36rpx;
	padding: 0 12rpx;
	border-radius: 8rpx;
	font-size: 20rpx;
	font-weight: 600;
	line-height: 1;
}

.np-tag-single {
	background-color: var(--np-primary-soft);
	color: var(--np-primary);
}

.np-tag-multiple {
	background-color: var(--np-accent-soft);
	color: var(--np-accent);
}

.np-tag-boolean {
	background-color: var(--np-caution-soft);
	color: var(--np-caution);
}

/* ---------- 分割线 ---------- */
.np-divider {
	height: 1px;
	background-color: var(--np-border);
}

/* 隐藏滚动条（H5） */
::-webkit-scrollbar {
	width: 0;
	height: 0;
	background: transparent;
}
</style>
