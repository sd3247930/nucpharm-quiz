import test from 'node:test'
import assert from 'node:assert/strict'
import { installUniStub } from '../support/uni-stub.mjs'
import { getBankVersion } from '../../core/bank-service.js'
import { lazyRecord } from '../../core/lazy-record.js'
import { beginStartup, markStartup, failStartup, finishStartup, startupMetrics, startupState } from '../../core/startup.js'

const stub = installUniStub()
let sequence = 0
const freshStore = () => import(`../../core/store.js?startup=${++sequence}`)
const freshPlatform = () => import(`../../core/platform.js?startup=${++sequence}`)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
test.beforeEach(async () => {
	// 隔离此前store实例在真实定时器上排队的外观任务，再安装当前用例的计数器。
	await sleep(140)
	stub.reset(); delete globalThis.plus
})
test.afterEach(() => { delete globalThis.plus })

test('冷启动只读首屏必要数据；复盘、练习大对象和容量扫描不进入关键路径', async () => {
	const reads = [], writes = []
	const read = uni.getStorageSync, write = uni.setStorageSync
	uni.getStorageSync = key => { reads.push(key); return read(key) }
	uni.setStorageSync = (key,value) => { writes.push(key); return write(key,value) }
	uni.getStorageInfoSync = () => { throw Error('首屏不应扫描容量') }
	stub.memory.set('nucpharm:v1:bank-version', getBankVersion())
	const snapshots = JSON.stringify({ preserved: { payload:'复盘'.repeat(100000) } })
	const sessions = JSON.stringify({ preserved: { payload:'游标'.repeat(100000) } })
	stub.memory.set('nucpharm:v1:exam-snapshots',snapshots)
	stub.memory.set('nucpharm:v1:practice-sessions',sessions)
	const store = await freshStore()
	store.init(); store.summary(); store.summaryByType(); store.lastPractice(); store.flush()
	for(const part of ['exam-snapshots','practice-sessions']) {
		assert.ok(!reads.includes('nucpharm:v1:'+part))
		assert.ok(!writes.includes('nucpharm:v1:'+part))
	}
	assert.equal(stub.get('nucpharm:v1:exam-snapshots'),snapshots)
	assert.equal(stub.get('nucpharm:v1:practice-sessions'),sessions)
})

test('首次复盘/续练同步恢复，之后不重复读取；导出不会遗漏惰性记录', async () => {
	const store = await freshStore()
	const snapshots = { saved:{ sessionId:'saved',paperIds:['q'] } }
	const sessions = { ['random:all:'+getBankVersion()+':20']:{ mode:'random',type:'all',count:20,index:7,ids:['q'] } }
	stub.memory.set('nucpharm:v1:exam-snapshots',JSON.stringify(snapshots))
	stub.memory.set('nucpharm:v1:practice-sessions',JSON.stringify(sessions))
	store.init()
	assert.deepEqual(store.examSnapshot('saved'),snapshots.saved)
	assert.equal(store.practiceSession('random','all',20).index,7)
	const payload = store.exportPayload()
	assert.deepEqual(payload.data.examSnapshots,snapshots)
	assert.deepEqual(payload.data.practiceSessions,sessions)
})

test('未读历史即清空进度，不能在下一次读取时把旧记录复活', async () => {
	stub.memory.set('nucpharm:v1:exam-snapshots','{"old":{}}')
	stub.memory.set('nucpharm:v1:practice-sessions','{"old":{}}')
	const store = await freshStore(); store.init(); store.resetAll()
	assert.deepEqual(store.state.examSnapshots,{})
	assert.deepEqual(store.state.practiceSessions,{})
	assert.equal(stub.get('nucpharm:v1:exam-snapshots'),undefined)
})

test('惰性载入失败可重试，显式赋值不会再读取旧值，重置后重新载入', () => {
	let calls=0
	const record=lazyRecord(()=>{if(++calls===1)throw Error('transient');return {calls}})
	const holder={};Object.defineProperty(holder,'data',record.descriptor)
	assert.throws(()=>holder.data,/transient/)
	assert.equal(record.loaded,false)
	assert.equal(holder.data.calls,2)
	assert.equal(holder.data.calls,2)
	holder.data={saved:true};assert.deepEqual(holder.data,{saved:true});assert.equal(calls,2)
	record.reset();assert.equal(holder.data.calls,3)
})

test('存储事务不能恢复时保留原数据，重试后正常初始化', async () => {
	const raw='{"before":{"notes":"{\\"saved\\":{\\"text\\":\\"保留\\"}}"}}'
	stub.memory.set('nucpharm:v1:import-rollback',raw)
	const write=uni.setStorageSync
	uni.setStorageSync=()=>{throw Error('full')}
	const store=await freshStore()
	assert.throws(()=>store.init(),/尚未恢复/)
	assert.equal(store.state.ready,false)
	assert.equal(stub.get('nucpharm:v1:import-rollback'),raw)
	store.flush()
	assert.equal(stub.get('nucpharm:v1:notes'),undefined,'恢复失败退后台不能写入空笔记')
	uni.setStorageSync=write;store.init()
	assert.equal(store.noteOf('saved'),'保留')
	assert.equal(store.state.ready,true)
})

test('首屏关闭幂等；初始化失败也能显示错误页，重试后清除错误', () => {
	let closes=0
	globalThis.plus={navigator:{closeSplashscreen:()=>closes++}}
	beginStartup();markStartup('essentialDataReady');failStartup()
	assert.ok(startupState.error)
	finishStartup();finishStartup()
	assert.equal(closes,1)
	assert.equal(startupMetrics().complete,true)
	assert.equal(startupMetrics().failed,true)
	beginStartup();assert.equal(startupState.error,'');assert.equal(startupMetrics().complete,false)
})

test('原生关闭暂时失败后仍可重试，不因提前标记完成而永远漏关', () => {
	let calls=0
	globalThis.plus={navigator:{closeSplashscreen:()=>{if(++calls===1)throw Error('not ready')}}}
	beginStartup();finishStartup();assert.equal(startupState.complete,false)
	finishStartup();assert.equal(startupState.complete,true);assert.equal(calls,2)
})

test('启动的三次外观请求只发一批7次桥接，同主题恢复不重载5个图标', async () => {
	const calls=[]
	uni.setTabBarStyle=o=>{calls.push(['style',o]);return Promise.resolve()}
	uni.setTabBarItem=o=>{calls.push(['item',o]);return Promise.resolve()}
	uni.setNavigationBarColor=o=>{calls.push(['nav',o]);return Promise.resolve()}
	const platform=await freshPlatform()
	for(let n=0;n<3;n++)platform.applyAppearance({appearance:'dark'})
	assert.equal(calls.length,0)
	await sleep(135);assert.equal(calls.length,7)
	platform.applyAppearance({appearance:'dark'});await sleep(135);assert.equal(calls.length,7)
})

test('快速切换主题后回到原主题，不能被排队中的旧主题覆盖', async () => {
	const colors=[]
	uni.setTabBarStyle=o=>{colors.push(o.backgroundColor);return Promise.resolve()}
	const platform=await freshPlatform()
	platform.applyAppearance({appearance:'light'});await sleep(135)
	platform.applyAppearance({appearance:'dark'});platform.applyAppearance({appearance:'light'})
	await sleep(135);assert.deepEqual(colors,['#FFFFFF'])
})

test('原生底栏首次未挂载时拒绝，后续onShow仍会重试', async () => {
	let calls=0
	uni.setTabBarStyle=()=>++calls===1?Promise.reject(Error('not mounted')):Promise.resolve()
	const platform=await freshPlatform()
	platform.applyAppearance({appearance:'dark'});await sleep(135)
	platform.applyAppearance({appearance:'dark'});await sleep(135)
	assert.equal(calls,2)
})

test('旧主题桥接尚未完成时切回原主题，必须重新发送最终外观', async () => {
	const colors=[]
	let resolveOld
	uni.setTabBarStyle=o=>{
		colors.push(o.backgroundColor)
		return o.backgroundColor==='#17212B'?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve()
	}
	const platform=await freshPlatform()
	platform.applyAppearance({appearance:'light'});await sleep(135)
	platform.applyAppearance({appearance:'dark'});await sleep(135)
	platform.applyAppearance({appearance:'light'});await sleep(135)
	resolveOld();await sleep(0)
	assert.deepEqual(colors,['#FFFFFF','#17212B','#FFFFFF'])
})

test('直接导出尚未读取的大对象，也完整保留复盘与练习会话',async()=>{
	const snapshots={original:{payload:'原始复盘'}}
	const sessions={original:{payload:'原始续练'}}
	stub.memory.set('nucpharm:v1:exam-snapshots',JSON.stringify(snapshots))
	stub.memory.set('nucpharm:v1:practice-sessions',JSON.stringify(sessions))
	const store=await freshStore();store.init()
	const data=store.exportPayload().data
	assert.deepEqual(data.examSnapshots,snapshots)
	assert.deepEqual(data.practiceSessions,sessions)
})

test('旧题库迁移前的归档包含尚未打开的复盘与续练数据',async()=>{
	stub.memory.set('nucpharm:v1:bank-version','0.9.0')
	stub.memory.set('nucpharm:v1:exam-snapshots','{"original":{"kept":true}}')
	stub.memory.set('nucpharm:v1:practice-sessions','{"original":{"kept":true}}')
	const store=await freshStore();store.init()
	const archive=JSON.parse(stub.get('nucpharm:v1:migration-archive:0.9.0')).data
	assert.deepEqual(archive.examSnapshots,{original:{kept:true}})
	assert.deepEqual(archive.practiceSessions,{original:{kept:true}})
})
