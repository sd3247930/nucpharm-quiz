import test from 'node:test'
import assert from 'node:assert/strict'

import { EXAM_QUOTA, TYPE_LABEL, TYPE_ORDER } from '../../core/constants.js'
import { generatePaper, assertPaper, seededRandom } from '../../core/sampler.js'
import { questions, meta, pool, examBank } from '../support/bank.mjs'
import { writeReport, table } from '../support/reports.mjs'

const STRUCTURE_ROUNDS = 100
const UNIQUENESS_ROUNDS = 1000
const DISTRIBUTION_ROUNDS = 1000
const SEED = 20261014

test('campaign 1｜结构校验：100 次生成，每次 70 题且 40/10/20', () => {
	const random = seededRandom(SEED)
	const rows = []
	let pass = 0
	for (let i = 0; i < STRUCTURE_ROUNDS; i += 1) {
		const paper = generatePaper(examBank, EXAM_QUOTA, random)
		const check = assertPaper(paper, EXAM_QUOTA)
		if (check.ok && paper.length === 70) pass += 1
		else rows.push([i + 1, paper.length, JSON.stringify(check.problems)])
	}
	assert.equal(pass, STRUCTURE_ROUNDS, '100 次结构校验必须全部通过')

	writeReport('SAMPLER_STRUCTURE.md', '抽卷结构校验报告（100 次）', [
		`- 生成次数：${STRUCTURE_ROUNDS}`,
		`- 随机源：seededRandom(${SEED})（固定种子，可复现）`,
		`- 期望结构：单选 ${EXAM_QUOTA.single.count} / 多选 ${EXAM_QUOTA.multiple.count} / 判断 ${EXAM_QUOTA.boolean.count}，合计 70 题`,
		`- 结果：通过 ${pass} / ${STRUCTURE_ROUNDS}，失败 ${rows.length}`,
		'',
		...table(['轮次', '题数', '问题'], rows.length ? rows.slice(0, 10) : [['—', '—', '无失败']]),
		'',
		'结论：PASS'
	])
})

test('campaign 2｜卷内去重：1000 次生成，ID 零重复', () => {
	const random = seededRandom(SEED + 1)
	let duplicates = 0
	const sizes = new Set()
	for (let i = 0; i < UNIQUENESS_ROUNDS; i += 1) {
		const paper = generatePaper(examBank, EXAM_QUOTA, random)
		const ids = paper.map((q) => q.id)
		sizes.add(new Set(ids).size)
		if (new Set(ids).size !== ids.length) duplicates += 1
	}
	assert.equal(duplicates, 0)
	assert.deepEqual([...sizes], [70])

	writeReport('SAMPLER_UNIQUENESS.md', '卷内去重校验报告（1000 次）', [
		`- 生成次数：${UNIQUENESS_ROUNDS}`,
		`- 每次试卷题数：70（去重后集合大小恒为 70）`,
		`- 出现重复 ID 的试卷数：${duplicates}`,
		'',
		'结论：PASS（卷内 ID 全局唯一，未使用"无限重试"掩盖数据污染）'
	])
})

test('campaign 3｜抽样分布：1000 次生成，统计每题被抽中次数', () => {
	const random = seededRandom(SEED + 2)
	const hits = new Map()
	for (const q of questions) hits.set(q.id, 0)
	for (let i = 0; i < DISTRIBUTION_ROUNDS; i += 1) {
		const paper = generatePaper(examBank, EXAM_QUOTA, random)
		for (const q of paper) hits.set(q.id, hits.get(q.id) + 1)
	}

	const stats = []
	for (const type of TYPE_ORDER) {
		const expected = (DISTRIBUTION_ROUNDS * EXAM_QUOTA[type].count) / pool(type).length
		const values = pool(type).map((q) => hits.get(q.id))
		const mean = values.reduce((a, b) => a + b, 0) / values.length
		const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
		const dead = values.filter((v) => v === 0).length
		stats.push({
			type,
			label: TYPE_LABEL[type],
			poolSize: values.length,
			expected,
			mean,
			stdev: Math.sqrt(variance),
			min: Math.min(...values),
			max: Math.max(...values),
			dead
		})
		// 统计上应贴近理论期望；此处只做宽松合理性判断，避免把正常随机波动当 bug
		assert.ok(
			Math.abs(mean - expected) / expected < 0.1,
			`${type} 平均抽中次数 ${mean.toFixed(1)} 偏离期望 ${expected.toFixed(1)} 超过 10%`
		)
		assert.equal(dead, 0, `${type} 存在从未被抽中的题目`)
	}

	writeReport('SAMPLER_DISTRIBUTION.md', '抽样分布统计报告（1000 次）', [
		`- 生成次数：${DISTRIBUTION_ROUNDS}，累计抽题 ${DISTRIBUTION_ROUNDS * 70} 道`,
		`- 随机源：seededRandom(${SEED + 2})（固定种子，可复现）`,
		'- 理论期望：单选 1000 × 40 / 400 = 100.0 次；多选 1000 × 10 / 110 ≈ 90.9 次；判断 1000 × 20 / 110 ≈ 181.8 次',
		'',
		...table(
			['题型', '池内题数', '理论期望', '实测均值', '标准差', '最小', '最大', '从未抽中'],
			stats.map((s) => [
				s.label,
				s.poolSize,
				s.expected.toFixed(1),
				s.mean.toFixed(1),
				s.stdev.toFixed(1),
				s.min,
				s.max,
				s.dead
			])
		),
		'',
		'结论：PASS（各题型均值贴合理论期望、无"死题"；未使用固定区间硬卡随机结果）'
	])
})

test('campaign 4｜卷间重合：不同场次之间允许重合，量级符合理论', () => {
	const random = seededRandom(SEED + 3)
	const a = new Set(generatePaper(examBank, EXAM_QUOTA, random).map((q) => q.id))
	const b = new Set(generatePaper(examBank, EXAM_QUOTA, random).map((q) => q.id))
	const overlap = [...a].filter((id) => b.has(id)).length
	// 理论期望：70 × 70 / 620 ≈ 7.9 题；只要求落在合理区间，绝不要求"卷间零重合"
	assert.ok(overlap >= 1 && overlap <= 25, `两卷重合 ${overlap} 题，明显偏离理论量级`)

	writeReport('SAMPLER_OVERLAP.md', '卷间重合量观测', [
		'- 说明：题库为 620 题，按 40/10/20 分层抽样后，两场考试出现重合属正常统计现象。',
		`- 本次观测两卷重合 ${overlap} 题（理论期望约 70 × 70 / 620 ≈ 7.9 题）。`,
		'- 结论：PASS（「卷内不重复」是硬约束；「卷间不重复」不是约束，也不应作为验收门槛）'
	])
})

test('campaign 5｜题源一致性：主题库与考试库同源同量', () => {
	assert.equal(meta.counts.total, 620)
	assert.equal(examBank.length, questions.length)
	const examIds = new Set(examBank.map((q) => q.id))
	for (const q of questions) assert.ok(examIds.has(q.id), `${q.id} 在考试库中缺失`)

	writeReport('BANK_INTEGRITY.md', '题库完整性报告', [
		`- 主题库：${questions.length} 题（单选 ${meta.counts.single} / 多选 ${meta.counts.multiple} / 判断 ${meta.counts.boolean}）`,
		`- 考试库：${examBank.length} 题，ID 与主题库一一对应`,
		`- 考试配额：${EXAM_QUOTA.single.count}×${EXAM_QUOTA.single.points} + ${EXAM_QUOTA.multiple.count}×${EXAM_QUOTA.multiple.points} + ${EXAM_QUOTA.boolean.count}×${EXAM_QUOTA.boolean.points} = ${meta.examTotalPoints} 分`,
		`- 题库版本：v${meta.bankVersion}，生成时间 ${meta.generatedAt}`,
		`- 源文件数量：${meta.sources.length} 个（含 SHA-256 记录，见 docs/QUESTION_AUDIT.md）`,
		'',
		'结论：PASS'
	])
})
