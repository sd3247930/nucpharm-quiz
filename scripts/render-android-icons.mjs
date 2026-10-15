/** Export Android launcher assets from the approved 512px source, without stretching or palette reduction. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { launchBrowser, openPage } from '../tests/support/cdp.mjs'

const root = resolve(import.meta.dirname, '..')
const android = join(root, 'static/brand/android')
const source = join(android, 'launcher-source-512.png')
const nativeRes = join(root, 'nativeResources/android/res')
const densities = [['ldpi',48],['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]
mkdirSync(android, {recursive:true})
const browser = await launchBrowser(), page = await openPage(browser.port)
try {
 await page.enable()
 const dataURL = 'data:image/png;base64,' + readFileSync(source).toString('base64')
 for(const [name,size,content] of [...densities.map(([n,s])=>[n,s,s]),['adaptive-foreground',432,264],['adaptive-background',432,0]]) {
  const data = await page.evaluate(`(async()=>{
   const image=new Image();image.src=${JSON.stringify(dataURL)};await image.decode();
   if(image.naturalWidth!==512||image.naturalHeight!==512)throw Error('Expected approved 512px square master');
   const canvas=document.createElement('canvas');canvas.width=canvas.height=${size};
   const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
   if(${content}===0){context.fillStyle='#EDF5F3';context.fillRect(0,0,${size},${size})}
   else {const side=${content},offset=(${size}-side)/2;context.drawImage(image,offset,offset,side,side)}
   return canvas.toDataURL('image/png').split(',')[1]
  })()`)
  const target=join(android,name+'.png')
  writeFileSync(target,Buffer.from(data,'base64'))
  if(name==='adaptive-foreground') {
   mkdirSync(join(nativeRes,'drawable-nodpi'),{recursive:true})
   copyFileSync(target,join(nativeRes,'drawable-nodpi/nucpharm_launcher_foreground.png'))
  }
  if(densities.some(([density])=>density===name))for(const type of ['drawable','mipmap']) {
   const directory=join(nativeRes,type+'-'+name);mkdirSync(directory,{recursive:true});copyFileSync(target,join(directory,'icon.png'))
  }
  console.log(`Generated ${name}: ${size}x${size}, artwork ${content}x${content}`)
 }
} finally {await page.close();await browser.close()}
