import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {launchBrowser,openPage,startStaticServer} from '../support/cdp.mjs'
import {questions} from '../support/bank.mjs'

const root=resolve(import.meta.dirname,'../..'),shots=join(root,'docs/screenshots/startup')
mkdirSync(shots,{recursive:true})

test('启动：大记录按需加载、深色冷启动和二级入口首屏完成',async()=>{
	const server=await startStaticServer(join(root,'unpackage/dist/build/web'),0),browser=await launchBrowser(),p=await openPage(browser.port)
	const base=`http://127.0.0.1:${server.port}/index.html`
	try{
		await p.enable();await p.setViewport({width:390,height:844})
		await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`
		localStorage.setItem('nucpharm:v1:settings',JSON.stringify({appearance:'dark',fontScale:'large',autoNext:false,showExplanation:'immediate',examMinutes:60}));
		localStorage.setItem('nucpharm:v1:exam-snapshots',JSON.stringify({probe:{payload:'x'.repeat(500000)}}));
		localStorage.setItem('nucpharm:v1:practice-sessions',JSON.stringify({probe:{payload:'y'.repeat(500000)}}));
		window.__startupReads=[];const read=Storage.prototype.getItem;
		Storage.prototype.getItem=function(key){if(key.startsWith('nucpharm:'))window.__startupReads.push(key);return read.call(this,key)};
		`})
		await p.goto(base+'#/pages/home/index',{waitForText:'题库学习覆盖率'})
		const reads=await p.evaluate('window.__startupReads')
		assert.ok(!reads.includes('nucpharm:v1:exam-snapshots'));assert.ok(!reads.includes('nucpharm:v1:practice-sessions'))
		const ready=await p.evaluate(`performance.getEntriesByName('nucpharm:firstPageReady').map(e=>e.startTime)`)
		assert.equal(ready.length,1)
		assert.ok((await p.evaluate(`document.querySelector('.np-page').className`)).includes('np-dark'))
		assert.equal(await p.evaluate(`getComputedStyle(document.querySelector('.uni-tabbar')).backgroundColor`),'rgb(23, 33, 43)')
		await p.screenshot(join(shots,'home-heavy-records-dark.png'))
		await p.goto(base+'#/pages/question/index?mode=sequence&type=single',{waitForText:'答题卡'})
		await p.reload('答题卡')
		for(let retry=0;retry<40;retry++) {
			if(await p.evaluate(`performance.getEntriesByName('nucpharm:firstPageReady').length`))break
			await new Promise(resolve=>setTimeout(resolve,50))
		}
		assert.equal(await p.evaluate(`performance.getEntriesByName('nucpharm:firstPageReady').length`),1,'全局onReady也覆盖二级入口')
		assert.deepEqual(p.exceptions(),[])
		writeFileSync(join(root,'docs/reports/STARTUP_H5.json'),JSON.stringify({status:'PASS',heavyRecordCharacters:1000000,homeDoesNotReadSecondaryRecords:true,homeFirstPageReadyMs:ready[0],secondaryEntryReady:true},null,2))
	}finally{await p.close();await browser.close();await server.close()}
})

test('启动恢复失败展示重试页，保留原事务和笔记，重试恢复且不继续转圈',async()=>{
	const server=await startStaticServer(join(root,'unpackage/dist/build/web'),0),browser=await launchBrowser(),p=await openPage(browser.port)
	const base=`http://127.0.0.1:${server.port}/index.html`,id=questions[0].id
	try{
		await p.enable();await p.setViewport({width:320,height:568})
		await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`
		const original=JSON.stringify({${JSON.stringify(id)}:{text:'恢复后保留的原笔记',ts:1}});
		localStorage.setItem('nucpharm:v1:import-rollback',JSON.stringify({before:{notes:original}}));
		window.__blockStartupWrites=true;const set=Storage.prototype.setItem;
		Storage.prototype.setItem=function(key,value){if(window.__blockStartupWrites&&key==='nucpharm:v1:notes')throw new DOMException('full','QuotaExceededError');return set.call(this,key,value)};
		`})
		await p.goto(base+'#/pages/home/index',{waitForText:'重试加载'})
		assert.ok(await p.storage('nucpharm:v1:import-rollback'))
		assert.equal(await p.evaluate(`document.querySelectorAll('.home-hero').length`),0)
		assert.equal(await p.evaluate(`document.querySelector('.uni-tabbar').getBoundingClientRect().height`),0,'恢复失败时关闭业务导航')
		assert.equal(await p.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true)
		await p.screenshot(join(shots,'recovery-failure.png'))
		await p.evaluate('window.__blockStartupWrites=false')
		await p.clickText('重试加载');await p.waitForText('题库学习覆盖率')
		const notes=JSON.parse(await p.storage('nucpharm:v1:notes'))
		assert.equal(notes[id].text,'恢复后保留的原笔记')
		assert.ok(!(await p.storage('nucpharm:v1:import-rollback')))
		assert.equal(await p.evaluate(`getComputedStyle(document.querySelector('.uni-tabbar')).display`),'flex')
		assert.deepEqual(p.exceptions(),[])
	}finally{await p.close();await browser.close();await server.close()}
})
