/**
 * 极简 CDP（Chrome DevTools Protocol）驱动。
 *
 * 目的：用真实浏览器精确控制视口、执行 JS、点击交互与截图。
 * 依赖：Node 内置 fetch 与全局 WebSocket（Node 22+），不引入任何第三方包。
 */

import {
	spawn
} from 'node:child_process'
import {
	existsSync,
	mkdtempSync,
	writeFileSync
} from 'node:fs'
import {
	tmpdir
} from 'node:os'
import {
	join
} from 'node:path'

export const BROWSER_CANDIDATES = [
	...['ProgramFiles(x86)', 'ProgramFiles'].filter(key => process.env[key]).flatMap(key => [
		join(process.env[key], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
		join(process.env[key], 'Google', 'Chrome', 'Application', 'chrome.exe')
	]),
	// Linux（含 GitHub Actions ubuntu runner）与 macOS
	'/usr/bin/google-chrome',
	'/usr/bin/google-chrome-stable',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
]

export function findBrowser() {
	if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
	return BROWSER_CANDIDATES.find((p) => existsSync(p)) || null
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(fn, {
	timeout = 20000,
	interval = 200,
	label = 'condition'
} = {}) {
	const deadline = Date.now() + timeout
	while (Date.now() < deadline) {
		try {
			const value = await fn()
			if (value) return value
		} catch (e) {
			/* 继续重试 */
		}
		await sleep(interval)
	}
	throw new Error(`等待超时：${label}`)
}

/** 启动一个无头浏览器实例（独立用户目录，端口随机） */
export async function launchBrowser(options = {}) {
	const browser = options.browser || findBrowser()
	if (!browser) throw new Error('未找到 Edge/Chrome')
	const port = options.port || 9400 + Math.floor(Math.random() * 400)
	const profile = mkdtempSync(join(tmpdir(), 'np-cdp-'))
	const child = spawn(
		browser,
		[
			'--headless=new',
			'--disable-gpu',
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-extensions',
			'--disable-background-networking',
			'--mute-audio',
			`--user-data-dir=${profile}`,
			`--remote-debugging-port=${port}`,
			'--remote-allow-origins=*',
			'about:blank'
		], {
			stdio: 'ignore'
		}
	)
	await waitFor(
		async () => {
			const res = await fetch(`http://127.0.0.1:${port}/json/version`)
			return res.ok
		}, {
			timeout: 30000,
			label: '浏览器 DevTools 端口就绪'
		}
	)
	return {
		port,
		profile,
		child,
		async close() {
			try {
				child.kill()
			} catch (e) {
				/* 忽略 */
			}
		}
	}
}

/** 新建标签页并连接 CDP */
export async function openPage(port, url = 'about:blank') {
	const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
		method: 'PUT'
	})
	const target = await res.json()
	return connectTarget(port, target)
}

/** 列出当前 CDP 端点下所有页面目标 */
export async function listTargets(port) {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`)
	const list = await res.json()
	return list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
}

/**
 * 依附到已存在的目标（例如安卓 WebView 里正在运行的应用页面，不能新建标签页）。
 * @param {number} port CDP 端口
 * @param {{urlContains?:string, index?:number}} options 目标筛选
 */
export async function attachTarget(port, options = {}) {
	const targets = await listTargets(port)
	if (!targets.length) throw new Error('CDP 端点下没有可依附的页面目标')
	const filtered = options.urlContains ?
		targets.filter((t) => (t.url || '').includes(options.urlContains)) :
		targets
	const target = filtered[options.index || 0] || targets[options.index || 0]
	if (!target) throw new Error('未找到匹配的页面目标：' + JSON.stringify(options))
	return connectTarget(port, target, false)
}

async function connectTarget(port, target, owned = true) {
	const ws = new WebSocket(target.webSocketDebuggerUrl)
	// 连接超时保护：真机上被销毁/无响应的 WebView 目标可能永远不返回 open
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			try {
				ws.close()
			} catch (e) {
				/* 忽略 */
			}
			reject(new Error('CDP WebSocket 连接超时（目标可能已失效）'))
		}, 6000)
		ws.addEventListener(
			'open',
			() => {
				clearTimeout(timer)
				resolve()
			}, {
				once: true
			}
		)
		ws.addEventListener(
			'error',
			() => {
				clearTimeout(timer)
				reject(new Error('CDP WebSocket 连接失败'))
			}, {
				once: true
			}
		)
	})

	let nextId = 0
	const pending = new Map()
	const events = []
	const consoleMessages = []

	ws.addEventListener('message', (event) => {
		const msg = JSON.parse(event.data)
		if (msg.id && pending.has(msg.id)) {
			const {
				resolve,
				reject
			} = pending.get(msg.id)
			pending.delete(msg.id)
			if (msg.error) reject(new Error(
				`${msg.error.message} (${JSON.stringify(msg.error.data || '')})`))
			else resolve(msg.result)
			return
		}
		events.push(msg)
		if (msg.method === 'Runtime.consoleAPICalled') {
			consoleMessages.push({
				level: msg.params.type,
				text: (msg.params.args || []).map((a) => a.value ?? a.description ?? '')
					.join(' ')
			})
		}
		if (msg.method === 'Log.entryAdded') {
			consoleMessages.push({
				level: msg.params.entry.level,
				text: msg.params.entry.text
			})
		}
	})

	const send = (method, params = {}) =>
		new Promise((resolve, reject) => {
			const id = ++nextId
			const timer = setTimeout(() => {
				pending.delete(id)
				reject(new Error(`CDP 命令超时：${method}`))
			}, 10000)
			pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer)
					resolve(value)
				},
				reject: (err) => {
					clearTimeout(timer)
					reject(err)
				}
			})
			try {
				ws.send(JSON.stringify({
					id,
					method,
					params
				}))
			} catch (e) {
				clearTimeout(timer)
				pending.delete(id)
				reject(e)
			}
		})

	const page = {
		targetId: target.id,
		send,
		events,
		consoleMessages,
		async enable() {
			await send('Page.enable')
			await send('Runtime.enable')
			await send('Log.enable')
		},
		async setViewport({
			width,
			height,
			dpr = 1,
			mobile = true
		}) {
			await send('Emulation.setDeviceMetricsOverride', {
				width,
				height,
				deviceScaleFactor: dpr,
				mobile
			})
			await send('Emulation.setTouchEmulationEnabled', {
				enabled: mobile,
				maxTouchPoints: 5
			})
		},
		async goto(url, {
			waitForText = '',
			timeout = 20000
		} = {}) {
			await send('Page.navigate', {
				url
			})
			await waitFor(
				async () => {
					const state = await page.evaluate('document.readyState')
					if (state !== 'complete' && state !== 'interactive') return false
					if (!waitForText) return true
					const text = await page.evaluate(
						'document.body ? document.body.innerText : ""')
					return text.includes(waitForText)
				}, {
					timeout,
					label: `页面加载并包含「${waitForText || '内容'}」`
				}
			)
			await sleep(400)
		},
		async reload(waitForText = '') {
			const offset = events.length
			await send('Page.reload')
			await waitFor(() => events.slice(offset).some(event => event.method === 'Page.loadEventFired'), { label: '新文档加载完成' })
			if (waitForText) await page.waitForText(waitForText)
			// 与 goto 一致，等待 uni 的首屏/底栏挂载与外观同步。
			await sleep(400)
		},
		async evaluate(expression) {
			const result = await send('Runtime.evaluate', {
				expression,
				returnByValue: true,
				awaitPromise: true
			})
			if (result.exceptionDetails) {
				throw new Error(`页面内脚本异常：${result.exceptionDetails.text || ''}`)
			}
			return result.result ? result.result.value : undefined
		},
		async waitForText(text, timeout = 15000) {
			await waitFor(
				async () => {
					const body = await page.evaluate(
						'document.body ? document.body.innerText : ""')
					return body.includes(text)
				}, {
					timeout,
					label: `出现文本「${text}」`
				}
			)
		},
		async waitForSelector(selector, timeout = 15000) {
			return waitFor(
				() => page.evaluate(
				`!!document.querySelector(${JSON.stringify(selector)})`), {
					timeout,
					label: `出现元素 ${selector}`
				}
			)
		},
		/** 点击：优先用文本定位，找不到再退回选择器 */
		async clickText(text, {
			index = 0
		} = {}) {
			const ok = await page.evaluate(`(() => {
				const nodes = [...document.querySelectorAll('uni-view, uni-button, uni-text, div, span, button')]
				const hits = nodes.filter((el) => (el.innerText || '').trim() === ${JSON.stringify(text)} || (el.textContent || '').trim() === ${JSON.stringify(text)})
				const visible = hits.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
				const target = visible[${index}] || hits[${index}]
				if (!target) return false
				const r = target.getBoundingClientRect()
				target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
				return true
			})()`)
			if (!ok) throw new Error(`未找到可点击文本：${text}`)
			await sleep(500)
			return true
		},
		async clickSelector(selector) {
			const ok = await page.evaluate(`(() => {
				const el = document.querySelector(${JSON.stringify(selector)})
				if (!el) return false
				const r = el.getBoundingClientRect()
				el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
				return true
			})()`)
			if (!ok) throw new Error(`未找到元素：${selector}`)
			await sleep(400)
			return true
		},
		/** 点击选择器命中的第 index 个元素 */
		async clickNth(selector, index = 0) {
			const ok = await page.evaluate(`(() => {
				const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
					.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
				const el = els[${index}]
				if (!el) return false
				const r = el.getBoundingClientRect()
				el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
				return true
			})()`)
			if (!ok) throw new Error(`未找到第 ${index + 1} 个元素：${selector}`)
			await sleep(450)
			return true
		},
		/** 按文本「包含」匹配点击（适用于带数字/后缀的按钮文案） */
		async clickTextContains(text, {
			index = 0,
			exactDeepest = true
		} = {}) {
			const ok = await page.evaluate(`(() => {
				const nodes = [...document.querySelectorAll('uni-view, uni-button, uni-text, div, span, button')]
				const hits = nodes.filter((el) => (el.innerText || '').includes(${JSON.stringify(text)}))
					.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
				// 取「最内层」命中元素，避免点到整页容器
				const deepest = ${exactDeepest}
					? hits.filter((el) => !hits.some((other) => other !== el && el.contains(other)))
					: hits
				const target = deepest[${index}] || hits[${index}]
				if (!target) return false
				const r = target.getBoundingClientRect()
				target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
				return true
			})()`)
			if (!ok) throw new Error(`未找到包含文本的可点击元素：${text}`)
			await sleep(500)
			return true
		},
		async count(selector) {
			return page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
		},
		async url() {
			return page.evaluate('location.href')
		},
		async waitForUrlContains(fragment, timeout = 15000) {
			await waitFor(
				async () => (await page.url()).includes(fragment), {
					timeout,
					label: `URL 包含「${fragment}」`
				}
			)
		},
		async storage(key) {
			return page.evaluate(
				`(function(){ try { return localStorage.getItem(${JSON.stringify(key)}) } catch (e) { return null } })()`
			)
		},
		async errors() {
			return consoleMessages.filter((m) => m.level === 'error')
		},
		/** 运行期未捕获异常（Runtime.exceptionThrown），用于替代不可用的设备日志 */
		exceptions() {
			return events
				.filter((e) => e.method === 'Runtime.exceptionThrown')
				.map((e) => {
					const d = e.params && e.params.exceptionDetails ? e.params.exceptionDetails :
					{}
					return {
						text: d.text || '',
						description: (d.exception && d.exception.description) || '',
						line: d.lineNumber
					}
				})
		},
		async screenshot(path) {
			const {
				data
			} = await send('Page.captureScreenshot', {
				format: 'png',
				captureBeyondViewport: false
			})
			writeFileSync(path, Buffer.from(data, 'base64'))
			return path
		},
		async text() {
			return page.evaluate('document.body ? document.body.innerText : ""')
		},
		async scrollToBottom() {
			await page.evaluate(
				'(function(){ const el = document.scrollingElement || document.documentElement; el.scrollTop = el.scrollHeight; })()'
			)
			await sleep(300)
		},
		/**
		 * 在页面坐标（CSS px）派发真实输入事件。
		 *
		 * 用于真机：App 端页面 WebView 相对屏幕有偏移（状态栏），用 adb 屏幕坐标点页面
		 * 内元素容易点偏；CDP 的 Input 域直接按页面坐标注入触摸/鼠标事件，路径最短、最准。
		 */
		async tapPoint(x, y, {
			method = 'touch'
		} = {}) {
			if (method === 'touch') {
				await send('Input.dispatchTouchEvent', {
					type: 'touchStart',
					touchPoints: [{
						x,
						y,
						radiusX: 2,
						radiusY: 2,
						force: 1
					}]
				})
				await sleep(70)
				await send('Input.dispatchTouchEvent', {
					type: 'touchEnd',
					touchPoints: []
				})
			} else {
				await send('Input.dispatchMouseEvent', {
					type: 'mousePressed',
					x,
					y,
					button: 'left',
					clickCount: 1
				})
				await send('Input.dispatchMouseEvent', {
					type: 'mouseReleased',
					x,
					y,
					button: 'left',
					clickCount: 1
				})
			}
			await sleep(400)
		},
		/** 按选择器找到元素中心并派发真实输入事件（页面坐标系） */
		async tapCss(selector, {
			index = 0,
			method = 'touch',
			settle = 900
		} = {}) {
			const rect = await page.evaluate(`(() => {
				const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
					.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
				const el = els[${index}]
				if (!el) return null
				const r = el.getBoundingClientRect()
				return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height), text: (el.innerText || '').trim().slice(0, 24), below: r.bottom > window.innerHeight }
			})()`)
			if (!rect) throw new Error(`未找到元素：${selector}`)
			await page.tapPoint(rect.x, rect.y, {
				method
			})
			await sleep(settle)
			return rect
		},
		/** 按文本定位元素（最内层命中）并派发真实输入事件 */
		async tapText(text, {
			method = 'touch',
			settle = 1000,
			index = 0
		} = {}) {
			const rect = await page.evaluate(`(() => {
				const nodes = [...document.querySelectorAll('uni-view, uni-text, uni-button, div, span, button')]
				const hits = nodes.filter((el) => (el.innerText || '').includes(${JSON.stringify(text)}))
					.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
				const deepest = hits.filter((el) => !hits.some((other) => other !== el && el.contains(other)))
				const el = deepest[${index}] || hits[${index}]
				if (!el) return null
				const r = el.getBoundingClientRect()
				return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.innerText || '').trim().slice(0, 24) }
			})()`)
			if (!rect) throw new Error(`未找到文本元素：${text}`)
			await page.tapPoint(rect.x, rect.y, {
				method
			})
			await sleep(settle)
			return rect
		},
		async close() {
			try {
				ws.close()
			} catch (e) {
				/* 忽略 */
			}
			try {
				if (owned) await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`)
			} catch (e) {
				/* 忽略 */
			}
		}
	}
	return page
}

/** 静态文件服务（用于本地验证构建产物） */
export async function startStaticServer(root, port) {
	const {
		createServer
	} = await import('node:http')
	const {
		readFileSync,
		statSync
	} = await import('node:fs')
	const {
		extname,
		join,
		normalize
	} = await import('node:path')
	const MIME = {
		'.html': 'text/html; charset=utf-8',
		'.js': 'text/javascript; charset=utf-8',
		'.css': 'text/css; charset=utf-8',
		'.json': 'application/json; charset=utf-8',
		'.png': 'image/png',
		'.svg': 'image/svg+xml',
		'.woff2': 'font/woff2',
		'.ttf': 'font/ttf'
	}
	const server = createServer((req, res) => {
		const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0])
		let filePath = normalize(join(root, urlPath === '/' ? 'index.html' : urlPath))
		if (!filePath.startsWith(root)) {
			res.writeHead(403).end('forbidden')
			return
		}
		if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(root,
			'index.html')
		res.writeHead(200, {
			'Content-Type': MIME[extname(filePath)] || 'application/octet-stream'
		})
		res.end(readFileSync(filePath))
	})
	// 传 0 表示由系统分配空闲端口（避开 Windows 保留端口段导致的 EACCES）
	await new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, '127.0.0.1', resolve)
	})
	return {
		port: server.address().port,
		close: () => new Promise((resolve) => server.close(resolve))
	}
}
