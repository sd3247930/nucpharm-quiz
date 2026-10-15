/**
 * 横向溢出探针：在真实浏览器里量测页面宽度与超宽元素，用于定位移动端布局裁切问题。
 *
 * 用法：node tests/e2e/probe-overflow.mjs [路由hash] [视口宽] [视口高]
 * 例：  node tests/e2e/probe-overflow.mjs "#/pages/home/index" 390 844
 */

import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { findBrowser } from '../support/cdp.mjs'

const run = promisify(execFile)
const ROOT = resolve(import.meta.dirname, '..', '..')
const WEB_DIR = join(ROOT, 'unpackage', 'dist', 'build', 'web')
const PORT = 5202

const hash = process.argv[2] || '#/pages/home/index'
const width = Number(process.argv[3] || 390)
const height = Number(process.argv[4] || 844)
const direct = process.argv.includes('--direct')

const EDGE = findBrowser()

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml'
}

const probeHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">
<iframe id="f" src="./index.html${hash}" style="width:${width}px;height:${height}px;border:0"></iframe>
<pre id="out">pending</pre>
<script>
setTimeout(() => {
  try {
    const f = document.getElementById('f')
    const w = f.contentWindow
    const d = f.contentDocument
    const limit = w.innerWidth
    const all = [...d.querySelectorAll('*')]
    const overflowing = all
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.right > limit + 1 && x.r.width > 0)
      .slice(0, 12)
      .map((x) => {
        const el = x.el
        const cls = typeof el.className === 'string' ? el.className : ''
        const chain = []
        let p = el.parentElement
        for (let i = 0; i < 4 && p; i += 1) {
          const pc = typeof p.className === 'string' ? p.className : ''
          chain.push(p.tagName.toLowerCase() + (pc ? '.' + pc.split(' ').join('.') : ''))
          p = p.parentElement
        }
        return {
          el: el.tagName.toLowerCase() + (cls ? '.' + cls.split(' ').join('.') : ''),
          right: Math.round(x.r.right),
          w: Math.round(x.r.width),
          html: el.outerHTML.slice(0, 140),
          chain: chain.join(' < ')
        }
      })
    const widest = all
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .sort((a, b) => b.r.width - a.r.width)
      .slice(0, 6)
      .map((x) => {
        const cls = typeof x.el.className === 'string' ? x.el.className : ''
        return x.el.tagName.toLowerCase() + (cls ? '.' + cls.split(' ').join('.') : '') + ' w=' + Math.round(x.r.width) + ' left=' + Math.round(x.r.left)
      })
    document.getElementById('out').textContent = JSON.stringify({
      innerWidth: limit,
      devicePixelRatio: w.devicePixelRatio,
      docScrollWidth: d.documentElement.scrollWidth,
      bodyScrollWidth: d.body.scrollWidth,
      htmlClientWidth: d.documentElement.clientWidth,
      uniPageBody: (() => { const b = d.querySelector('uni-page-body'); return b ? { w: Math.round(b.getBoundingClientRect().width), sw: b.scrollWidth } : null })(),
      overflowCount: overflowing.length,
      overflowing,
      widest
    }, null, 1)
  } catch (e) {
    document.getElementById('out').textContent = 'ERROR ' + e.message
  }
}, 6000)
</script></body></html>`

// 直接量测模式：以真实视口打开 App 页面（不经 iframe），并把结果写进 DOM 供 --dump-dom 读取
const directProbeScript = `<script>
setTimeout(() => {
  const describe = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { tag: el.tagName.toLowerCase(), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
  }
  const q = (sel) => document.querySelector(sel)
  const items = [...document.querySelectorAll('.uni-tabbar__item')].map((el) => describe(el))
  const cards = [...document.querySelectorAll('.np-card, .np-card-flat, .hero, .bottom, .status-bar')].map((el) => describe(el))
  const overflow = [...document.querySelectorAll('*')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((x) => x.r.right > window.innerWidth + 1 && x.r.width > 0 && x.el.tagName.toLowerCase() !== 'DIV')
    .slice(0, 8)
    .map((x) => {
      const cls = typeof x.el.className === 'string' ? x.el.className : ''
      return x.el.tagName.toLowerCase() + (cls ? '.' + cls.split(' ').join('.') : '') + ' right=' + Math.round(x.r.right)
    })
  const out = {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    docScrollWidth: document.documentElement.scrollWidth,
    tabbarItems: items,
    tabbarCount: items.length,
    blocks: cards,
    overflowNonDiv: overflow
  }
  const pre = document.createElement('pre')
  pre.id = 'np-probe'
  pre.textContent = 'NPPROBE' + JSON.stringify(out)
  document.documentElement.appendChild(pre)
}, 6000)
</script>`

const server = createServer((req, res) => {
	const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0])
	if (urlPath === '/probe.html') {
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(probeHtml)
		return
	}
	let filePath = normalize(join(WEB_DIR, urlPath === '/' ? 'index.html' : urlPath))
	if (!filePath.startsWith(WEB_DIR)) {
		res.writeHead(403).end('forbidden')
		return
	}
	if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(WEB_DIR, 'index.html')
	res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
	let body = readFileSync(filePath)
	if (direct && filePath.endsWith('index.html')) {
		// 注入量测脚本（仅探针使用，不修改构建产物）
		body = Buffer.from(
			body.toString('utf-8').replace('</body>', `${directProbeScript}</body>`),
			'utf-8'
		)
	}
	res.end(body)
})

server.listen(PORT, '127.0.0.1', async () => {
	const profile = mkdtempSync(join(tmpdir(), 'np-probe-'))
	try {
		const { stdout } = await run(
			EDGE,
			[
				'--headless=new',
				'--disable-gpu',
				'--no-first-run',
				`--user-data-dir=${profile}`,
				`--window-size=${width + 200},${height + 300}`,
				'--virtual-time-budget=9000',
				'--dump-dom',
				direct
					? `http://127.0.0.1:${PORT}/index.html${hash}`
					: `http://127.0.0.1:${PORT}/probe.html`
			],
			{ maxBuffer: 40 * 1024 * 1024, timeout: 120000 }
		)
		const m = direct ? stdout.match(/NPPROBE({[\s\S]*?})<\/pre>/) : stdout.match(/<pre id="out">([\s\S]*?)<\/pre>/)
		const text = m ? m[1] : 'no output'
		console.log(`路由 ${hash} @ ${width}×${height}`)
		console.log(text)
	} catch (e) {
		console.error('探针执行失败：', e.message)
	} finally {
		server.close()
	}
})
