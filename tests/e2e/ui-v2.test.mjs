import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { questions } from '../support/bank.mjs'
import { launchBrowser, openPage, startStaticServer } from '../support/cdp.mjs'
import { createSession } from '../../core/exam-state.js'

const root=resolve(import.meta.dirname,'../..')
const out=join(root,'docs/screenshots/h5-v2-flows')
mkdirSync(out,{recursive:true})

test('UI v2：筛选续练、错题闭环、设置、导入预览与清理保护',async()=>{
 const server=await startStaticServer(join(root,'unpackage/dist/build/web'),0)
 const browser=await launchBrowser(),p=await openPage(browser.port),steps=[]
 const base=`http://127.0.0.1:${server.port}/index.html`
 const step=text=>{steps.push(text);console.log('PASS '+text)}
 try{
  await p.enable();await p.setViewport({width:390,height:844})
  const fixture=await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('nucpharm:v1:settings',JSON.stringify({appearance:'light',fontScale:'normal',autoNext:false,showExplanation:'immediate',examMinutes:60}))`})
  await p.goto(base+'#/pages/home/index',{waitForText:'题库学习覆盖率'})
  await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fixture.identifier})
  assert.deepEqual(await p.evaluate(`([...document.querySelectorAll('.uni-tabbar__label')].map(e=>e.innerText))`),['首页','练习','考试','错题','设置'])
  step('五Tab精确顺序与中文标题')
  await p.clickNth('.uni-tabbar__item',1)
  await p.clickNth('.type-chip',2);await p.clickNth('.segment',1)
  await p.clickText('开始随机练习');await p.waitForText('确定答案')
  await p.clickText('下一题');await p.clickText('下一题')
  const stem=await p.evaluate(`document.querySelector('.card-stem').innerText`)
  await p.clickSelector('.hdr-back');await p.clickText('继续随机练习');await p.waitForText('确定答案')
  assert.equal(await p.evaluate(`document.querySelector('.card-stem').innerText`),stem)
  const sessions=JSON.parse(await p.storage('nucpharm:v1:practice-sessions'))
  const run=Object.values(sessions).find(s=>s.mode==='random'&&s.type==='multiple')
  assert.equal(run.ids.length,50);assert.equal(run.index,2);assert.equal(new Set(run.ids).size,50)
  step('多选随机50题，退出后题序与第3题恢复')
  await p.clickSelector('.hdr-back');await p.clickNth('.type-chip',1);await p.clickText('开始练习');await p.waitForText('答题卡')
  const q=questions.find(q=>q.type==='single'),bad=q.options.findIndex(o=>!q.answer.includes(o.key))
  await p.clickNth('.options .opt',bad);await p.waitForText('回答错误');await p.clickText('☆ 收藏')
  await p.clickSelector('.hdr-back');await p.clickNth('.uni-tabbar__item',3)
  assert.equal(await p.count('.wrong-item'),1);assert.equal(await p.count('.wrong-answer'),0)
  await p.clickText('查看正确答案');assert.equal(await p.count('.wrong-answer'),1)
  await p.clickText('管理');assert.ok((await p.text()).includes('清空错题本？'))
  await p.clickSelector('.dlg-btn.np-btn-plain');assert.equal(await p.count('.wrong-item'),1)
  await p.clickSelector('.wrong-item');await p.waitForText('答题卡')
  assert.equal(await p.count('.result-line'),0,'复习必须允许重新作答')
  await p.clickNth('.options .opt',q.options.findIndex(o=>o.key===q.answer[0]));await p.waitForText('回答正确')
  await p.clickSelector('.hdr-back');assert.equal(await p.count('.wrong-item'),0)
  assert.equal(JSON.parse(await p.storage('nucpharm:v1:favorites')).length,1)
  step('错题答案折叠、清空取消、答对移出且收藏保留')
  await p.clickNth('.uni-tabbar__item',4);await p.clickText('深色');await p.clickText('大');await p.clickText('45 分')
  await p.clickNth('.uni-tabbar__item',0)
  assert.ok((await p.evaluate(`document.querySelector('.np-page').className`)).includes('np-dark'))
  assert.ok((await p.text()).includes('45 分钟'))
  await p.clickNth('.uni-tabbar__item',4)
  await p.reload('学习总览')
  assert.ok((await p.evaluate(`document.querySelector('.np-page').className`)).includes('np-fs-large'))
  const tabColor=await p.evaluate(`getComputedStyle(document.querySelector('.uni-tabbar')).backgroundColor`)
  assert.equal(tabColor,'rgb(23, 33, 43)')
  await p.screenshot(join(out,'settings-dark-reloaded.png'))
  step('主题/大字号/45分钟持久化与深色冷启动底栏')
  await p.clickText('清理考试历史');await p.clickSelector('.dlg-btn.np-btn-plain')
  await p.clickSelector('.danger-btn');await p.clickSelector('.dlg-btn.np-btn-plain')
  assert.equal(Object.keys(JSON.parse(await p.storage('nucpharm:v1:answers'))).length,1)
  await p.clickText('导入进度备份');await p.clickText('手动粘贴')
  const before=await p.storage('nucpharm:v1:answers')
  const fill=async text=>p.evaluate(`(()=>{const input=document.querySelector('.paste-area textarea')||document.querySelector('textarea');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await fill('{broken');await p.clickText('校验并预览');await p.waitForText('备份校验失败');assert.equal(await p.storage('nucpharm:v1:answers'),before)
  await p.clickText('确定')
  const payload={app:'nucpharm-progress',schema:1,bankVersion:'1.0.0',exportedAt:Date.now(),data:{notes:{[q.id]:{text:'UI v2 导入测试笔记',ts:Date.now()}}}}
  await fill(JSON.stringify(payload));await p.clickText('校验并预览');await p.waitForText('合并备份？')
  assert.deepEqual(JSON.parse(await p.storage('nucpharm:v1:notes') || '{}'),{},'确认前不能写入笔记')
  await p.clickText('确认合并');await p.waitForText('合并完成');await p.clickText('确定')
  assert.equal(JSON.parse(await p.storage('nucpharm:v1:notes'))[q.id].text,'UI v2 导入测试笔记')
  step('非法备份零污染、合法备份预览后确认合并')
  await p.goto(base+'#/pages/me/index',{waitForText:'学习总览'});assert.ok((await p.url()).includes('/pages/settings/index'))
  step('旧我的路由兼容重定向到设置')
  assert.deepEqual(p.exceptions(),[])
 } finally {
  writeFileSync(join(root,'docs/reports/H5_INTERACTIONS_V2.json'),JSON.stringify({date:'2026-10-15',steps},null,2))
  await p.close();await browser.close();await server.close()
 }
})

test('UI v2边界：100%覆盖率、过期卷仅交一次、二级页多屏深色大字号',async()=>{
 const server=await startStaticServer(join(root,'unpackage/dist/build/web'),0)
 const browser=await launchBrowser(),p=await openPage(browser.port)
 const base=`http://127.0.0.1:${server.port}/index.html`,shots=[]
 const expired=createSession({now:Date.now()-61*60*1000,minutes:60})
 const answers=Object.fromEntries(questions.map(q=>[q.id,{n:1,ok:1,last:q.answer,lastOk:true,ts:Date.now()}]))
 try{
  await p.enable();await p.setViewport({width:390,height:844})
  const fixture=await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('nucpharm:v1:answers',${JSON.stringify(JSON.stringify(answers))});localStorage.setItem('nucpharm:v1:active-exam',${JSON.stringify(JSON.stringify(expired))})`})
  await p.goto(base+'#/pages/exam/index',{waitForText:'试卷结构'})
  await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fixture.identifier})
  const history=JSON.parse(await p.storage('nucpharm:v1:exams'))
  assert.equal(history.length,1);assert.equal(history[0].sessionId,expired.sessionId)
  await p.reload('试卷结构')
  assert.equal(JSON.parse(await p.storage('nucpharm:v1:exams')).length,1)
  await p.clickNth('.uni-tabbar__item',0)
  assert.ok((await p.text()).includes('620 / 620 题'));assert.ok((await p.text()).includes('100.0%'))
  assert.equal(await p.evaluate(`document.querySelector('.home-hero .progress-fill').style.width`),'100%')
  await p.screenshot(join(out,'home-coverage-100.png'))
  for(const [width,height] of [[320,568],[390,844],[768,1024]])for(const [theme,font] of [['light','normal'],['dark','large']]){
   await p.setViewport({width,height,mobile:width<600})
   const appearance=await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('nucpharm:v1:settings',JSON.stringify({appearance:'${theme}',fontScale:'${font}',autoNext:false,showExplanation:'immediate',examMinutes:60}))`})
   const long=questions.filter(q=>q.type==='single').sort((a,b)=>(b.stem.length+(b.explanation||'').length)-(a.stem.length+(a.explanation||'').length))[0]
   const routes=[['question',`?mode=sequence&type=single&id=${long.id}`,'答题卡'],['exam-session','','剩余'],['exam-result',`?sessionId=${expired.sessionId}`,'本次得分'],['exam-review',`?sessionId=${expired.sessionId}`,'试卷复盘']]
   await p.reload();await new Promise(r=>setTimeout(r,500))
   for(const [route,query,text] of routes){
    await p.goto(base+`#/pages/${route}/index${query}`,{waitForText:text})
    assert.ok(await p.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),`${route} overflow ${width}`)
    assert.equal(await p.evaluate(`document.querySelector('.np-page').className.includes('np-dark')`),theme==='dark')
    if(route==='exam-session')assert.ok(!(await p.text()).includes('正确答案'))
    if(route==='exam-review')assert.equal(await p.count('.review-item'),70)
    const filename=`${route}-${width}-${theme}-${font}.png`;await p.screenshot(join(out,filename));shots.push(filename)
   }
   await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:appearance.identifier})
  }
  assert.deepEqual(p.exceptions(),[])
  writeFileSync(join(root,'docs/reports/H5_BOUNDARIES_V2.json'),JSON.stringify({status:'PASS',coverage:'620/620=100%',expiredSubmitRecords:1,secondaryScreenshots:shots.length,shots},null,2))
 }finally{await p.close();await browser.close();await server.close()}
})

test('备份真实文件闭环：笔记编辑、JSON下载、文件选择导入、取消文件选择',async()=>{
 const server=await startStaticServer(join(root,'unpackage/dist/build/web'),0)
 const browser=await launchBrowser(),p=await openPage(browser.port)
 const downloadDir=mkdtempSync(join(tmpdir(),'nucpharm-backup-'))
 const base=`http://127.0.0.1:${server.port}/index.html`
 const note='真实文件备份回归：记录易混点'
 try {
  await p.enable();await p.send('DOM.enable')
  await p.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir})
  await p.setViewport({width:390,height:844})
  await p.goto(base+'#/pages/question/index?mode=sequence&type=single',{waitForText:'答题卡'})
  await p.clickSelector('.note-card .analysis-head')
  await p.evaluate(`(()=>{const input=document.querySelector('.note-area textarea')||document.querySelector('textarea');input.value=${JSON.stringify(note)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await p.clickSelector('.note-btn')
  const q=questions.find(q=>q.type==='single')
  assert.equal(JSON.parse(await p.storage('nucpharm:v1:notes'))[q.id].text,note)
  await p.goto(base+'#/pages/settings/index',{waitForText:'学习总览'})
  await p.clickText('导出学习进度');await p.waitForText('已开始下载');await p.clickText('确定')
  let filename
  for(let attempt=0;attempt<30;attempt++){
   filename=readdirSync(downloadDir).find(name=>name.endsWith('.json'))
   if(filename)break
   await new Promise(r=>setTimeout(r,100))
  }
  assert.ok(filename,'JSON备份必须真实下载到文件')
  const payload=JSON.parse(readFileSync(join(downloadDir,filename),'utf8'))
  assert.equal(payload.app,'nucpharm-progress');assert.equal(payload.schema,1)
  assert.equal(payload.data.notes[q.id].text,note)
  assert.ok(payload.data.practiceSessions)
  // 清除只影响这个临时浏览器profile，随后通过真实文件选择恢复。
  await p.clickSelector('.danger-btn');await p.clickSelector('.dlg-btn.np-btn-primary')
  assert.equal(await p.storage('nucpharm:v1:notes'),null)
  await p.send('Page.setInterceptFileChooserDialog',{enabled:true})
  await p.clickText('导入进度备份');await p.tapText('选择 JSON 文件',{method:'mouse',settle:300})
  const chooser=p.events.filter(e=>e.method==='Page.fileChooserOpened').at(-1)
  assert.ok(chooser,'文件选择器应真实打开')
  await p.send('DOM.setFileInputFiles',{files:[join(downloadDir,filename)],backendNodeId:chooser.params.backendNodeId})
  await p.waitForText('合并备份？')
  assert.equal(await p.storage('nucpharm:v1:notes'),null)
  await p.clickText('确认合并');await p.waitForText('合并完成');await p.clickText('确定')
  assert.equal(JSON.parse(await p.storage('nucpharm:v1:notes'))[q.id].text,note)
  assert.equal(await p.count('input[type=file]'),0)
  const before=await p.storage('nucpharm:v1:notes')
  await p.clickText('导入进度备份');await p.tapText('选择 JSON 文件',{method:'mouse',settle:300})
  await p.evaluate(`document.querySelector('input[type=file]').dispatchEvent(new Event('cancel'))`)
  assert.equal(await p.count('input[type=file]'),0)
  assert.equal(await p.storage('nucpharm:v1:notes'),before)
  assert.ok(!(await p.text()).includes('无法读取备份'))
  assert.deepEqual(p.exceptions(),[])
  writeFileSync(join(root,'docs/reports/BACKUP_FILE_FLOW_V2.json'),JSON.stringify({status:'PASS',noteEditor:true,download:true,fileImport:true,previewBeforeWrite:true,fileCancelNoMutation:true},null,2))
 }finally{await p.close();await browser.close();await server.close()}
})
