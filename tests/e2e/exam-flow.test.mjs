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

const steps = []

function step(name, detail, ok) {
	steps.push([name, detail, ok ? 'PASS' : 'FAIL'])
}

test('H5 真实浏览器交互：完整走通「练习 → 模拟考试 → 交卷 → 复盘」', async (t) => {
	if (!existsSync(WEB_DIR)) {
		t.skip('尚未构建 H5 产物')
		return
	}
	if (!findBrowser()) {
		t.skip('本机未找到 Edge/Chrome')
		return
	}
	mkdirSync(SHOT_DIR, {
		recursive: true
	})

	const server = await startStaticServer(WEB_DIR, 0)
	const browser = await launchBrowser()
	const page = await openPage(browser.port)

	try {
		await page.enable()
		await page.setViewport({
			width: 390,
			height: 844,
			dpr: 1,
			mobile: true
		})

		// ---------- 1. 首页 ----------
		await page.goto(`http://127.0.0.1:${server.port}/index.html#/pages/home/index`, {
			waitForText: '模拟考试'
		})
		const tabs = await page.count('.uni-tabbar__item')
		assert.equal(tabs, 5, '底部导航必须有 5 个入口')
		const homeText = await page.text()
		assert.ok(homeText.includes('把专业知识，练成实力。'), '首页应显示标语')
		step('首页渲染', '5 个底部入口 / 标语 / 题库进度', true)

		// ---------- 2. 顺序练习作答 ----------
		await page.clickText('顺序练习')
		await page.waitForText('答题卡')
		const stemBefore = await page.evaluate(
			'(document.querySelector(".card-stem") || {}).innerText || ""'
		)
		assert.ok(stemBefore.length > 4, '答题页应渲染题干')
		await page.clickNth('.options .opt', 0)
		await page.waitForText('试题详解')
		const afterAnswer = await page.text()
		assert.ok(
			afterAnswer.includes('回答正确') || afterAnswer.includes('回答错误'),
			'作答后应给出判定结果'
		)
		assert.ok(afterAnswer.includes('正确答案'), '应展示正确答案')
		const answersRaw = await page.storage('nucpharm:v1:answers')
		assert.ok(answersRaw && answersRaw.length > 10, '作答记录应写入本地存储')
		await page.screenshot(join(SHOT_DIR, 'e2e-01-练习作答.png'))
		step('顺序练习作答', '题干渲染 / 判定结果 / 解析 / 本地存储写入', true)

		// ---------- 3. 收藏与错题本 ----------
		await page.clickText('☆ 收藏')
		await page.waitForText('已收藏')
		const favRaw = await page.storage('nucpharm:v1:favorites')
		assert.ok(favRaw && JSON.parse(favRaw).length >= 1, '收藏应写入本地存储')
		step('收藏', '收藏按钮生效并持久化', true)

		// 返回（答题页是二级页，没有底部导航，先通过返回键回到 Tab 页）
		await page.clickSelector('.hdr-back')
		await page.waitForText('快速开始')
		await page.clickNth('.uni-tabbar__item', 3) // 错题
		await page.waitForText('错题本')
		await page.screenshot(join(SHOT_DIR, 'e2e-02-错题本.png'))
		step('错题本页', '入口可达并渲染统计与列表', true)

		// ---------- 4. 模拟考试 ----------
		await page.clickNth('.uni-tabbar__item', 2) // 考试
		await page.waitForText('试卷结构')
		const examRuleText = await page.text()
		assert.ok(examRuleText.includes('40 题 × 1 分'), '考试页应展示单选配额')
		assert.ok(examRuleText.includes('100 分'), '考试页应展示满分')
		await page.screenshot(join(SHOT_DIR, 'e2e-03-考试入口.png'))

		await page.clickText('开始考试')
		await page.waitForUrlContains('/pages/exam-session/index')
		await page.waitForText('剩余')
		const sessionText = await page.text()
		assert.ok(/1 \/ 70/.test(sessionText), '考试页应显示题号进度 1 / 70')
		assert.ok(/剩余\s*\d{2}:\d{2}/.test(sessionText.replace(/\s+/g, ' ')), '应显示倒计时')
		step('进入考试', '生成 70 题试卷 / 倒计时 / 题号进度', true)

		// 答题卡应恰好 70 格
		await page.clickText('答题卡')
		await page.waitForText('已答')
		const cells = await page.count('.cell')
		assert.equal(cells, 70, '答题卡矩阵应有 70 个题号')
		await page.screenshot(join(SHOT_DIR, 'e2e-04-答题卡.png'))
		await page.clickSelector('.sheet-close')
		step('答题卡', `矩阵 ${cells} 格`, true)

		// 作答若干题（含标记），再交卷
		endorseLoop: for (let i = 0; i < 5; i += 1) {
			await page.clickNth('.options .opt', 0)
			await page.clickText('☆ 标记本题')
			if (i < 4) await page.clickText('下一题')
		}
		const flaggedText = await page.text()
		assert.ok(flaggedText.includes('★ 已标记'), '标记状态应可切换')

		const activeRaw = await page.storage('nucpharm:v1:active-exam')
		assert.ok(activeRaw && activeRaw.includes('paperIds'), '进行中的考试应持久化（退后台可恢复）')
		step('考试作答', '选项写入 / 标记 / 会话快照持久化', true)

		await page.clickText('交卷')
		await page.waitForText('确认交卷')
		const confirmText = await page.text()
		assert.ok(/未作答/.test(confirmText), '交卷确认应提示未作答数量')
		await page.clickText('确认交卷')
		await page.waitForUrlContains('/pages/exam-result/index', 20000)
		await page.waitForText('本次得分')
		const resultText = await page.text()
		assert.ok(/\/ 100/.test(resultText), '成绩页应显示 100 分满分')
		assert.ok(/正确率/.test(resultText), '成绩页应显示正确率')
		await page.screenshot(join(SHOT_DIR, 'e2e-05-成绩.png'))

		const historyRaw = await page.storage('nucpharm:v1:exams')
		assert.ok(historyRaw && JSON.parse(historyRaw).length === 1, '应写入 1 条考试历史')
		const snapshotsRaw = await page.storage('nucpharm:v1:exam-snapshots')
		assert.ok(snapshotsRaw && Object.keys(JSON.parse(snapshotsRaw)).length === 1, '应保存试卷快照')
		const activeAfter = await page.storage('nucpharm:v1:active-exam')
		assert.ok(
			activeAfter === null || activeAfter === '' || activeAfter === 'null',
			`交卷后应清除进行中的考试快照，实际：${String(activeAfter).slice(0, 40)}`
		)
		step('交卷与成绩', '成绩页渲染 / 历史 1 条 / 快照 1 条 / 活动会话已清除', true)

		// ---------- 5. 复盘 ----------
		await page.clickTextContains('查看试卷复盘')
		await page.waitForUrlContains('/pages/exam-review/index')
		await page.waitForText('试卷复盘')
		const reviewItems = await page.count('.review-item')
		assert.equal(reviewItems, 70, '复盘页应逐题列出 70 题')
		await page.clickTextContains('只看错题')
		const wrongItems = await page.count('.review-item')
		assert.ok(wrongItems >= 1 && wrongItems <= 70, '错题筛选应返回合理数量')
		await page.screenshot(join(SHOT_DIR, 'e2e-06-复盘.png'))
		step('试卷复盘', `全部 ${reviewItems} 题 / 错题筛选 ${wrongItems} 题`, true)

		// ---------- 6. 题目来源与解析可追溯 ----------
		await page.clickTextContains('全部（')
		await page.evaluate('document.querySelectorAll(".explain-head")[0].click()')
		await page.waitForText('题源：')
		step('解析与溯源', '复盘页可展开详解并显示题源文件与定位', true)

		// ---------- 7. 运行期错误检查 ----------
		const errors = (await page.errors()).filter(
			(m) => !/favicon|Failed to load resource/i.test(m.text)
		)
		assert.deepEqual(errors, [], `页面出现运行期错误：${JSON.stringify(errors)}`)
		step('控制台错误', '无运行期错误', true)
	} finally {
		await page.close()
		await browser.close()
		await server.close()
	}

	writeReport('H5_EXAM_FLOW_V2.md', 'H5 端到端交互测试（练习 → 考试 → 交卷 → 复盘）', [
		'- 测试方式：CDP 驱动真实 Edge 浏览器，移动端视口 390×844，加载构建产物 `unpackage/dist/build/web`。',
		'- 交互均为真实点击（dispatch MouseEvent）与真实本地存储读写，非模拟桩。',
		'',
		...table(['步骤', '校验内容', '结果'], steps),
		'',
		'截图证据：docs/screenshots/e2e-01-练习作答.png、e2e-02-错题本.png、e2e-03-考试入口.png、e2e-04-答题卡.png、e2e-05-成绩.png、e2e-06-复盘.png',
		'',
		'结论：PASS'
	])
})
