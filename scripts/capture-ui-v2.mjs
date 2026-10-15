import {
	mkdirSync,
	writeFileSync
} from 'node:fs'
import {
	resolve,
	join
} from 'node:path'
import assert from 'node:assert/strict'
import {
	launchBrowser,
	openPage,
	startStaticServer
} from '../tests/support/cdp.mjs'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'docs/screenshots/h5-v2')
mkdirSync(out, {
	recursive: true
})
const quick = process.argv.includes('--quick')
const viewports = quick ? [
	[390, 844]
] : [
	[320, 568],
	[375, 812],
	[390, 844],
	[430, 932],
	[768, 1024]
]
const variants = quick ? [
	['light', 'normal']
] : ['light', 'dark'].flatMap(theme => ['small', 'normal', 'large'].map(font => [theme, font]))
const routes = [
	['home', '首页'],
	['study', '练习'],
	['exam', '考试'],
	['mistakes', '错题'],
	['settings', '设置']
]
const rows = []
const server = await startStaticServer(join(root, 'unpackage/dist/build/web'), 0)
const browser = await launchBrowser()
const page = await openPage(browser.port)
const base = `http://127.0.0.1:${server.port}/index.html`
try {
	await page.enable();
	await page.send('Network.enable')
	await page.send('Network.setBlockedURLs', {
		urls: ['https://*', 'http://fonts.*', 'http://cdn.*']
	})
	await page.goto(base + '#/pages/home/index', {
		waitForText: '题库学习覆盖率'
	})
	for (const [width, height] of viewports)
		for (const [theme, font] of variants) {
			await page.setViewport({
				width,
				height,
				dpr: 1,
				mobile: width < 600
			})
			const fixture = await page.send('Page.addScriptToEvaluateOnNewDocument', {
				source: `localStorage.setItem('nucpharm:v1:settings',JSON.stringify({appearance:'${theme}',fontScale:'${font}',autoNext:false,showExplanation:'immediate',examMinutes:60}))`
			})
			await page.send('Page.reload', {
				ignoreCache: true
			})
			await new Promise(resolve => setTimeout(resolve, 500))
			for (const [route, title] of routes) {
				await page.goto(base + `#/pages/${route}/index`, {
					waitForText: title
				})
				await page.waitForSelector('.hdr-logo')
				await page.evaluate(
					`Promise.all([...document.images].map(i=>i.complete?null:new Promise(r=>{i.onload=r;i.onerror=r})))`
					)
				const metrics = await page.evaluate(`(() => {
    const header=document.querySelector('.hdr-bar'), logo=document.querySelector('.hdr-logo')
    const r=header.getBoundingClientRect()
    const controls=[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width>0&&!e.disabled)
    const undersized=controls.filter(e=>e.getBoundingClientRect().height<43).map(e=>(e.innerText||'').slice(0,24))
    return {w:innerWidth,sw:document.documentElement.scrollWidth,title:document.querySelector('.hdr-title')?.innerText,headerHeight:r.height,logoWidth:logo.getBoundingClientRect().width,tabs:[...document.querySelectorAll('.uni-tabbar__label')].map(e=>e.innerText),brokenImages:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),undersized,tabColor:getComputedStyle(document.querySelector('.uni-tabbar')).backgroundColor,theme:getComputedStyle(document.querySelector('.np-page')).getPropertyValue('--np-canvas').trim(),font:getComputedStyle(document.querySelector('.np-page')).getPropertyValue('--np-fs-scale').trim()}
   })()`)
				const brand = await page.evaluate(`(() => {const f=document.querySelector('.hdr-logo-frame'),l=document.querySelector('.hdr-logo'),i=l.querySelector('img');return {naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,source:i.currentSrc,frameWidth:f.getBoundingClientRect().width,frameBackground:getComputedStyle(f).backgroundColor,headerBackground:getComputedStyle(document.querySelector('.hdr')).backgroundColor}})()`)
				assert.ok(brand.naturalWidth >= 512 && brand.naturalHeight >= 512, '高清原图未加载')
				assert.equal(brand.frameWidth, 72)
				assert.notEqual(brand.headerBackground, brand.frameBackground, 'Logo 底座需要与页头形成区分')
				assert.ok(metrics.sw <= width + 1, `${route}/${width}/${theme}/${font} 横向溢出`)
				assert.equal(metrics.title, title)
				assert.equal(metrics.logoWidth, 64)
				assert.deepEqual(metrics.brokenImages, [])
				assert.equal(metrics.headerHeight, 96)
				assert.equal(metrics.tabColor, theme === 'dark' ? 'rgb(23, 33, 43)' : 'rgb(255, 255, 255)')
				assert.deepEqual(metrics.tabs, ['首页','练习','考试','错题','设置'])
				assert.deepEqual(metrics.undersized, [])
				assert.equal(metrics.theme, theme === 'dark' ? '#0f1720' : '#f7f9fc')
				assert.equal(Number(metrics.font), font === 'large' ? 1.14 : font === 'small' ? 0.92 : 1)
				const filename = `${route}-${width}x${height}-${theme}-${font}.png`
				await page.screenshot(join(out, filename))
				rows.push({
					route,
					width,
					height,
					theme,
					font,
					filename,
					...metrics,
					brand
				})
			}
			console.log(`PASS ${width}x${height} ${theme}/${font} — 5 pages`)
			await page.send('Page.removeScriptToEvaluateOnNewDocument', {
				identifier: fixture.identifier
			})
		}
	assert.deepEqual(page.exceptions(), [])
	const errors = (await page.errors()).filter(e => !/favicon/i.test(e.text))
	assert.deepEqual(errors, [])
	writeFileSync(join(root, 'docs/reports/H5_VISUAL_V2.json'), JSON.stringify({
		date: '2026-10-15',
		status: 'PASS',
		screenshots: rows.length,
		rows
	}, null, 2))
	console.log(`${rows.length} screenshots; no overflow or runtime exceptions`)
} finally {
	await page.close();
	await browser.close();
	await server.close()
}
