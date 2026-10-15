/**
 * 测试用的题库加载器（直接读生成产物，与应用运行时同源）。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')

function readJSON(relative) {
	return JSON.parse(readFileSync(resolve(ROOT, relative), 'utf-8'))
}

export const ROOT_DIR = ROOT
export const questions = readJSON('static/data/questions.json')
export const examBank = readJSON('static/data/exam-bank.json')
export const meta = readJSON('static/data/meta.json')

/** 按题型取池子 */
export function pool(type) {
	return questions.filter((q) => q.type === type)
}
