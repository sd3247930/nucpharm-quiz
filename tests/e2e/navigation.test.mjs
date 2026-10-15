import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { launchBrowser, openPage, startStaticServer } from '../support/cdp.mjs'

test('底部导航：窄屏真实点按、深浅色图标、内容避让及详情页回退', async () => {
  const root = resolve(import.meta.dirname, '../..')
  const output = join(root, 'docs/screenshots/navigation')
  mkdirSync(output, { recursive: true })
  const server = await startStaticServer(join(root, 'unpackage/dist/build/web'), 0)
  const browser = await launchBrowser(), page = await openPage(browser.port)
  const rows = [], titles = ['首页', '练习', '考试', '错题', '设置']
  const kinds = ['home', 'study', 'exam', 'mistakes', 'settings']
  try {
    await page.enable()
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
      await page.setViewport({ width, height, mobile: true })
      for (const appearance of ['light', 'dark']) {
        const fixture = await page.send('Page.addScriptToEvaluateOnNewDocument', {
          source: `localStorage.setItem('nucpharm:v1:settings', JSON.stringify({appearance:'${appearance}',fontScale:'large',autoNext:false,showExplanation:'immediate',examMinutes:60}))`
        })
        await page.goto(`http://127.0.0.1:${server.port}/index.html#/pages/home/index`, { waitForText: '题库学习覆盖率' })
        // hash 切换不创建新文档；刷新一次才能执行下一组持久化主题夹具。
        await page.reload('题库学习覆盖率')
        await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: fixture.identifier })
        for (let index = 0; index < titles.length; index++) {
          await page.tapCss('.uni-tabbar__item', { index, settle: 120 })
          await page.waitForText(titles[index])
          await page.evaluate(`Promise.all([...document.querySelectorAll('.uni-tabbar__icon img')].map(image => image.decode()))`)
          const layout = await page.evaluate(`(() => {
            const bar = document.querySelector('.uni-tabbar'), bounds = bar.getBoundingClientRect();
            return {
              title: document.querySelector('.hdr-title').innerText.trim(),
              overflow: document.documentElement.scrollWidth > innerWidth,
              bar: { top: bounds.top, bottom: bounds.bottom, height: bounds.height },
              items: [...document.querySelectorAll('.uni-tabbar__item')].map(item => {
                const r = item.getBoundingClientRect(), image = item.querySelector('img'), label = item.querySelector('.uni-tabbar__label');
                return { width: r.width, height: r.height, image: image.src.split('/').pop(), naturalWidth: image.naturalWidth,
                  reachable: !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.uni-tabbar__item'),
                  labelVisible: label.getBoundingClientRect().bottom <= bounds.bottom };
              })
            };
          })()`)
          assert.equal(layout.title, titles[index], '实际点按必须切到对应一级页')
          assert.equal(layout.overflow, false)
          assert.ok(Math.abs(layout.bar.bottom - height) <= 1)
          assert.ok(layout.bar.height >= 70 && layout.bar.height <= 80)
          for (const [itemIndex, item] of layout.items.entries()) {
            assert.ok(item.width >= 44 && item.height >= 44, '完整点击区不能随图标缩小')
            assert.ok(item.reachable && item.labelVisible)
            assert.equal(item.naturalWidth, 144, '原生和网页加载高清位图')
            const suffix = appearance === 'dark' ? (index === itemIndex ? '-dark' : '-dark-idle') : (index === itemIndex ? '-on' : '')
            assert.equal(item.image, kinds[itemIndex] + suffix + '.png', '选中状态与主题必须同步')
          }
          await page.screenshot(join(output, `${width}-${appearance}-${kinds[index]}.png`))
          rows.push({ width, height, appearance, page: kinds[index], ...layout })
        }
        await page.evaluate(`document.querySelector('.danger-btn').scrollIntoView({block:'center'})`)
        const exposed = await page.evaluate(`(() => {
          const r = document.querySelector('.danger-btn').getBoundingClientRect();
          return r.top >= 0 && r.bottom <= document.querySelector('.uni-tabbar').getBoundingClientRect().top;
        })()`)
        assert.equal(exposed, true, '设置页底部操作可滚动到导航栏上方')
        await page.tapCss('.uni-tabbar__item', { index: 1, settle: 120 })
        await page.evaluate(`document.querySelector('.mode-actions .np-btn-primary').scrollIntoView({block:'center'})`)
        await page.tapCss('.mode-actions .np-btn-primary', { settle: 120 })
        await page.waitForText('答题卡')
        assert.equal(await page.evaluate(`document.querySelector('.uni-tabbar').getBoundingClientRect().height`), 0, '答题页隐藏一级导航')
        await page.tapCss('.hdr-back', { settle: 120 })
        await page.waitForText('继续练习')
        assert.equal(await page.evaluate(`document.querySelector('.hdr-title').innerText.trim()`), '练习')
        assert.ok(await page.evaluate(`document.querySelector('.uni-tabbar').getBoundingClientRect().height >= 70`))
      }
    }
    assert.deepEqual(page.exceptions(), [])
    writeFileSync(join(root, 'docs/reports/NAVIGATION_H5.json'), JSON.stringify({ status: 'PASS', rows, exceptions: [] }, null, 2))
  } finally { await page.close(); await browser.close(); await server.close() }
})
