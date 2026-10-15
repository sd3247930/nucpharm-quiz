/** Render local SVG masters at 4x tab icon size. Native tab bars require PNG assets. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { launchBrowser, openPage } from '../tests/support/cdp.mjs'

const root = resolve(import.meta.dirname, '..')
// 新目录隔离旧版本原生图标缓存，不依赖用户清除应用数据。
const output = join(root, 'static/tabbar/soft-gradient')
const size = 144
const sourceColors = ['#76B3D2', '#8A6BB2', '#EA9EAC', '#C86382']
const variants = [
  { suffix: '', active: false, colors: sourceColors },
  { suffix: '-on', active: true, colors: ['#4A90E2', '#8053B7', '#E98593', '#BA4262'] },
  { suffix: '-dark-idle', active: false, colors: ['#85BADB', '#A493CA', '#EFA8B5', '#D5849F'] },
  { suffix: '-dark', active: true, colors: ['#9DDCFF', '#C1A2F3', '#FFBBC6', '#F692AE'] }
]
mkdirSync(output, { recursive: true })
const browser = await launchBrowser(), page = await openPage(browser.port)
try {
  await page.enable()
  for (const kind of ['home', 'study', 'exam', 'mistakes', 'settings']) {
    const master = readFileSync(join(root, 'assets/navigation', kind + '.svg'), 'utf8')
    for (const variant of variants) {
      let svg = master.replace(/#[0-9A-F]{6}/g, color => {
        const index = sourceColors.indexOf(color)
        return index < 0 ? color : variant.colors[index]
      })
      if (variant.active) svg = svg.replace('opacity="0"', 'opacity="1"')
      const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
      const data = await page.evaluate(`(async () => {
        const image = new Image(); image.src = ${JSON.stringify(url)}; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = ${size};
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, ${size}, ${size});
        return canvas.toDataURL('image/png').split(',')[1];
      })()`)
      const name = kind + variant.suffix + '.png'
      writeFileSync(join(output, name), Buffer.from(data, 'base64'))
      console.log(`Generated ${name}: ${size}x${size}`)
    }
  }
} finally { await page.close(); await browser.close() }
