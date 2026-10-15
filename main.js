import App from './App'
import { finishStartup } from './core/startup.js'

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
	...App
})
app.$mount()
// #endif

// #ifdef VUE3
import {
	createSSRApp
} from 'vue'
export function createApp() {
	const app = createSSRApp(App)
	// 所有入口页共用首屏关闭时机，包括直接恢复到考试/复盘页的入口。
	app.mixin({
		onReady() {
			this.$nextTick(() => finishStartup())
		}
	})
	return {
		app
	}
}
// #endif
