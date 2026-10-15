import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { questions } from '../support/bank.mjs'
import { launchBrowser, openPage, startStaticServer } from '../support/cdp.mjs'

const root = resolve(import.meta.dirname, '../..')
const output = join(root, 'docs/screenshots/practice-help')
const normalize = value => (value || '').replace(/\s+/g, '')

async function scenario(run) {
 mkdirSync(output, { recursive: true })
 const server = await startStaticServer(join(root, 'unpackage/dist/build/web'), 0)
 const browser = await launchBrowser(), page = await openPage(browser.port)
 try {
  await page.enable()
  await run(page, `http://127.0.0.1:${server.port}/index.html`)
  assert.deepEqual(page.exceptions(), [])
 } finally { await page.close(); await browser.close(); await server.close() }
}

async function load(page, url, { theme = 'light', font = 'normal', autoNext = false, readyText = '答题卡' } = {}) {
 const fixture = await page.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `localStorage.clear();localStorage.setItem('nucpharm:v1:settings',JSON.stringify({appearance:'${theme}',fontScale:'${font}',autoNext:${autoNext},showExplanation:'immediate',examMinutes:60}))`
 })
 await page.goto(url, { waitForText: readyText })
 await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: fixture.identifier })
}

async function visibleQuestion(page, type) {
 const shown = await page.evaluate(`({stem:document.querySelector('.card-stem').innerText,options:[...document.querySelectorAll('.opt-text')].map(el=>el.innerText)})`)
 const question = questions.find(q => q.type === type && normalize(q.stem) === normalize(shown.stem) &&
  q.options.every((option, index) => normalize(option.text) === normalize(shown.options[index])))
 assert.ok(question)
 return question
}

async function toggleExplanation(page) {
 await page.evaluate(`document.querySelector('.practice-tools').scrollIntoView({block:'center'});true`)
 await page.tapCss('.explanation-switch', { method: 'mouse', settle: 50 })
}

async function key(page, value, modifiers = 0) {
 await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code: value, modifiers })
 await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code: value, modifiers })
}

test('练习帮助：顺序/随机三题型的详解开关、持久化与独立法规弹层', async () => {
 await scenario(async (page, base) => {
  const results = []
  for (const mode of ['sequence', 'random']) for (const type of ['single', 'multiple', 'boolean']) {
   const width = type === 'single' ? 320 : type === 'multiple' ? 390 : 768
   const theme = type === 'single' ? 'dark' : 'light'
   await page.setViewport({ width, height: 844 })
   await load(page, `${base}?help=${mode}-${type}#/pages/question/index?mode=${mode}&type=${type}&count=20`, { theme })
   const q = await visibleQuestion(page, type)
   assert.equal(await page.count('.analysis'), 0, '开关开启也不能提前泄露详解')
   assert.equal(await page.count('.law-mask'), 0)
   await page.clickSelector('.law-trigger')
   assert.equal(normalize(await page.evaluate(`document.querySelector('.law-text').innerText`)), normalize(q.law || '本题暂无法规条文。'))
   assert.equal(await page.evaluate(`document.querySelector('.law-source').innerText`), `题源：${q.qtype} ${q.source.location}`)
   await page.clickSelector('.law-text'); assert.equal(await page.count('.law-mask'), 1, '点击条文正文不关闭弹层')
   await page.clickSelector('.law-close'); assert.equal(await page.count('.law-mask'), 0)
   assert.equal(await page.storage('nucpharm:v1:answers'), null, '仅查看法规不能产生作答')
   await toggleExplanation(page)
   assert.equal(JSON.parse(await page.storage('nucpharm:v1:settings')).showExplanation, 'afterSubmit')
   await page.clickNth('.options .opt', 0)
   if (type === 'multiple') await page.clickSelector('.submit-btn')
   assert.equal(await page.count('.result-line'), 1)
   assert.equal(await page.count('.analysis'), 0, '关闭时作答后仍不显示详解')
   const answers = await page.storage('nucpharm:v1:answers')
   await toggleExplanation(page)
   assert.equal(await page.count('.analysis'), 1)
   assert.equal(normalize(await page.evaluate(`document.querySelector('.analysis-body').innerText`)), normalize(q.explanation || '题库中本题暂无经核验的解析。'))
   assert.equal(await page.evaluate(`document.querySelector('.analysis').innerText.includes('相关法规条文')`), false)
   assert.equal((await page.evaluate(`document.querySelector('.analysis-src').innerText`)).trim(), `题源：${q.qtype} ${q.source.location}`)
   await page.clickSelector('.law-trigger'); await page.clickSelector('.law-mask')
   assert.equal(await page.count('.law-mask'), 0)
   assert.equal(await page.storage('nucpharm:v1:answers'), answers, '开关和弹层不能重复计作答')
   await toggleExplanation(page); await page.reload('答题卡')
   assert.equal(await page.count('.result-line'), 1)
   assert.equal(await page.count('.analysis'), 0, '关闭偏好在刷新后保持')
   await page.clickSelector('.bottom-primary')
   assert.equal(await page.count('.analysis'), 0)
   assert.equal(await page.count('.law-mask'), 0, '切题默认关闭法规')
   await page.clickSelector('.law-trigger')
   const next = await visibleQuestion(page, type)
   assert.equal(normalize(await page.evaluate(`document.querySelector('.law-text').innerText`)), normalize(next.law || '本题暂无法规条文。'))
   await page.screenshot(join(output, `${mode}-${type}-law.png`))
   await key(page, 'Escape'); assert.equal(await page.count('.law-mask'), 0)
   assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`))
   results.push({ mode, type, width, theme, status: 'PASS' })
  }
  // Switching between the two modes uses one existing display preference.
  await page.goto(`${base}#/pages/question/index?mode=sequence&type=single`, { waitForText: '答题卡' })
  assert.equal(JSON.parse(await page.storage('nucpharm:v1:settings')).showExplanation, 'afterSubmit')
  assert.equal(await page.count('.analysis'), 0)
  writeFileSync(join(root, 'docs/reports/PRACTICE_HELP.json'), JSON.stringify({ status: 'PASS', results }, null, 2))
 })
})

test('法规弹层边界：长条文滚动、无条文、焦点、返回及自动跳题暂停', async () => {
 await scenario(async (page, base) => {
  await page.setViewport({ width: 320, height: 568 })
  const longest = questions.reduce((a, b) => (a.law || '').length > (b.law || '').length ? a : b)
  await load(page, `${base}?law=long#/pages/study/index`, { theme: 'dark', font: 'large', readyText: '学习概况' })
  await page.clickNth('.type-chip', ['all', 'single', 'multiple', 'boolean'].indexOf(longest.type))
  await page.clickSelector('.mode-actions .np-btn-primary')
  await page.waitForText('答题卡')
  const index = questions.filter(q => q.type === longest.type).findIndex(q => q.id === longest.id)
  for (let i = 0; i < index; i++) await page.clickSelector('.bottom-primary')
  await page.tapCss('.law-trigger', { method: 'mouse', settle: 50 })
  assert.equal(await page.evaluate(`document.activeElement.classList.contains('law-close')`), true)
  await key(page, 'Tab', 8)
  assert.equal(await page.evaluate(`document.activeElement.classList.contains('law-dismiss')`), true, JSON.stringify(await page.evaluate(`({active:document.activeElement.className,controls:[...document.querySelector('.law-dialog').querySelectorAll('[tabindex="0"]')].map(e=>e.className)})`)))
  await key(page, 'Tab')
  assert.equal(await page.evaluate(`document.activeElement.classList.contains('law-close')`), true)
  const geometry = await page.evaluate(`(()=>{const panel=document.querySelector('.law-dialog').getBoundingClientRect(),body=document.querySelectorAll('.law-scroll .uni-scroll-view')[1],close=document.querySelector('.law-dismiss').getBoundingClientRect();return {panel:panel.toJSON(),bodyHeight:body.clientHeight,bodyScrollHeight:body.scrollHeight,close:close.toJSON()}})()`)
  assert.ok(geometry.panel.left >= 0 && geometry.panel.right <= 320 && geometry.panel.bottom <= 568)
  assert.ok(geometry.bodyScrollHeight > geometry.bodyHeight)
  assert.ok(geometry.close.top > geometry.panel.top && geometry.close.bottom <= geometry.panel.bottom)
  await page.evaluate(`document.querySelectorAll('.law-scroll .uni-scroll-view')[1].scrollTop=99999;true`)
  assert.ok(await page.evaluate(`document.querySelectorAll('.law-scroll .uni-scroll-view')[1].scrollTop>0`))
  await page.screenshot(join(output, 'law-long-dark-320.png'))
  await key(page, 'Escape')
  assert.equal(await page.evaluate(`document.activeElement.classList.contains('law-trigger')`), true)
  await page.clickSelector('.law-trigger')
  const url = await page.url()
  await page.clickSelector('.hdr-back')
  assert.equal(await page.count('.law-mask'), 0)
  assert.equal(await page.url(), url, '返回操作先关闭法规，留在当前题')
  const noLaw = questions.find(q => !q.law)
  await load(page, `${base}?law=empty#/pages/question/index?mode=random&type=${noLaw.type}&id=${noLaw.id}&count=110`)
  await page.clickSelector('.law-trigger'); await page.waitForText('本题暂无法规条文。')
  await page.clickSelector('.law-dismiss')
  await page.setViewport({ width: 390, height: 844 })
  await load(page, `${base}?law=auto#/pages/question/index?mode=sequence&type=single`, { autoNext: true })
  const q = questions.find(q => q.type === 'single')
  await page.clickNth('.options .opt', q.options.findIndex(option => option.key === q.answer[0]))
  await page.clickSelector('.law-trigger')
  await new Promise(resolve => setTimeout(resolve, 900))
  assert.equal(await page.evaluate(`document.querySelector('.card-index').innerText`), '1 / 400')
  assert.equal(await page.count('.law-mask'), 1)
  await page.clickSelector('.law-dismiss')
  writeFileSync(join(root, 'docs/reports/PRACTICE_LAW_BOUNDARIES.json'), JSON.stringify({ status: 'PASS', longLawId: longest.id, emptyLawId: noLaw.id, backgroundAnswerUnchanged: true, focusTrap: true, backClosesFirst: true, autoNextPaused: true }, null, 2))
 })
})
