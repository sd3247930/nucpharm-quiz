import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { launchBrowser, openPage, startStaticServer } from '../support/cdp.mjs'
import { APK_URL } from '../../core/release-info.js'

test('安装入口：五页一致、窄屏无溢出、下载直链与键盘关闭', async () => {
  const root = resolve(import.meta.dirname, '../..')
  const server = await startStaticServer(resolve(root, 'unpackage/dist/build/web'), 0)
  const browser = await launchBrowser(), page = await openPage(browser.port)
  try {
    await page.enable()
    await page.setViewport({ width: 320, height: 700 })
    for (const route of ['home', 'study', 'exam', 'mistakes', 'settings']) {
      await page.goto(`http://127.0.0.1:${server.port}/index.html#/pages/${route}/index`, { waitForText: '📲 安装' })
      assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true)
      await page.clickSelector('.install-trigger')
      await page.waitForText('下载应用（APK）')
      assert.equal(await page.evaluate("document.querySelector('.install-download').href"), APK_URL)
      assert.equal(await page.evaluate("document.body.style.overflow"), 'hidden')
      assert.equal(await page.evaluate("document.activeElement.classList.contains('install-close')"), true)
      assert.equal(await page.evaluate("document.querySelector('.install-panel').getBoundingClientRect().right <= innerWidth"), true)
      assert.equal(await page.evaluate("!!document.elementFromPoint(innerWidth / 2, innerHeight - 20)?.closest('.install-overlay')"), true, '遮罩盖住底部导航')
      await page.evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}))")
      assert.equal(await page.evaluate("document.querySelector('.install-panel') === null"), true)
      assert.notEqual(await page.evaluate('document.body.style.overflow'), 'hidden')
      assert.equal(await page.evaluate("document.activeElement.classList.contains('install-trigger')"), true)
    }
    assert.deepEqual(page.exceptions(), [])
  } finally { await page.close(); await browser.close(); await server.close() }
})
