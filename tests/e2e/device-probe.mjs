/**
 * 真机 WebView 目标探针：列出调试基座里所有可依附的页面目标，并逐个探测其内容，
 * 用于确定「哪个目标才是渲染当前页面的 WebView」。
 *
 * 用法：node tests/e2e/device-probe.mjs
 */

import { execFileSync } from 'node:child_process'

import { listTargets, attachTarget } from '../support/cdp.mjs'

const PORT = 9224

function adb(args) {
	return execFileSync('adb', args, { encoding: 'utf8' })
}

const unix = adb(['shell', 'cat', '/proc/net/unix'])
const pidMatch = unix.match(/webview_devtools_remote_(\d+)/)
if (!pidMatch) {
	console.error('未找到 webview devtools 端口')
	process.exit(1)
}
adb(['forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pidMatch[1]}`])
await new Promise((r) => setTimeout(r, 1500))

const targets = await listTargets(PORT)
console.log(`目标数：${targets.length}`)
for (let i = 0; i < targets.length; i += 1) {
	const t = targets[i]
	console.log(`\n[${i}] type=${t.type} title=${JSON.stringify(t.title)}`)
	console.log(`     url=${(t.url || '').slice(0, 140)}`)
	try {
		const page = await attachTarget(PORT, { index: i })
		await page.enable()
		const info = await page.evaluate(`(() => {
			let text = ''
			try { text = (document.body ? document.body.innerText : '') || '' } catch (e) {}
			return {
				href: location.href.slice(0, 120),
				hash: location.hash,
				visibility: document.visibilityState,
				hidden: document.hidden,
				hasFocus: document.hasFocus(),
				bodyLen: text.length,
				head: text.replace(/\\s+/g, ' ').slice(0, 90),
				npPage: document.querySelectorAll('.np-page').length,
				btn: document.querySelectorAll('.np-btn').length,
				tabbar: document.querySelectorAll('.uni-tabbar__item').length,
				viewport: window.innerWidth + 'x' + window.innerHeight
			}
		})()`)
		console.log(`     ${JSON.stringify(info)}`)
		await page.close()
	} catch (e) {
		console.log(`     探测失败：${e.message}`)
	}
}
