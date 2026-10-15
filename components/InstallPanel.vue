<template>
	<view>
		<button class="install-trigger" role="button" tabindex="0" aria-label="安装核药通" @tap="open" @keydown.enter.prevent="open" @keydown.space.prevent="open">📲 安装</button>
		<view v-if="visible" class="install-overlay" @tap.self="close" @keydown="onKeydown">
			<view class="install-panel" role="dialog" aria-modal="true" aria-label="安装核药通">
				<view class="install-heading"><text class="np-h2">安装核药通</text><button class="install-close" role="button" tabindex="0" aria-label="关闭安装面板" @tap="close" @keydown.enter.prevent="close" @keydown.space.prevent="close">×</button></view>
				<text class="install-copy">Android 手机下载 APK，安装后可完全离线学习。首次安装时，请按浏览器提示允许安装此应用。</text>
				<a class="install-download" :href="apkUrl">📥 下载应用（APK）</a>
				<text class="install-copy">迁移进度：先在网页版「设置 → 进度备份 → 导出进度」保存 JSON 文件，再到 App「设置 → 进度备份 → 导入进度」导入。</text>
				<text class="install-copy">iPhone / iPad：在 Safari 分享菜单中选择「添加到主屏幕」。网页版首次及重新加载需要网络。</text>
				<a class="install-releases" :href="releasesUrl" target="_blank" rel="noopener noreferrer">查看版本与校验信息 ↗</a>
			</view>
		</view>
	</view>
</template>
<script>
import { APK_URL, RELEASES_URL } from '../core/release-info.js'
export default {
	name: 'InstallPanel',
	data: () => ({ visible: false, apkUrl: APK_URL, releasesUrl: RELEASES_URL }),
	beforeUnmount() { this.unlock() },
	methods: {
		onKeydown(event) {
			if (event.key === 'Escape') { event.preventDefault(); this.close(); return }
			if (event.key !== 'Tab') return
			const controls = Array.from(this.$el.querySelectorAll('.install-panel [tabindex="0"], .install-panel a[href]'))
			const first = controls[0], last = controls[controls.length - 1]
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
		},
		open() {
			if (this.visible) return
			this.previousFocus = this.$el.querySelector('.install-trigger') || document.activeElement
			this.previousOverflow = document.body.style.overflow
			document.body.style.overflow = 'hidden'
			this.visible = true
			this.$nextTick(() => this.$el.querySelector('.install-close')?.focus())
		},
		unlock() { if (this.visible) document.body.style.overflow = this.previousOverflow || '' },
		close() { this.unlock(); this.visible = false; this.previousFocus?.focus?.() }
	}
}
</script>
<style scoped>
.install-trigger { margin:0; padding:0 8px; min-width:64px; min-height:44px; display:flex; align-items:center; justify-content:center; background:var(--np-surface); color:var(--np-primary); border:1px solid var(--np-border); border-radius:10px; font-size:12px; white-space:nowrap }
.install-overlay { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; background:rgba(5,20,27,.58) }
.install-panel { width:100%; max-width:420px; max-height:85vh; overflow:auto; box-sizing:border-box; padding:24px; border-radius:20px; background:var(--np-surface); color:var(--np-text); box-shadow:0 16px 60px rgba(0,0,0,.2) }
.install-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px }
.install-close { margin:0; padding:0; min-width:44px; height:44px; background:var(--np-surface-2); color:var(--np-text); font-size:24px; border:0; border-radius:12px }
.install-copy { display:block; font-size:14px; line-height:1.8; margin-bottom:16px; color:var(--np-text-2) }
.install-download { display:block; padding:14px 12px; margin-bottom:20px; background:var(--np-primary); color:var(--np-on-primary); text-align:center; text-decoration:none; border-radius:12px; font-weight:700; font-size:16px }
.install-releases { color:var(--np-primary); font-size:14px }
button::after { border:0 }
a:focus-visible,button:focus-visible { outline:2px solid var(--np-primary); outline-offset:3px }
</style>
