import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { ssrRenderAttrs } from '@vue/server-renderer'

const require = createRequire(import.meta.url)
const braces = require('braces')
const micromatch = require('micromatch')
const { MAX_DEPTH, MAX_AST_NODES } = require('../vendor/braces/lib/depth-guard.js')
const depthFailure = error => error instanceof SyntaxError && error.code === 'ERR_BRACES_DEPTH'

// 检查真实传递依赖解析路径，防止只修复根入口但编译器仍加载旧副本。
test('micromatch 和 chokidar 实际解析到同一个本地安全回补', () => {
  for (const name of ['micromatch', 'chokidar']) {
    const fromDependency = createRequire(require.resolve(name + '/package.json'))
    assert.equal(fromDependency.resolve('braces'), require.resolve('braces'))
  }
})

// 正常 glob、数值/字母范围、转义和引号行为保持，验证真实依赖调用链。
test('安全回补保留普通花括号展开及 micromatch 匹配', () => {
  assert.deepEqual(braces.expand('src/{pages,core}/file-{1..3}.js'), [
    'src/pages/file-1.js', 'src/pages/file-2.js', 'src/pages/file-3.js',
    'src/core/file-1.js', 'src/core/file-2.js', 'src/core/file-3.js'
  ])
  assert.deepEqual(micromatch(['a.vue', 'b.js', 'c.txt'], '*.{vue,js}'), ['a.vue', 'b.js'])
  assert.deepEqual(braces.expand('{a..c}'), ['a', 'b', 'c'])
  assert.equal(braces.stringify(braces.parse('')), '')
  assert.deepEqual(braces.expand(String.raw`\{a,b\}`), ['{a,b}'])
  assert.deepEqual(braces.expand('"{a,b}"'), ['{a,b}'])
})

// 达到边界仍可正常处理；调用方不能提高配置绕过硬上限。
test('花括号嵌套深度边界正常，超限以明确错误拒绝', () => {
  const atLimit = '{'.repeat(MAX_DEPTH) + 'a' + '}'.repeat(MAX_DEPTH)
  assert.doesNotThrow(() => braces.compile(atLimit))
  const tooDeep = '{'.repeat(MAX_DEPTH + 1) + 'a' + '}'.repeat(MAX_DEPTH + 1)
  assert.throws(() => braces.parse(tooDeep, { maxDepth: 100000 }), depthFailure)
  assert.throws(() => braces.parse(null), TypeError)
})

// 上游 PoC 在长度限制内构造数千层嵌套；所有公共入口都应受控失败而非栈溢出。
test('数千层花括号、圆括号及未闭合输入不会耗尽递归栈', () => {
  const payloads = [
    '{'.repeat(4500) + 'a' + '}'.repeat(4500),
    '('.repeat(4500) + 'a' + ')'.repeat(4500),
    '{'.repeat(4500),
    '({'.repeat(2000) + 'a' + '})'.repeat(2000)
  ]
  for (const payload of payloads) {
    for (const operation of [braces, braces.create, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => operation(payload), depthFailure)
    }
  }
  assert.throws(() => micromatch.braces(payloads[0]), depthFailure)
})

// 转义及引号中的括号是普通字符，不应被误判成 100 层有效嵌套。
test('大量转义/引号内的字面括号不触发嵌套限制', () => {
  assert.doesNotThrow(() => braces.compile(String.raw`\{`.repeat(1000)))
  assert.doesNotThrow(() => braces.parse('"' + '{'.repeat(1000) + '"'))
})

// 直接传入 AST 不能绕过解析器；循环子节点与异常节点数量均受控拒绝。
test('手写深层、循环及过量 AST 不能绕过递归保护', () => {
  let deep = { type: 'text', value: 'a' }
  for (let i = 0; i < 5000; i++) deep = { type: 'root', nodes: [deep] }
  const cycle = { type: 'root', nodes: [] }; cycle.nodes.push(cycle)
  const wide = { type: 'root', nodes: Array.from({ length: MAX_AST_NODES + 1 }, () => ({ type: 'text', value: 'a' })) }
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(deep), depthFailure)
    assert.throws(() => operation(cycle), { code: 'ERR_BRACES_CYCLE' })
    assert.throws(() => operation(wide), { code: 'ERR_BRACES_NODES' })
  }
})

// GHSA-g2v6-rqmx-r4w6：恶意属性名中的 CR 必须被拒绝，避免拆分成自动执行属性。
test('Vue SSR 拒绝含回车的恶意属性名，同时正常转义属性值', () => {
  const previousWarn = console.warn
  const previousError = console.error
  let result
  try {
    console.warn = () => {}
    console.error = () => {}
    result = ssrRenderAttrs({ ['x\rautofocus\ronfocus']: 'alert(1)', title: '<safe>"' })
  } finally { console.warn = previousWarn; console.error = previousError }
  assert.ok(!result.includes('\r'))
  assert.ok(!result.includes('autofocus'))
  assert.ok(!result.includes('onfocus'))
  assert.ok(result.includes('&lt;safe&gt;&quot;'))
})
