import test from 'node:test'
import assert from 'node:assert/strict'
import {
	existsSync,
	mkdirSync
} from 'node:fs'
import {
	join,
	resolve
} from 'node:path'

import {
	launchBrowser,
	openPage,
	startStaticServer,
	findBrowser
} from '../support/cdp.mjs'
import {
	writeReport,
	table
} from '../support/reports.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const WEB_DIR = join(ROOT, 'unpackage', 'dist', 'build', 'web')
const SHOT_DIR = join(ROOT, 'docs', 'screenshots')

/** 覆盖 5 个 Tab 页与 4 个二级页；每个页面断言其标志性文案 */
const routes = [{
		name: '首页',
		hash: '#/pages/home/index',
		expects: ['核药通', '把专业知识，练成实力。', '模拟考试', '顺序练习']
	},
	{
		name: '练习',
		hash: '#/pages/study/index',
		expects: ['题型筛选', '顺序练习', '随机练习', '错题练习']
	},
	{
		name: '考试',
		hash: '#/pages/exam/index',
		expects: ['试卷结构', '40 题 × 1 分', '70 题', '100 分']
	},
	{
		name: '错题本',
		hash: '#/pages/mistakes/index',
		expects: ['错题本', '开始错题练习']
	},
	{
		name: '旧路由兼容',
		hash: '#/pages/me/index',
		expects: ['学习总览', '题库与关于', '数据自检']
	},
	{
		name: '设置',
		hash: '#/pages/settings/index',
		expects: ['外观', '答题偏好', '数据管理', '题库与关于']
	},
	{
		name: '答题页-顺序',
		hash: '#/pages/question/index?mode=sequence&type=single',
		expects: ['单选题', '答题卡', '下一题']
	},
	{
		name: '答题页-随机多选',
		hash: '#/pages/question/index?mode=random&type=multiple&count=20',
		expects: ['多选题', '确定答案']
	},
	{
		name: '考试进行中',
		hash: '#/pages/exam-session/index?fresh=1',
		expects: ['剩余', '交卷', '答题卡']
	}
]

test('H5 冒烟：构建产物在移动端视口下逐页渲染正常、无横向溢出', async (t) => {
	if (!existsSync(WEB_DIR)) {
		t.skip('尚未构建 H5 产物（unpackage/dist/build/web），请先执行 HBuilderX CLI publish web')
		return
	}
	if (!findBrowser()) {
		t.skip('本机未找到 Edge/Chrome，无法执行浏览器端冒烟测试')
		return
	}
	mkdirSync(SHOT_DIR, {
		recursive: true
	})

	const server = await startStaticServer(WEB_DIR, 0)
	const browser = await launchBrowser()
	const rows = []

	try {
		for (const route of routes) {
			const page = await openPage(browser.port)
			try {
				await page.enable()
				await page.setViewport({
					width: 390,
					height: 844,
					dpr: 1,
					mobile: true
				})
				await page.goto(`http://127.0.0.1:${server.port}/index.html${route.hash}`, {
					waitForText: route.expects[0]
				})

				const text = await page.text()
				const missing = route.expects.filter((item) => !text.includes(item))
				assert.deepEqual(missing, [], `${route.name} 缺少渲染内容：${missing.join('、')}`)

				const metrics = await page.evaluate(
					'({ w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth, tabs: document.querySelectorAll(".uni-tabbar__item").length })'
				)
				// 视口与文档宽度一致 = 无横向溢出（移动端最常见的布局缺陷）
				assert.equal(
					metrics.sw <= metrics.w + 1,
					true,
					`${route.name} 出现横向溢出：视口 ${metrics.w}，文档宽 ${metrics.sw}`
				)
				const errors = (await page.errors()).filter((m) => !
					/favicon|Failed to load resource/i.test(m.text))
				assert.deepEqual(errors, [], `${route.name} 出现运行期错误`)

				rows.push([route.name, `${metrics.w}×${metrics.h}`, String(metrics.sw), String(
					metrics.tabs), 'PASS'])
			} finally {
				await page.close()
			}
		}

		// 首页必须展示 620 题题库规模，证明题库已离线内置
		const page = await openPage(browser.port)
		try {
			await page.enable()
			await page.setViewport({
				width: 390,
				height: 844,
				dpr: 1,
				mobile: true
			})
			await page.goto(`http://127.0.0.1:${server.port}/index.html#/pages/home/index`, {
				waitForText: '题库学习覆盖率'
			})
			const text = await page.text()
			assert.ok(text.includes('620'), '首页应展示 620 题题库规模')
		} finally {
			await page.close()
		}
	} finally {
		await browser.close()
		await server.close()
	}

	writeReport('H5_E2E_V2.md', 'H5（iOS Safari 网页端）端到端冒烟测试报告', [
		'- 测试方式：本机静态服务器 + CDP 驱动真实 Edge 无头浏览器，移动端视口 390×844，加载构建产物 `unpackage/dist/build/web`。',
		'- 路由模式：hash（iOS Safari 刷新不会白屏）；页面为相对路径引用，可放在任意子目录部署。',
		`- 覆盖路由：${routes.length} 个（5 个 Tab 页 + 4 个二级页）`,
		'',
		...table(['页面', '视口', '文档宽度', '底部导航项', '结果'], rows),
		'',
		'- 每页同时断言：无横向溢出（文档宽 ≤ 视口宽）、无运行期控制台错误。',
		'- 说明：以上为真实浏览器渲染结果，非模拟数据；iPhone 真机 Safari 验收需在 iOS 设备上复测，见 docs/DEVICE_TEST_REPORT.md。',
		'',
		'结论：PASS'
	])
})
