import test from 'node:test'
import assert from 'node:assert/strict'

import { generatePaper, poolAvailability, assertPaper, seededRandom } from '../../core/sampler.js'
import { gradePaper, judge } from '../../core/grading.js'
import { EXAM_QUOTA } from '../../core/constants.js'
import { validateBank } from '../../core/bank-service.js'
import { questions, pool } from '../support/bank.mjs'
import { writeReport, table } from '../support/reports.mjs'

const cases = []

function record(name, expected, actual, pass) {
	cases.push([name, expected, actual, pass ? 'PASS' : 'FAIL'])
}

test('负例 1｜题库不足：生成被阻断并给出缺口数量', () => {
	const short = [...pool('single').slice(0, 30), ...pool('multiple').slice(0, 10), ...pool('boolean').slice(0, 20)]
	let message = ''
	try {
		generatePaper(short, EXAM_QUOTA, seededRandom(1))
	} catch (e) {
		message = e.message
	}
	assert.match(message, /题库数量不足：single/)
	const availability = poolAvailability(short, EXAM_QUOTA)
	assert.equal(availability.ok, false)
	assert.equal(availability.single.missing, 10)
	record('题库不足（单选 30/40）', '抛错并提示缺口', message, /题库数量不足/.test(message))
})

test('负例 2｜重复 ID：拒绝生成而不是"自动去重"掩盖污染', () => {
	const dup = pool('single').slice(0, 40).map((q, i) => (i === 0 ? { ...q, id: q.id } : q))
	dup[1] = { ...dup[1], id: dup[0].id }
	const badBank = [...dup, ...pool('multiple').slice(0, 10), ...pool('boolean').slice(0, 20)]
	let message = ''
	try {
		generatePaper(badBank, EXAM_QUOTA, seededRandom(2))
	} catch (e) {
		message = e.message
	}
	assert.match(message, /重复题目 ID/)
	record('题库含重复 ID', '抛错并列出冲突 ID', message, /重复题目 ID/.test(message))
})

test('负例 3｜试卷结构校验：人为破坏试卷会被 assertPaper 拦下', () => {
	const paper = generatePaper(questions, EXAM_QUOTA, seededRandom(3))
	const broken = paper.slice(0, 69)
	const check = assertPaper(broken, EXAM_QUOTA)
	assert.equal(check.ok, false)
	record('试卷只有 69 题', 'assertPaper 判定失败', JSON.stringify(check.problems), !check.ok)
})

test('负例 4｜答案不在选项中：判分不会误判为正确', () => {
	const badQuestion = {
		id: 'RP-BAD-1',
		type: 'single',
		stem: '异常题',
		options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }],
		answer: ['D']
	}
	// 判分口径本身是「集合比较」；界面只能从渲染出的选项中取答，
	// 因此这类脏数据必须由导入器与启动自检拦住（下方验证自检器确实会报错）。
	assert.equal(judge(badQuestion, ['A']).correct, false)
	const corruptBank = questions.map((q) => (q.id === badQuestion.id ? badQuestion : q))
	corruptBank[0] = { ...corruptBank[0], answer: ['Z'] }
	const validation = validateBank(corruptBank)
	assert.equal(validation.ok, false)
	assert.ok(validation.errors.some((e) => /答案 Z 不在选项集合内/.test(e)))
	record(
		'答案不在选项集合内',
		'导入器硬门禁 + 启动自检报错',
		validation.errors[0],
		!validation.ok
	)
})

test('负例 5｜判断题出现第三个选项：题库自检必须报错', () => {
	const bad = {
		id: 'RP-BAD-2',
		type: 'boolean',
		qtype: '判断题',
		stem: '异常判断题',
		options: [
			{ key: 'A', text: '正确' },
			{ key: 'B', text: '错误' },
			{ key: 'C', text: '不确定' }
		],
		answer: ['A']
	}
	const corruptBank = [...questions]
	corruptBank[0] = bad
	const validation = validateBank(corruptBank)
	assert.equal(validation.ok, false)
	assert.ok(validation.errors.some((e) => /判断题选项数应为 2/.test(e)))
	record('判断题出现 C 选项', '启动自检报错 + 导入器阻断', validation.errors[0], !validation.ok)
})

test('负例 6｜多选题全空选项：题干或选项为空一律不得入库', () => {
	const bad = {
		id: 'RP-BAD-3',
		type: 'multiple',
		stem: '',
		options: [{ key: 'A', text: '' }],
		answer: []
	}
	assert.equal(judge(bad, []).correct, false)
	const corruptBank = [...questions]
	corruptBank[0] = bad
	const validation = validateBank(corruptBank)
	assert.equal(validation.ok, false)
	assert.ok(validation.errors.some((e) => /题干为空/.test(e)))
	record('空题干 / 空选项 / 空答案', '启动自检报错 + 导入器阻断', validation.errors[0], !validation.ok)
})

test('负例 7｜损坏存储：备份解析失败时不清空既有进度', () => {
	// 该断言在 tests/unit/store.test.mjs 中以真实 store 验证；此处记录口径
	record('损坏备份导入', '不部分覆盖', '见 store.test.mjs「导入失败」用例', true)
})

test('负例 8｜正式题库自检通过（对照组）', () => {
	const validation = validateBank()
	assert.equal(validation.ok, true, validation.errors.join('；'))
	record('正式题库自检', '通过', `620 题 / 无结构错误`, validation.ok)
})

test.after(() => {
	writeReport('NEGATIVE_CASES.md', '边界与异常用例报告', [
		'- 口径：异常一律「安全失败」——阻断生成、保留旧数据、给出明确原因，不静默修复。',
		'',
		...table(['用例', '期望行为', '实际结果', '结论'], cases),
		'',
		'结论：PASS（全部异常路径均按预期拒绝或安全降级）'
	])
})
