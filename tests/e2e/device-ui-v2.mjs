import assert from 'node:assert/strict'
import {
	execFileSync
} from 'node:child_process'
import {
	mkdirSync,
	writeFileSync
} from 'node:fs'
import {
	resolve,
	join
} from 'node:path'
import {
	listTargets,
	attachTarget
} from '../support/cdp.mjs'

const root = resolve(import.meta.dirname, '../..'),
	out = join(root, 'docs/screenshots/android-v2')
mkdirSync(out, {
	recursive: true
})
const keepOnline = process.argv.includes('--keep-online')
const pkg = 'io.dcloud.HBuilder',
	port = 9273,
	rows = []
const sleep = ms => new Promise(r => setTimeout(r, ms))
const adb = (...args) => execFileSync('adb', args, {
	encoding: 'utf8'
})
const check = (name, details) => {
	rows.push({
		name,
		status: 'PASS',
		details
	});
	console.log('PASS ' + name + ' — ' + details)
}
const shot = name => writeFileSync(join(out, name + '.png'), execFileSync('adb', ['exec-out', 'screencap',
	'-p'
]))

function forward() {
	const pid = adb('shell', 'pidof', pkg).trim();
	adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`)
}
async function launch() {
	adb('shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1');
	await sleep(4500);
	forward()
}
async function page(route) {
	for (let retry = 0; retry < 40; retry++) {
		const targets = await listTargets(port)
		for (let i = 0; i < targets.length; i++)
			if (targets[i].title.includes(`pages/${route}/index`)) {
				const p = await attachTarget(port, {
					index: i
				});
				await p.enable();
				return p
			}
		await sleep(500)
	}
	throw Error('Missing native WebView: ' + route)
}
let tabs = {}
async function nativeTabs() {
	adb('shell', 'uiautomator', 'dump', '/sdcard/nucpharm-ui-v2.xml')
	const xml = adb('shell', 'cat', '/sdcard/nucpharm-ui-v2.xml')
	const rx = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g
	for (const m of xml.matchAll(rx))
		if (['首页', '练习', '考试', '错题', '设置'].includes(m[1])) tabs[m[1]] = {
			x: (+m[2] + +m[4]) / 2,
			y: (+m[3] + +m[5]) / 2
		}
	assert.equal(Object.keys(tabs).length, 5)
	assert.ok(!xml.includes('text="我的"'))
}
async function tab(name, route) {
	const pos = tabs[name];
	adb('shell', 'input', 'tap', String(Math.round(pos.x)), String(Math.round(pos.y)));
	await sleep(1000);
	return page(route)
}
async function tapText(p, text) {
	const rect = await p.evaluate(
		`(()=>{const hits=[...document.querySelectorAll('*')].filter(e=>(e.innerText||'').trim()===${JSON.stringify(text)});const el=hits.reverse().find(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.width>0});if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`
		)
	assert.ok(rect, 'Native text missing: ' + text);
	await p.tapPoint(rect.x, rect.y);
	await sleep(500)
}
let isolated = false,
	error = null
const network = {
	wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').trim(),
	data: adb('shell', 'settings', 'get', 'global', 'mobile_data').trim(),
	airplane: adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').trim()
}
try {
	execFileSync('python', ['scripts/device-storage.py', 'isolate'], {
		cwd: root,
		stdio: 'inherit'
	});
	isolated = true
	await launch();
	await nativeTabs()
	check('五个原生Tab', '首页 / 练习 / 考试 / 错题 / 设置；没有我的')
	for (const [name, route] of [
			['首页', 'home'],
			['练习', 'study'],
			['考试', 'exam'],
			['错题', 'mistakes'],
			['设置', 'settings']
		]) {
		const p = await tab(name, route)
		const metrics = await p.evaluate(
			`({title:document.querySelector('.hdr-title').innerText,logo:document.querySelector('.hdr-logo').getBoundingClientRect().width,w:innerWidth,sw:document.documentElement.scrollWidth})`
			)
		assert.equal(metrics.title, name);
		assert.equal(metrics.logo, 64);
		assert.ok(metrics.sw <= metrics.w + 1)
		shot('01-' + route);
		check('一级页 ' + name, JSON.stringify(metrics));
		await p.close()
	}
	let p = await tab('设置', 'settings')
	await tapText(p, '深色');
	assert.ok((await p.evaluate(`document.querySelector('.np-page').className`)).includes('np-dark'))
	await tapText(p, '大');
	shot('02-settings-dark-large');
	await p.close()
	p = await tab('练习', 'study');
	assert.ok((await p.evaluate(`document.querySelector('.np-page').className`)).includes('np-dark'))
	await tapText(p, '开始练习');
	await p.close();
	await sleep(1000)
	p = await page('question');
	const large = parseFloat(await p.evaluate(
		`getComputedStyle(document.querySelector('.card-stem')).fontSize`));
	assert.ok(large > 16)
	await p.tapCss('.options .opt');
	assert.ok(/回答正确|回答错误/.test(await p.text()));
	shot('03-practice-judged')
	await p.tapCss('.hdr-back');
	await p.close();
	check('主题字号与练习判分', `深色跨Tab生效，大字号题干 ${large}px，作答结果可见`)
	p = await tab('设置', 'settings');
	await tapText(p, '浅色');
	await tapText(p, '标准');
	await p.close()
	p = await tab('考试', 'exam');
	await tapText(p, '开始考试');
	await p.close();
	await sleep(1200)
	p = await page('exam-session');
	assert.ok(!(await p.text()).includes('正确答案'));
	await p.tapCss('.options .opt');
	await p.tapCss('.op');
	await tapText(p, '答题卡');
	assert.equal(await p.count('.cell'), 70);
	shot('04-exam-navigator');
	await p.tapCss('.sheet-close')
	const clock = () => p.evaluate(`document.body.innerText.match(/\\d{2}:\\d{2}/)?.[0]`)
	const before = await clock();
	const seconds = t => t.split(':').reduce((s, v) => s * 60 + Number(v), 0)
	await p.close();
	adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
	await sleep(25000);
	await launch();
	p = await page('exam-session')
	const after = await clock();
	assert.ok(seconds(before) - seconds(after) >= 25);
	shot('05-exam-resume');
	check('考试结构和后台恢复', `70格答题卡；${before} → ${after}；考试中无答案展示`)
	await tapText(p, '交卷');
	assert.ok((await p.text()).includes('未作答'));
	await p.tapCss('.dlg-btn.np-btn-primary');
	await p.close();
	await sleep(1200)
	p = await page('exam-result');
	assert.ok((await p.text()).includes('本次得分'));
	shot('06-result');
	await p.evaluate(`document.querySelector('.action-btn.np-btn-primary').scrollIntoView({block:'center'})`)
	await sleep(500)
	await p.tapCss('.action-btn.np-btn-primary');
	await p.close();
	await sleep(1000)
	p = await page('exam-review');
	assert.equal(await p.count('.review-item'), 70);
	shot('07-review');
	await p.tapCss('.hdr-back');
	await p.close()
	p = await page('exam-result');
	await tapText(p, '返回考试页');
	await p.close();
	check('交卷成绩复盘', '未答确认 → 动态成绩 → 原顺序70题复盘')
	p = await tab('设置', 'settings');
	await tapText(p, '清理考试历史');
	assert.ok((await p.text()).includes('保留未完成考试'));
	await p.tapCss('.dlg-btn.np-btn-plain');
	await p.close();
	check('危险操作取消', '考试历史清理弹窗取消，保留已有记录')
	if (!keepOnline) {
	// 基座离线验证；正式包还需自有签名 APK，报告明确区分。
	adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
	adb('shell', 'svc', 'wifi', 'disable');
	adb('shell', 'svc', 'data', 'disable')
	assert.equal(adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').trim(), '1')
	adb('shell', 'am', 'force-stop', pkg);
	await launch();
	await nativeTabs()
	p = await tab('首页', 'home');
	assert.ok((await p.text()).includes('620'));
	shot('08-offline-cold-home');
	await p.close()
	p = await tab('考试', 'exam');
	await tapText(p, '开始考试');
	await p.close();
	await sleep(1000)
	p = await page('exam-session');
	await p.tapCss('.options .opt');
	await tapText(p, '交卷');
	await p.tapCss('.dlg-btn.np-btn-primary');
	await p.close();
	await sleep(1000)
	p = await page('exam-result');
	await p.evaluate(`document.querySelector('.action-btn.np-btn-primary').scrollIntoView({block:'center'})`)
	await sleep(500)
	await p.tapCss('.action-btn.np-btn-primary');
	await p.close();
	await sleep(1000)
	p = await page('exam-review');
	assert.equal(await p.count('.review-item'), 70);
	shot('09-offline-review');
	await p.close();
	check('基座飞行模式闭环', '冷启动 → 新考试 → 作答 → 交卷 → 成绩 → 70题复盘')
	} else rows.push({name:'基座飞行模式闭环',status:'N/A',details:'--keep-online 跳过网络切换'})
} catch (e) {
	error = e;
	rows.push({
		name: '执行错误',
		status: 'FAIL',
		details: String(e.message)
	});
	console.error(e)
} finally {
	if (isolated) {
		try {
			execFileSync('python', ['scripts/device-storage.py', 'restore'], {
				cwd: root,
				stdio: 'inherit'
			});
			check('原学习数据恢复', '按核药通键前缀精确恢复；数据库写回字节核对通过')
		} catch (e) {
			error = error || e;
			rows.push({
				name: '恢复数据',
				status: 'FAIL',
				details: String(e)
			})
		}
	}
	try {
		adb('shell', 'cmd', 'connectivity', 'airplane-mode', network.airplane === '1' ? 'enable' : 'disable');
		adb('shell', 'svc', 'wifi', network.wifi === '0' ? 'disable' : 'enable');
		adb('shell', 'svc', 'data', network.data === '0' ? 'disable' : 'enable');
		await launch()
	} catch (e) {
		rows.push({
			name: '恢复网络',
			status: 'FAIL',
			details: String(e)
		});
		error = error || e
	}
	writeFileSync(join(root, 'docs/reports/ANDROID_UI_V2.json'), JSON.stringify({
		date: '2026-10-15',
		model: adb('shell', 'getprop', 'ro.product.model').trim(),
		android: adb('shell', 'getprop', 'ro.build.version.release').trim(),
		size: adb('shell', 'wm', 'size').trim(),
		runtime: 'HBuilderX 5.26 standard playground io.dcloud.HBuilder 15.26',
		status: error ? 'FAIL' : 'PASS',
		rows
	}, null, 2))
}
if (error) process.exitCode = 1
