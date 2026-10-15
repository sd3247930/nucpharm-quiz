/**
 * 测试引导：注册 vue 解析钩子，并在全局安装 uni 运行时替身。
 *
 * 用法（由 tests/run-all.mjs 自动带上）：
 *   node --import ./tests/support/register.mjs --test tests/unit
 */

import { register } from 'node:module'
import { mkdirSync } from 'node:fs'
import { installUniStub } from './uni-stub.mjs'

register('./vue-hooks.mjs', import.meta.url)
mkdirSync(new URL('../../docs/reports/', import.meta.url), { recursive: true })

const stub = installUniStub()
globalThis.__uniStub = stub
globalThis.__vueStubInstalled = true
